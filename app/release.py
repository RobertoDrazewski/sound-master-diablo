"""Paquete de lanzamiento: masters en WAV y MP3, tapa grande y una guia para publicar o prensar."""
import threading
import time
import uuid
import zipfile
from pathlib import Path

from . import audio

_lock = threading.Lock()
_state: dict[int, dict] = {}
KEEP_HOURS = 24


def zip_path(data_dir: Path, album_id: int) -> Path:
    return data_dir / "cache" / "release" / f"{album_id}.zip"


def state(album_id: int) -> dict:
    with _lock:
        st = dict(_state.get(album_id) or {"status": "none"})
    if st["status"] == "none":
        # si el servidor se reinicio pero el paquete sigue en disco
        from .config import DATA_DIR
        p = zip_path(DATA_DIR, album_id)
        if p.exists():
            st = {"status": "ready", "size_mb": round(p.stat().st_size / 1e6, 1), "built_at": int(p.stat().st_mtime)}
    return st


def _set(album_id: int, **kw):
    with _lock:
        _state.setdefault(album_id, {"status": "none"}).update(kw)


def _fmt_time(sec: float) -> str:
    sec = int(round(sec))
    return f"{sec // 60}:{sec % 60:02d}"


def _guide(meta: dict, cover_px: int) -> str:
    tl = "\n".join(f"  {i:02d}. {t['title']}  ({_fmt_time(t['duration'])})" for i, t in enumerate(meta["tracks"], 1))
    total = sum(t["duration"] for t in meta["tracks"])
    year = f" ({meta['year']})" if meta.get("year") else ""
    if cover_px == 0:
        cover_note = "Este álbum todavía no tiene tapa: agregala en Álbumes antes de subirlo a una plataforma."
    elif cover_px < 3000:
        cover_note = (f"La tapa original mide {cover_px} px; la agrandamos a 3000 px. Si tu distribuidora o la planta de prensado "
                      "pide más calidad, subí una imagen propia de 3000 x 3000 px o más.")
    else:
        cover_note = "La tapa está en 3000 x 3000 px."
    return f"""{meta['album']}{year} - {meta['band']}
{'=' * 60}

TEMAS
{tl}

Duración total: {_fmt_time(total)}

QUÉ HAY EN ESTA CARPETA
  wav-24bit/   Los masters en WAV 24 bits. Es el archivo para subir a las plataformas y para prensar.
  mp3-320/     Los mismos temas en MP3 320 kbps, para compartir, escuchar en el celular o subir a redes.
  tapa/        La tapa cuadrada en JPG. {cover_note}
  tracklist.csv  Orden y duración de los temas.

CÓMO PUBLICAR EN SPOTIFY, APPLE MUSIC, YOUTUBE MUSIC Y OTRAS
  Estas plataformas no reciben música directo de las bandas: se sube a través de una distribuidora
  (por ejemplo DistroKid, TuneCore, CD Baby o Amuse). Pasos:
  1. Creá una cuenta en la distribuidora que elijas y compará precios: algunas cobran por año y otras por lanzamiento.
  2. Cargá la tapa y los WAV de wav-24bit/ en el orden de tracklist.csv.
  3. Completá el nombre de la banda, el título, el año, el género y los autores de cada tema.
  4. La distribuidora asigna los códigos ISRC (uno por tema) y UPC (uno por álbum). No hace falta que los generes vos.
  5. Elegí la fecha de salida. Conviene dejar al menos dos semanas antes para poder pedir un lugar en las listas de Spotify for Artists.
  Revisá los requisitos actuales de la distribuidora, porque cambian.

CÓMO PUBLICAR EN BANDCAMP
  Bandcamp sí recibe música directo de la banda. Creá la cuenta, elegí "Add album" y subí los WAV de wav-24bit/.
  La tapa va en la misma pantalla. Ahí ponés el precio, o "name your price" si querés que cada uno elija cuánto pagar.

CÓMO PRENSAR UN DISCO (LP) O UN CD
  1. Pedí presupuesto a una o dos plantas de prensado. Preguntales qué formato de audio y qué tapa necesitan.
  2. Para vinilo, cada lado dura entre 18 y 22 minutos como máximo para que suene bien. Si el álbum dura {_fmt_time(total)},
     vas a tener que decidir qué temas van en el lado A y cuáles en el B.
  3. Las plantas suelen pedir los WAV de wav-24bit/ separados por lado, más una prueba de prensado antes de la tirada.
  4. Para el CD, además del audio piden los códigos de barra (UPC) y la plantilla de la tapa.

ANTES DE PUBLICAR
  - Escuchá el álbum entero una vez, de principio a fin, con auriculares.
  - Revisá que no haya samples ni covers sin permiso.
  - Si el álbum incluye un tema de otra persona, necesitás su autorización.
"""


