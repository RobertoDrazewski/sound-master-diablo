"""Traduce las opciones del 'Estudio de master' (y del master en un clic) a la configuracion del motor."""
from pathlib import Path

from . import engine, genres
from .db import Genre, Reference


def _f(v, lo, hi, default):
    try:
        return float(min(max(float(v), lo), hi))
    except (TypeError, ValueError):
        return default


def normalize(opts: dict) -> dict:
    """Valida y recorta lo que mando el cliente (se guarda en el Job y en el informe)."""
    tone = opts.get("tone") or {}
    gains = opts.get("stem_gains") or {}
    return {
        "genre_id": int(opts["genre_id"]) if opts.get("genre_id") else None,
        "reference_id": int(opts["reference_id"]) if opts.get("reference_id") else None,
        "lufs": _f(opts.get("lufs"), -24, -6, None) if opts.get("lufs") is not None else None,
        "strength": _f(opts.get("strength"), 0, 1, None) if opts.get("strength") is not None else None,
        "power": _f(opts.get("power"), 0, 1.5, 1.0),
        "width": _f(opts.get("width"), 0.5, 1.6, 1.0),
        "tone": {k: _f(tone.get(k), -4, 4, 0.0) for k in ("bass", "body", "presence", "air")},
        "auto_balance": bool(opts.get("auto_balance", True)),
        "drums_db": _f(opts.get("drums_db"), -8, 6, 0.0),
        "bass_db": _f(opts.get("bass_db"), -8, 6, 0.0),
        "voice_db": _f(opts.get("voice_db"), -8, 6, 0.0),
        "stem_gains": {str(k): _f(v, -18, 12, 0.0) for k, v in list(gains.items())[:60]},
        "stem_offsets_ms": {str(k): round(_f(v, -150, 150, 0.0), 1)
                            for k, v in list((opts.get("stem_offsets_ms") or {}).items())[:60] if _f(v, -150, 150, 0.0)},
    }


def build_settings(db, opts: dict, reference: Path | None) -> tuple[engine.Settings, str]:
    """Devuelve (Settings, nombre del genero)."""
    s = engine.Settings()
    gname = ""
    g = db.get(Genre, opts["genre_id"]) if opts.get("genre_id") else None
    if g:
        gname = g.name
        prof = genres.profile(g.name) or {}
        s.shape = list(prof.get("shape", s.shape))
        s.lufs = g.target_lufs
        s.comp = prof.get("comp", s.comp)
        s.sat = prof.get("sat", s.sat)
        s.width = prof.get("width", s.width)
        s.drums_target = prof.get("drums", s.drums_target)
        s.bass_target = prof.get("bass", s.bass_target)
    else:
        s.lufs = -14.0
    if opts.get("lufs") is not None:
        s.lufs = opts["lufs"]
    if opts.get("strength") is not None:
        s.strength = opts["strength"]
    s.comp_mult = opts.get("power", 1.0)
    s.width = s.width * opts.get("width", 1.0)
    s.tone = dict(opts.get("tone") or {})
    s.auto_balance = opts.get("auto_balance", True)
    s.drums_db, s.bass_db, s.voice_db = opts.get("drums_db", 0.0), opts.get("bass_db", 0.0), opts.get("voice_db", 0.0)
    s.reference = reference
    s.genre_name = gname
    return s, gname


def label_for(db, opts: dict) -> str:
    if opts.get("reference_id"):
        ref = db.get(Reference, opts["reference_id"])
        if ref:
            return f"master ref: {ref.name}"
    if opts.get("genre_id"):
        g = db.get(Genre, opts["genre_id"])
        if g:
            return f"master {g.name}"
    return "master"
