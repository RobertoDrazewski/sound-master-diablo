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


def convert(src_flac: Path, dst: Path, fmt: str):
    if fmt == "wav":
        _run(["ffmpeg", "-y", "-i", str(src_flac), "-c:a", "pcm_s24le", str(dst)])
    elif fmt == "mp3":
        _run(["ffmpeg", "-y", "-i", str(src_flac), "-c:a", "libmp3lame", "-b:a", "320k", str(dst)])
    elif fmt == "flac":
        raise AudioError("flac ya es el formato guardado")
    else:
        raise AudioError(f"formato no soportado: {fmt}")


def cut_reference(src: Path, dst: Path, seconds: int):
    """Guarda un fragmento central de la referencia, en FLAC."""
    dur = duration(src)
    start = max(0.0, dur / 2 - seconds / 2)
    _run(["ffmpeg", "-y", "-ss", f"{start:.2f}", "-t", str(seconds), "-i", str(src),
          "-vn", "-c:a", "flac", str(dst)])