def _build(album_id: int, meta: dict, data_dir: Path):
    out = zip_path(data_dir, album_id)
    out.parent.mkdir(parents=True, exist_ok=True)
    cache = data_dir / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    tracks = meta["tracks"]
    total_steps = len(tracks) * 2 + 2
    done = 0
    root = f"{_safe(meta['album'])} - lanzamiento"
    partial = out.with_name(f"{album_id}.{uuid.uuid4().hex[:6]}.part")
    try:
        with zipfile.ZipFile(partial, "w", zipfile.ZIP_STORED) as z:
            for i, t in enumerate(tracks, 1):
                base = f"{i:02d} - {_safe(t['title'])}"
                for ext, folder in (("wav", "wav-24bit"), ("mp3", "mp3-320")):
                    _set(album_id, status="building", step=f"Tema {i} de {len(tracks)} ({ext.upper()})", done=done, total=total_steps)
                    cached = cache / f"{t['version_id']}.{ext}"
                    if not cached.exists():
                        tmp = cached.with_name(f"{t['version_id']}.tmp{uuid.uuid4().hex[:6]}.{ext}")
                        try:
                            audio.convert(Path(t["flac"]), tmp, ext)
                        except Exception:
                            tmp.unlink(missing_ok=True)
                            raise
                        tmp.replace(cached)
                    z.write(cached, f"{root}/{folder}/{base}.{ext}")
                    done += 1
            _set(album_id, step="Tapa", done=done, total=total_steps)
            cover_px = 0
            if meta.get("cover"):
                from PIL import Image
                im = Image.open(meta["cover"]).convert("RGB")
                cover_px = min(im.size)
                if cover_px < 3000:
                    im = im.resize((3000, 3000), Image.LANCZOS)
                tmpc = data_dir / "tmp" / f"{uuid.uuid4().hex}.jpg"
                tmpc.parent.mkdir(parents=True, exist_ok=True)
                im.save(tmpc, "JPEG", quality=95, optimize=True)
                z.write(tmpc, f"{root}/tapa/tapa-3000x3000.jpg")
                tmpc.unlink(missing_ok=True)
            done += 1
            _set(album_id, step="Guía", done=done, total=total_steps)
            csv = "orden,titulo,duracion\n" + "\n".join(
                f'{i},"{t["title"].replace(chr(34), "")}",{_fmt_time(t["duration"])}' for i, t in enumerate(tracks, 1))
            z.writestr(f"{root}/tracklist.csv", csv)
            z.writestr(f"{root}/LEEME.txt", _guide(meta, cover_px))
            done += 1
        partial.replace(out)
        _set(album_id, status="ready", step="", done=total_steps, total=total_steps,
             size_mb=round(out.stat().st_size / 1e6, 1), built_at=int(time.time()), error=None)
    except Exception as e:  # noqa: BLE001
        partial.unlink(missing_ok=True)
        _set(album_id, status="error", error=str(e)[:300])


def _safe(text: str) -> str:
    import re
    return (re.sub(r"[^\w\- .()]", "", text, flags=re.UNICODE).strip() or "sin-nombre")[:90]


def _cleanup(data_dir: Path):
    folder = data_dir / "cache" / "release"
    if not folder.exists():
        return
    limit = time.time() - KEEP_HOURS * 3600
    for p in folder.iterdir():
        try:
            if p.stat().st_mtime < limit:
                p.unlink()
        except OSError:
            pass


def start(album_id: int, meta: dict, data_dir: Path):
    _cleanup(data_dir)
    with _lock:
        if (_state.get(album_id) or {}).get("status") == "building":
            return
        _state[album_id] = {"status": "building", "step": "Preparando", "done": 0, "total": len(meta["tracks"]) * 2 + 2}
    threading.Thread(target=_build, args=(album_id, meta, data_dir), daemon=True).start()
