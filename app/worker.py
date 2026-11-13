import json
import logging
import shutil
import tempfile
import threading
import time
from datetime import timedelta
from pathlib import Path

import numpy as np
import soundfile as sf

from . import align, audio, masterjob
from .config import DATA_DIR
from .notify import notify_band
from .db import Genre, Job, Reference, SessionLocal, Track, Version, now

log = logging.getLogger("worker")


def version_dir(band_id: int, track_id: int) -> Path:
    d = DATA_DIR / "bands" / str(band_id) / str(track_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def remove_version_files(version: Version):
    for p in (version.flac_path, version.preview_path):
        if p:
            Path(p).unlink(missing_ok=True)
    for f in (DATA_DIR / "cache").glob(f"{version.id}.*"):
        f.unlink(missing_ok=True)
    for f in (DATA_DIR / "analysis").glob(f"{version.id}.*"):
        f.unlink(missing_ok=True)


def _finish_version(db, version: Version, source: Path):
    """Convierte la fuente a FLAC + preview y marca la version como lista."""
    track = db.get(Track, version.track_id)
    out_dir = version_dir(track.band_id, track.id)
    flac = out_dir / f"{version.id}.flac"
    preview = out_dir / f"{version.id}.m4a"
    audio.to_flac(source, flac)
    audio.to_preview(flac, preview)
    version.flac_path = str(flac)
    version.preview_path = str(preview)
    version.size_bytes = flac.stat().st_size + preview.stat().st_size
    version.duration = audio.duration(flac)
    version.status = "ready"
    version.error = None


def process_ingest(db, job: Job):
    payload = json.loads(job.payload)
    version = db.get(Version, job.version_id)
    src = Path(payload["tmp_path"])
    try:
        _finish_version(db, version, src)
    finally:
        src.unlink(missing_ok=True)
    if payload.get("then_master"):
        _queue_master_after(db, version, payload["then_master"])


def _queue_master_after(db, version: Version, then: dict):
    """Encola el master apenas termina de procesarse el audio (opcion 'subir y masterizar')."""
    track = db.get(Track, version.track_id)
    opts = masterjob.normalize(then)
    if opts["reference_id"]:
        ref = db.get(Reference, opts["reference_id"])
        if not ref or ref.band_id not in (None, track.band_id):
            opts["reference_id"] = None
    v = Version(track_id=track.id, kind="master", label=masterjob.label_for(db, opts), status="processing",
                created_by=version.created_by)
    db.add(v)
    db.flush()
    db.add(Job(kind="master", version_id=v.id, created_by=version.created_by, payload=json.dumps(opts)))
    db.commit()


def _sum_stems(stems: list[Version], dst: Path, gains: dict | None = None, offsets_ms: dict | None = None):
    mix = None
    sr = None
    for v in stems:
        data, rate = sf.read(v.flac_path, always_2d=True)
        g = (gains or {}).get(str(v.id), 0.0)
        if g:
            data = data * (10 ** (g / 20))
        sr = sr or rate
        ms = (offsets_ms or {}).get(str(v.id), 0.0)       # corrección de desfase: + atrasa, − adelanta
        if ms:
            data = align.shift(data, int(round(ms * rate / 1000.0)))
        if mix is None:
            mix = data
        else:
            n = max(len(mix), len(data))
            if mix.shape[1] != data.shape[1]:
                ch = max(mix.shape[1], data.shape[1])
                mix = np.repeat(mix, ch, axis=1)[:, :ch] if mix.shape[1] == 1 else mix
                data = np.repeat(data, ch, axis=1)[:, :ch] if data.shape[1] == 1 else data
            mix = np.pad(mix, ((0, n - len(mix)), (0, 0)))
            data = np.pad(data, ((0, n - len(data)), (0, 0)))
            mix = mix + data
    peak = float(np.max(np.abs(mix)))
    if peak > 0.98:
        mix = mix * (0.98 / peak)
    sf.write(dst, mix, sr, subtype="PCM_24")


def _pick_source(track: Track, tmp: Path, gains: dict | None = None, offsets_ms: dict | None = None) -> Path:
    ready = [v for v in track.versions if v.status == "ready"]
    mixes = [v for v in ready if v.kind == "mix"]
    if mixes:
        return Path(mixes[-1].flac_path)
    stems = [v for v in ready if v.kind == "stem"]
    if stems:
        dst = tmp / "suma_stems.wav"
        _sum_stems(stems, dst, gains, offsets_ms)
        return dst
    raws = [v for v in ready if v.kind == "raw"]
    if raws:
        return Path(raws[-1].flac_path)
    raise RuntimeError("El tema no tiene audio listo para masterizar")


def process_master(db, job: Job):
    from . import engine  # import tardio: scipy/pedalboard son pesados

    opts = masterjob.normalize(json.loads(job.payload))
    version = db.get(Version, job.version_id)
    track = db.get(Track, version.track_id)

    with tempfile.TemporaryDirectory(dir=DATA_DIR / "tmp") as tmpdir:
        tmp = Path(tmpdir)
        source = _pick_source(track, tmp, opts["stem_gains"], opts.get("stem_offsets_ms"))

        reference = None
        ref_name = None
        if opts["reference_id"]:
            ref = db.get(Reference, opts["reference_id"])
            if ref is None:
                raise RuntimeError("La referencia ya no existe")
            reference, ref_name = Path(ref.path), ref.name

        settings, gname = masterjob.build_settings(db, opts, reference)
        out = tmp / "master.wav"
        report = engine.master(source, out, settings)
        report["reference"] = ref_name
        report["genre"] = gname or None
        report["options"] = opts
        _finish_version(db, version, out)
        rep = DATA_DIR / "analysis" / f"{version.id}.master.json"
        rep.parent.mkdir(parents=True, exist_ok=True)
        rep.write_text(json.dumps(report, ensure_ascii=False))
        notify_band(db, track.band_id, f'El master de "{track.title}" está listo',
                    kind="master", link=f"#/band/{track.band_id}/{track.section}")
        db.commit()


def claim_job(db) -> Job | None:
    job = db.query(Job).filter(Job.status == "queued").order_by(Job.id).first()
    if job:
        job.status = "running"
        db.commit()
    return job


def run_job(job_id: int):
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        version = db.get(Version, job.version_id) if job.version_id else None
        try:
            if job.kind == "ingest":
                process_ingest(db, job)
            elif job.kind == "master":
                process_master(db, job)
            else:
                raise RuntimeError(f"tipo de job desconocido: {job.kind}")
            job.status = "done"
        except Exception as e:  # noqa: BLE001
            log.exception("job %s fallo", job_id)
            job.status = "error"
            job.error = str(e)[:1000]
            if version is not None:
                version.status = "error"
                version.error = job.error
        job.finished_at = now()
        db.commit()


def cleanup_expired():
    """Borra ensayos crudos vencidos y sus archivos; elimina temas que quedan vacios."""
    with SessionLocal() as db:
        expired = db.query(Version).filter(Version.expires_at != None,  # noqa: E711
                                           Version.expires_at < now()).all()
        for v in expired:
            track = db.get(Track, v.track_id)
            remove_version_files(v)
            db.delete(v)
            db.flush()
            if track and not db.query(Version).filter(Version.track_id == track.id).count():
                shutil.rmtree(DATA_DIR / "bands" / str(track.band_id) / str(track.id), ignore_errors=True)
                db.delete(track)
        # jobs viejos
        old = now() - timedelta(days=30)
        db.query(Job).filter(Job.finished_at != None, Job.finished_at < old).delete()  # noqa: E711
        db.commit()
        # temporales huerfanos (> 1 dia)
        limit = time.time() - 86400
        for f in (DATA_DIR / "tmp").iterdir():
            try:
                if f.is_file() and f.stat().st_mtime < limit:
                    f.unlink()
            except OSError:
                pass


class Worker(threading.Thread):
    """Un solo hilo: procesa de a un job para no saturar el VPS."""

    def __init__(self):
        super().__init__(daemon=True, name="audio-worker")
        self.stop_event = threading.Event()
        self.wake = threading.Event()

    def run(self):
        with SessionLocal() as db:
            db.query(Job).filter(Job.status == "running").update({"status": "queued"})
            db.commit()
        last_cleanup = 0.0
        while not self.stop_event.is_set():
            if time.time() - last_cleanup > 3600:
                try:
                    cleanup_expired()
                except Exception:  # noqa: BLE001
                    log.exception("limpieza fallo")
                try:  # por si se perdio un aviso de Mercado Pago: se pregunta el estado de las suscripciones por vencer
                    from . import billing
                    with SessionLocal() as bdb:
                        billing.reconcile_all(bdb)
                    with SessionLocal() as bdb:
                        billing.purge_due(bdb)
                    with SessionLocal() as bdb:
                        billing.expire_unpaid(bdb)
                except Exception:  # noqa: BLE001
                    log.exception("reconciliacion de cobros fallo")
                last_cleanup = time.time()
            with SessionLocal() as db:
                job = claim_job(db)
                job_id = job.id if job else None
            if job_id:
                run_job(job_id)
            else:
                self.wake.wait(timeout=3)
                self.wake.clear()

    def stop(self):
        self.stop_event.set()
        self.wake.set()


worker = Worker()
