"""Alineación de pistas separadas: mide si alguna suena corrida en el tiempo respecto de la batería
(por ejemplo, un bajo o una guitarra grabados con latencia) y permite corregirlo con un desplazamiento fijo.

Se compara cuándo "pega" cada pista (los ataques) contra la pista de referencia, no el contenido de la señal,
así funciona aunque suenen muy distinto. Solo corrige un desfase constante: no cambia el tempo ni toca el groove."""
import re

import numpy as np
import soundfile as sf

MAX_MS = 150.0          # el desfase máximo que se busca (y que se permite corregir)
WINDOW_S = 90           # se analiza el tramo central: alcanza y es rápido
HOP_MS = 1.0
MIN_CONF = 0.25         # por debajo, la medición no es confiable y no se propone corrección
DRUM_RE = re.compile(r"bater|drum|kick|bombo|redo|snare|tom|over|hat|perc|\bdm\b", re.I)


def read_window(path, seconds: float = WINDOW_S):
    """Tramo central del archivo, siempre el mismo para todas las pistas del tema."""
    info = sf.info(str(path))
    n = int(seconds * info.samplerate)
    start = max(0, (info.frames - n) // 2)
    data, sr = sf.read(str(path), start=start, frames=n, always_2d=True)
    return data.mean(axis=1), sr, start


def _onsets(x: np.ndarray, sr: int) -> np.ndarray:
    hop = max(1, int(sr * HOP_MS / 1000))
    n = len(x) // hop
    if n < 200:
        return np.zeros(1)
    e = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)
    lg = np.log1p(e * 60.0)
    d = np.maximum(0.0, np.diff(lg, prepend=lg[0]))
    k = 25                                               # saca el piso lento: quedan solo los ataques
    base = np.convolve(d, np.ones(k) / k, mode="same")
    d = np.maximum(0.0, d - base)
    return d


def _lag(ref: np.ndarray, sig: np.ndarray) -> tuple[float, float]:
    """(ms que `sig` llega tarde respecto de `ref`, confianza 0..1)."""
    n = min(len(ref), len(sig))
    a, b = ref[:n] - ref[:n].mean(), sig[:n] - sig[:n].mean()
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-9 or nb < 1e-9:
        return 0.0, 0.0
    size = 1 << (2 * n - 1).bit_length()
    c = np.fft.irfft(np.fft.rfft(b, size) * np.conj(np.fft.rfft(a, size)), size) / (na * nb)
    m = int(MAX_MS / HOP_MS)
    c = np.concatenate([c[-m:], c[:m + 1]])               # lags -m..+m
    i = int(np.argmax(c))
    peak = float(c[i])
    if 0 < i < len(c) - 1:                                # afina entre muestras
        y0, y1, y2 = c[i - 1], c[i], c[i + 1]
        den = y0 - 2 * y1 + y2
        off = 0.5 * (y0 - y2) / den if abs(den) > 1e-12 else 0.0
    else:
        off = 0.0
    spread = float(np.median(np.abs(c))) + 1e-9           # qué tan sobresale el pico del ruido
    conf = float(np.clip(peak * 2.0, 0, 1) * np.clip((peak / spread) / 8.0, 0, 1))
    return (i - m + off) * HOP_MS, conf


def pick_reference(items: list[dict]) -> int:
    """Índice de la pista de referencia: una de batería por el nombre; si no, la de ataques más marcados."""
    drums = [i for i, it in enumerate(items) if DRUM_RE.search(it["label"] or "")]
    pool = drums or list(range(len(items)))
    return max(pool, key=lambda i: float(items[i]["onsets"].sum()))


def measure(stems: list[tuple[int, str, str]]) -> dict:
    """stems: [(id, nombre, ruta flac)]. Devuelve la referencia y el desfase de cada pista."""
    items = []
    for vid, label, path in stems:
        x, sr, _ = read_window(path)
        items.append({"id": vid, "label": label, "onsets": _onsets(x, sr)})
    r = pick_reference(items)
    out = []
    for i, it in enumerate(items):
        if i == r:
            out.append({"id": it["id"], "label": it["label"], "late_ms": 0.0, "confidence": 1.0, "reference": True})
            continue
        ms, conf = _lag(items[r]["onsets"], it["onsets"])
        out.append({"id": it["id"], "label": it["label"], "late_ms": round(ms, 1),
                    "confidence": round(conf, 2), "reference": False,
                    "suggest": bool(conf >= MIN_CONF and abs(ms) >= 3.0)})
    return {"reference_id": items[r]["id"], "items": out}


def shift(data: np.ndarray, samples: int) -> np.ndarray:
    """Atrasa (n>0) o adelanta (n<0) la pista, sin cambiar su largo."""
    if samples == 0:
        return data
    n = len(data)
    out = np.zeros_like(data)
    if samples > 0:
        out[samples:] = data[:max(0, n - samples)]
    else:
        out[:n + samples] = data[-samples:]
    return out
