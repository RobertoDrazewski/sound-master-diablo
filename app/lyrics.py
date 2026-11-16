"""Letras de los temas: se guardan por tema (texto + tiempo de cada línea) y se pueden detectar escuchando el tema.

La detección usa faster-whisper en la CPU del servidor (sin servicios externos ni costo). Corre en la misma cola
que los masters, de a un trabajo por vez, y libera la memoria al terminar. El modelo se descarga una sola vez
en DATA_DIR/models. Con voces muy gritadas o tapadas por la banda puede equivocarse: por eso siempre se revisa
en el editor antes de publicar.
"""
import gc
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .config import DATA_DIR, LYRICS_MODEL

MAX_LINES = 400
# frases que Whisper inventa cuando escucha música sin voz: se descartan
_HALLUCINATIONS = re.compile(
    r"(amara\.org|subt[ií]tulos|subtitles by|gracias por ver|thanks for watching|suscr[ií]bete|"
    r"m[uú]sica de fondo|♪+$|^\W*$)", re.I)


def path(track_id: int) -> Path:
    return DATA_DIR / "lyrics" / f"{track_id}.json"


def read(track_id: int) -> dict:
    f = path(track_id)
    if f.exists():
        try:
            return json.loads(f.read_text())
        except ValueError:
            pass
    return {"lines": [], "status": "none"}


def write(track_id: int, data: dict) -> dict:
    f = path(track_id)
    f.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    tmp = f.with_name(f"{track_id}.{uuid.uuid4().hex[:6]}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False))
    tmp.replace(f)
    return data


def clean_lines(lines: list[dict]) -> list[dict]:
    out = []
    for ln in lines[:MAX_LINES]:
        text = re.sub(r"\s+", " ", str(ln.get("text") or "")).strip()[:300]
        t = ln.get("t")
        try:
            t = round(float(t), 2) if t is not None and float(t) >= 0 else None
        except (TypeError, ValueError):
            t = None
        if text:
            out.append({"t": t, "text": text})
    return out


def _fmt(t: float) -> str:
    cs = int(round(t * 100))
    return f"{cs // 6000:02d}:{(cs // 100) % 60:02d}.{cs % 100:02d}"


def to_txt(lines: list[dict]) -> str:
    return "\n".join(ln["text"] for ln in lines) + ("\n" if lines else "")


def to_lrc(lines: list[dict], title: str = "", artist: str = "") -> str:
    """LRC sincronizado (el formato que acepta Musixmatch). Solo las líneas que tienen tiempo."""
    head = []
    if title:
        head.append(f"[ti:{title}]")
    if artist:
        head.append(f"[ar:{artist}]")
    body = [f"[{_fmt(ln['t'])}]{ln['text']}" for ln in lines if ln.get("t") is not None]
    return "\n".join(head + body) + "\n" if body else ""


LANGUAGES = ("es", "en", "pt", "it", "fr", "de")


def _load_16k(audio_path: Path):
    """Decodifica con ffmpeg a 16 kHz mono (lo que escucha Whisper). Así no depende del decodificador
    interno de faster-whisper, que se rompe cuando cambia la versión de PyAV."""
    import subprocess

    import numpy as np
    res = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(audio_path), "-ac", "1", "-ar", "16000",
                          "-f", "f32le", "-"], capture_output=True, timeout=900)
    if res.returncode != 0 or not res.stdout:
        raise RuntimeError("No se pudo leer el audio del tema")
    return np.frombuffer(res.stdout, dtype=np.float32).copy()


def language_code(value: str | None) -> str | None:
    """Idioma elegido por la banda para la detección; None = que lo reconozca solo."""
    v = (value or "").strip().lower()[:2]
    return v if v in LANGUAGES else None


def transcribe(audio_path: Path, language: str | None = None, clean_vocals: bool = False,
               on_progress=None) -> tuple[list[dict], str]:
    """Escucha el tema y devuelve (líneas con tiempo, idioma). Si la banda eligió el idioma se usa ese;
    si no, lo reconoce solo (sirve para canciones en cualquier idioma).

    clean_vocals: True cuando se escucha la pista de voz sola; ahí el filtro de voz ayuda a saltear silencios.
    Con la banda sonando ese filtro (pensado para voz hablada) descarta el canto, así que no se usa.
    on_progress(líneas_hasta_ahora, fracción 0..1) se llama a medida que avanza."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("La detección de letra no está instalada en este servidor") from None
    import time
    samples = _load_16k(audio_path)
    duration = max(1.0, len(samples) / 16000)
    models = DATA_DIR / "models"
    models.mkdir(parents=True, exist_ok=True)
    model = WhisperModel(LYRICS_MODEL, device="cpu", compute_type="int8", download_root=str(models), cpu_threads=4)
    try:
        opts = dict(beam_size=5, condition_on_previous_text=False, word_timestamps=True,
                    language=language_code(language), hallucination_silence_threshold=2.0)
        if clean_vocals:
            opts.update(vad_filter=True, vad_parameters={"threshold": 0.3, "min_silence_duration_ms": 1000})
        segments, info = model.transcribe(samples, **opts)
        lines, cur, start, last_end = [], [], None, None
        last_report = 0.0

        def flush():
            nonlocal cur, start
            text = " ".join(w.strip() for w in cur).strip()
            text = re.sub(r"\s+([,.!?;:])", r"\1", text)
            if text and not _HALLUCINATIONS.search(text):
                lines.append({"t": round(start, 2), "text": text})
            cur, start = [], None

        if on_progress:
            on_progress([], 0.01)
        for seg in segments:
            # partes sin voz donde el modelo igual "escribe" algo: se descartan
            dudoso = (seg.no_speech_prob > 0.6 and seg.avg_logprob < -1.0) or seg.compression_ratio > 3.0
            for w in ([] if dudoso else (seg.words or [])):
                word = w.word.strip()
                if not word:
                    continue
                # línea nueva si hay una pausa; si la línea ya es larga, corta en la primera micro-pausa
                # (así no quedan palabras sueltas al final) y como máximo a las 14 palabras
                gap = w.start - (last_end if last_end is not None else w.start)
                if cur and (gap > 0.7 or (len(cur) >= 9 and gap >= 0.15) or len(cur) >= 14):
                    flush()
                if start is None:
                    start = w.start
                cur.append(word)
                last_end = w.end
                if word[-1:] in ".!?":
                    flush()
            if cur:
                flush()
            if on_progress and time.monotonic() - last_report > 1.5:
                last_report = time.monotonic()
                on_progress(list(lines), min(0.99, seg.end / duration))
            if len(lines) >= MAX_LINES:
                break
        return lines[:MAX_LINES], getattr(info, "language", "") or ""
    finally:
        del model
        gc.collect()
