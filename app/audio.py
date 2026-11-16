import json
import subprocess
from pathlib import Path


class AudioError(Exception):
    pass


def _run(cmd: list[str]) -> str:
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise AudioError(res.stderr[-800:] or "ffmpeg fallo")
    return res.stdout


def to_flac(src: Path, dst: Path):
    _run(["ffmpeg", "-y", "-i", str(src), "-vn", "-c:a", "flac", "-compression_level", "8", str(dst)])


def to_preview(src: Path, dst: Path):
    """AAC en m4a: suena en cualquier navegador y celular."""
    _run(["ffmpeg", "-y", "-i", str(src), "-vn", "-c:a", "aac", "-b:a", "128k",
          "-movflags", "+faststart", str(dst)])


def duration(path: Path) -> float:
    out = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "json", str(path)])
    try:
        return float(json.loads(out)["format"]["duration"])
    except Exception:
        return 0.0


def convert(src_flac: Path, dst: Path, fmt: str, tags: dict | None = None):
    """Convierte el FLAC guardado al formato de descarga. Con tags, el archivo lleva adentro el crédito,
    los datos del tema y la letra (ver app/tags.py)."""
    from . import tags as tg
    extra = tg.ffmpeg_args(tags, fmt) if tags else []
    if fmt == "wav":
        _run(["ffmpeg", "-y", "-i", str(src_flac), "-map_metadata", "-1", *extra, "-c:a", "pcm_s24le", str(dst)])
    elif fmt == "mp3":
        _run(["ffmpeg", "-y", "-i", str(src_flac), "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "320k",
              "-id3v2_version", "3", str(dst)])
    elif fmt == "flac":
        if not tags:
            raise AudioError("flac ya es el formato guardado")
        _run(["ffmpeg", "-y", "-i", str(src_flac), "-map_metadata", "-1", "-c:a", "copy", str(dst)])
    else:
        raise AudioError(f"formato no soportado: {fmt}")
    if tags and fmt in ("mp3", "flac"):
        tg.write(dst, fmt, tags)


def cut_reference(src: Path, dst: Path, seconds: int):
    """Guarda un fragmento central de la referencia, en FLAC."""
    dur = duration(src)
    start = max(0.0, dur / 2 - seconds / 2)
    _run(["ffmpeg", "-y", "-ss", f"{start:.2f}", "-t", str(seconds), "-i", str(src),
          "-vn", "-c:a", "flac", str(dst)])
