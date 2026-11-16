"""Datos que viajan dentro de cada master que sale de Diablo Master Mix (descargas y paquete de lanzamiento).

Siempre llevan el crédito "Mastered with Diablo Master Mix" (en inglés, el estándar que leen plataformas y
reproductores en cualquier país), más título, banda, álbum, número de tema, año y, si la cargaron, la letra.
El tema y sus derechos son de la banda: el crédito solo dice dónde se hizo el master.
  - WAV: campos INFO y BWF (los escribe ffmpeg al convertir).
  - FLAC: comentarios Vorbis (TITLE, ARTIST, LYRICS, COMMENT...).
  - MP3: ID3v2.3 con la letra en USLT, que es donde la buscan iTunes, Apple Music y los celulares.
"""
import hashlib
import json
from pathlib import Path

CREDIT = "Mastered with Diablo Master Mix"
SITE = "diablomastermix.com.ar"
COMMENT = f"{CREDIT} · {SITE}"
_LANG3 = {"es": "spa", "en": "eng", "pt": "por", "it": "ita", "fr": "fra", "de": "deu"}


def build(title: str, artist: str, album: str | None = None, track: int | None = None,
          year: int | None = None, lyrics_text: str | None = None, lyrics_lang: str | None = None) -> dict:
    t = {"title": title or "", "artist": artist or "", "comment": COMMENT, "encoded_by": "Diablo Master Mix"}
    if album:
        t["album"] = album
    if track:
        t["track"] = str(track)
    if year:
        t["date"] = str(year)
    if lyrics_text:
        t["lyrics"] = lyrics_text.strip()
        t["lyrics_lang"] = _LANG3.get((lyrics_lang or "")[:2], "und")
    return t


def signature(t: dict) -> str:
    """Huella corta de los datos: si cambia la letra o el título, el archivo en caché se vuelve a generar."""
    return hashlib.sha1(json.dumps(t, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:8]


def ffmpeg_args(t: dict, fmt: str) -> list[str]:
    """Argumentos de ffmpeg para WAV (INFO + BWF). MP3 y FLAC se etiquetan después con write()."""
    if fmt != "wav":
        return []
    args = []
    for k in ("title", "artist", "album", "track", "date", "comment", "encoded_by"):
        if t.get(k):
            args += ["-metadata", f"{k}={t[k]}"]
    args += ["-write_bext", "1", "-metadata", f"originator={t['encoded_by'][:32]}",
             "-metadata", f"description={CREDIT}"]
    return args


def write(path: Path, fmt: str, t: dict):
    """Escribe los datos en un MP3 o FLAC ya generado."""
    if fmt == "mp3":
        from mutagen.id3 import COMM, ID3, TALB, TDRC, TENC, TIT2, TPE1, TRCK, USLT, ID3NoHeaderError
        try:
            tag = ID3(str(path))
        except ID3NoHeaderError:
            tag = ID3()
        for key in ("TXXX:lyrics", "COMM", "USLT", "TSSE"):
            tag.delall(key)
        tag.add(TIT2(encoding=3, text=t.get("title", "")))
        tag.add(TPE1(encoding=3, text=t.get("artist", "")))
        if t.get("album"):
            tag.add(TALB(encoding=3, text=t["album"]))
        if t.get("track"):
            tag.add(TRCK(encoding=3, text=t["track"]))
        if t.get("date"):
            tag.add(TDRC(encoding=3, text=t["date"]))
        tag.add(TENC(encoding=3, text=t["encoded_by"]))
        tag.add(COMM(encoding=3, lang="eng", desc="", text=t["comment"]))
        if t.get("lyrics"):
            tag.add(USLT(encoding=3, lang=t.get("lyrics_lang", "und"), desc="", text=t["lyrics"]))
        tag.save(str(path), v2_version=3)
    elif fmt == "flac":
        from mutagen.flac import FLAC
        f = FLAC(str(path))
        names = {"title": "TITLE", "artist": "ARTIST", "album": "ALBUM", "track": "TRACKNUMBER", "date": "DATE",
                 "encoded_by": "ENCODED-BY", "lyrics": "LYRICS"}
        for k, tagname in names.items():
            if t.get(k):
                f[tagname] = t[k]
            elif tagname in f:
                del f[tagname]
        if "ENCODER" in f:
            del f["ENCODER"]
        f["COMMENT"] = t["comment"]
        f["DESCRIPTION"] = t["comment"]
        f.save()


def drop_stale(cached: Path, version_id: int, ext: str):
    """Borra las copias viejas del mismo master (con datos anteriores o sin datos) para no llenar el disco."""
    for f in cached.parent.glob(f"{version_id}.*{ext}"):
        stale = f.name == f"{version_id}.{ext}" or (f.name.count(".") == 2 and ".tmp" not in f.name)
        if f != cached and stale and f.suffix == f".{ext}":
            f.unlink(missing_ok=True)
