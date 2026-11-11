"""Motor de masterizacion de Diablo Master.

Es procesamiento de audio (DSP) puro: no usa inteligencia artificial ni servicios externos, no tiene costo.
Cadena, en este orden:
  1. Limpieza: filtro pasa-altos que saca el ruido grave inaudible.
  2. Equilibrio de instrumentos (opcional): separa de forma liviana percusion / graves / resto y ajusta cada grupo.
  3. Tono: EQ de fase lineal hacia la curva del genero (o hacia la de una referencia) + 4 perillas manuales.
  4. Dinamica: compresion en 3 bandas + compresor de "pegamento", sobre todo cuanto mas volumen se pide.
  5. Color: saturacion suave (calidez y densidad).
  6. Estereo: ancho ajustable y graves siempre en el centro.
  7. Volumen final: se mide en LUFS (norma ITU-R BS.1770) y se sube con un limitador de picos (-1 dBTP).
Devuelve un informe con el antes/despues y frases simples que explican que se hizo.
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import soundfile as sf
from pedalboard import Compressor, Pedalboard
from scipy import signal
from scipy.ndimage import gaussian_filter1d, median_filter, minimum_filter1d, uniform_filter1d

from .genres import ANCHORS

SR = 44100
BAND_FC = np.array([31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250,
                    1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000], dtype=float)
PIVOT = (BAND_FC >= 500) & (BAND_FC <= 2000)


class EngineError(RuntimeError):
    pass


# ------------------------------------------------------------------------------ entrada / salida

def decode(path: Path | str) -> np.ndarray:
    """Cualquier audio -> float32 estereo a 44.1 kHz, shape (muestras, 2)."""
    res = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, timeout=3600)
    if res.returncode != 0 or len(res.stdout) < SR * 4:
        raise EngineError("No se pudo leer el audio (o es demasiado corto)")
    data = np.frombuffer(res.stdout, dtype=np.float32)
    return data[: data.size // 2 * 2].reshape(-1, 2).copy()


# -------------------------------------------------------------------------------- mediciones

def _kw_sos() -> np.ndarray:
    """Ponderacion K de la norma BS.1770 (dos biquads) para 44.1 kHz."""
    g, q, f0 = 3.999843853973347, 0.7071752369554196, 1681.974450955533
    a = 10 ** (g / 40)
    w0 = 2 * np.pi * f0 / SR
    al, cw = np.sin(w0) / (2 * q), np.cos(w0)
    b0 = a * ((a + 1) + (a - 1) * cw + 2 * np.sqrt(a) * al)
    b1 = -2 * a * ((a - 1) + (a + 1) * cw)
    b2 = a * ((a + 1) + (a - 1) * cw - 2 * np.sqrt(a) * al)
    a0 = (a + 1) - (a - 1) * cw + 2 * np.sqrt(a) * al
    a1 = 2 * ((a - 1) - (a + 1) * cw)
    a2 = (a + 1) - (a - 1) * cw - 2 * np.sqrt(a) * al
    s1 = [b0 / a0, b1 / a0, b2 / a0, 1, a1 / a0, a2 / a0]
    f0, q = 38.13547087602444, 0.5003270373238773
    w0 = 2 * np.pi * f0 / SR
    al, cw = np.sin(w0) / (2 * q), np.cos(w0)
    b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
    a0, a1, a2 = 1 + al, -2 * cw, 1 - al
    s2 = [b0 / a0, b1 / a0, b2 / a0, 1, a1 / a0, a2 / a0]
    return np.array([s1, s2])


_KW = _kw_sos()


def lufs(x: np.ndarray) -> float:
    """Volumen integrado en LUFS (con las dos compuertas de la norma)."""
    y = signal.sosfilt(_KW, x, axis=0)
    n, step = int(0.4 * SR), int(0.1 * SR)
    if len(y) < n:
        y = np.pad(y, ((0, n - len(y)), (0, 0)))
    cs = np.vstack([np.zeros((1, y.shape[1])), np.cumsum(y.astype(np.float64) ** 2, axis=0)])
    starts = np.arange(0, len(y) - n + 1, step)
    e = ((cs[starts + n] - cs[starts]) / n).sum(axis=1)
    l = -0.691 + 10 * np.log10(e + 1e-12)
    keep = l > -70
    if not keep.any():
        return -70.0
    thr = -0.691 + 10 * np.log10(e[keep].mean()) - 10
    keep = l > max(thr, -70)
    if not keep.any():
        return -70.0
    return float(-0.691 + 10 * np.log10(e[keep].mean()))


def true_peak_db(x: np.ndarray) -> float:
    """Pico real (sobremuestreado 4x), por tramos con solapamiento para no gastar memoria ni medir los bordes del filtro."""
    peak = float(np.abs(x).max())
    seg, pad = SR * 8, 96
    xp = np.pad(x, ((pad, pad), (0, 0)), mode="reflect")
    for i in range(0, len(x), seg):
        y = signal.resample_poly(xp[i:i + min(seg, len(x) - i) + 2 * pad], 4, 1, axis=0)
        peak = max(peak, float(np.abs(y[pad * 4:pad * 4 + min(seg, len(x) - i) * 4]).max()))
    return 20 * np.log10(peak + 1e-9)


def _active(x: np.ndarray, floor_db: float = -35.0) -> np.ndarray:
    """Solo las partes donde se toca (saca silencios y charla entre temas), para medir el tono."""
    m = x.mean(axis=1)
    fr = SR // 2
    n = len(m) // fr
    if n < 4:
        return m
    rms = 10 * np.log10((m[: n * fr].reshape(n, fr) ** 2).mean(axis=1) + 1e-12)
    ok = rms > rms.max() + floor_db
    if ok.sum() < 3:
        return m
    return m[: n * fr].reshape(n, fr)[ok].reshape(-1)


def band_levels(x: np.ndarray) -> np.ndarray:
    """Nivel (dB, por Hz) en bandas de tercio de octava, solo en las partes activas."""
    f, p = signal.welch(_active(x), SR, window="hann", nperseg=16384, noverlap=8192)
    out = np.empty(len(BAND_FC))
    for i, fc in enumerate(BAND_FC):
        m = (f >= fc / 2 ** (1 / 6)) & (f < fc * 2 ** (1 / 6))
        out[i] = 10 * np.log10(p[m].mean() + 1e-20) if m.any() else -200.0
    return out


def neutral_target() -> np.ndarray:
    """Curva de referencia de un master moderno: cae unos 4.5 dB por octava (por Hz) y se aplana en graves."""
    f = np.maximum(BAND_FC, 90)
    t = -4.5 * np.log2(f / 1000)
    t = t + np.where(BAND_FC < 45, 6 * np.log2(BAND_FC / 45), 0)
    return t


def shape_to_bands(shape: list[float]) -> np.ndarray:
    return np.interp(np.log2(BAND_FC), np.log2(ANCHORS), shape)


def stereo_width_db(x: np.ndarray) -> float:
    m, s = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    return float(10 * np.log10(((s ** 2).mean() + 1e-12) / ((m ** 2).mean() + 1e-12)))


# -------------------------------------------------------- separacion liviana (percusion / armonico)

N_FFT, HOP = 2048, 512


def _stft(v):
    return signal.stft(v, SR, window="hann", nperseg=N_FFT, noverlap=N_FFT - HOP, boundary="zeros", padded=True)


def _istft(z, n):
    _, y = signal.istft(z, SR, window="hann", nperseg=N_FFT, noverlap=N_FFT - HOP, boundary=True)
    y = y[:n]
    return np.pad(y, (0, n - len(y))) if len(y) < n else y


def _harmonic_mask(mag: np.ndarray) -> np.ndarray:
    """Mascara suave: 1 = sonido sostenido (bajo, guitarras, voz), 0 = golpes (bateria)."""
    h = median_filter(mag, size=(1, 21), mode="reflect")
    p = median_filter(mag, size=(17, 1), mode="reflect")
    return h * h / (h * h + p * p + 1e-12)


def _low_mask(f: np.ndarray) -> np.ndarray:
    return (1 / (1 + np.exp((f - 190) / 40)))[:, None]


def _balance_chunk(chunk: np.ndarray, gp: float, gb: float, gm: float) -> np.ndarray:
    f, _, zm = _stft(chunk.mean(axis=1))
    mh = _harmonic_mask(np.abs(zm))
    low = _low_mask(f)
    gain = gp * (1 - mh) + gb * mh * low + gm * mh * (1 - low)
    out = np.empty_like(chunk)
    for c in range(2):
        _, _, z = _stft(chunk[:, c])
        out[:, c] = _istft(z * gain[:, : z.shape[1]], len(chunk))
    return out


def apply_balance(x: np.ndarray, drums_db: float, bass_db: float, voice_db: float) -> np.ndarray:
    gp, gb, gm = (10 ** (v / 20) for v in (drums_db, bass_db, voice_db))
    seg, ov = 30 * SR, 2 * SR
    n = len(x)
    if n <= seg + 2 * ov:
        return _balance_chunk(x, gp, gb, gm)
    out = np.zeros_like(x)
    pos = 0
    while pos < n:
        end = min(n, pos + seg + ov)
        if n - end < 2 * ov:
            end = n
        y = _balance_chunk(x[pos:end], gp, gb, gm)
        w = np.ones(end - pos, dtype=np.float32)
        if pos > 0:
            w[:ov] = np.linspace(0, 1, ov, endpoint=False)
        if end < n:
            w[-ov:] = np.linspace(1, 0, ov, endpoint=False)
        out[pos:end] += y * w[:, None]
        if end == n:
            break
        pos += seg
    return out


def measure_balance(x: np.ndarray) -> dict:
    """Cuanto pesa la percusion y el bajo respecto al resto en los medios (en dB), con unos fragmentos."""
    n = len(x)
    L = min(n, 12 * SR)
    pts = [0.0] if n <= L * 1.5 else [0.15, 0.4, 0.65, 0.85]
    rd, rb = [], []
    for p in pts:
        a = int(p * max(0, n - L))
        chunk = x[a:a + L]
        if (chunk ** 2).mean() < 1e-9:
            continue
        f, _, zm = _stft(chunk.mean(axis=1))
        mag = np.abs(zm)
        mh = _harmonic_mask(mag)
        pw = mag ** 2
        mid = ((f >= 500) & (f < 5000))[:, None]
        harm_mid = ((f >= 200) & (f < 5000))[:, None]
        low = (f < 200)[:, None]
        e_p = (pw * (1 - mh) * mid).sum()
        e_h = (pw * mh * harm_mid).sum()
        e_b = (pw * mh * low).sum()
        if e_h > 0 and e_p > 0 and e_b > 0:
            rd.append(10 * np.log10(e_p / e_h))
            rb.append(10 * np.log10(e_b / e_h))
    if not rd:
        return {"drums": None, "bass": None}
    return {"drums": float(np.median(rd)), "bass": float(np.median(rb))}


# ------------------------------------------------------------------------------------ tono (EQ)

def _tone_curve(tone: dict) -> np.ndarray:
    """Las 4 perillas manuales como curva de ganancia en las bandas."""
    lf = np.log2(BAND_FC)
    bump = lambda c, s: np.exp(-0.5 * ((lf - np.log2(c)) / s) ** 2)
    air = 1 / (1 + np.exp(-(lf - np.log2(8000)) * 2.5))
    g = (tone.get("bass", 0) * bump(80, .7) + tone.get("body", 0) * bump(320, .7)
         + tone.get("presence", 0) * bump(3500, .8) + tone.get("air", 0) * air)
    return g


def auto_eq(levels: np.ndarray, target: np.ndarray, strength: float, lo: float = -6.0, hi: float = 4.0) -> np.ndarray:
    """dB a mover en cada banda para acercar el tono al objetivo, suavizado y con tope."""
    off = levels[PIVOT].mean() - target[PIVOT].mean()
    dev = levels - target - off
    corr = -dev * strength
    corr[BAND_FC < 40] = 0
    corr[BAND_FC > 16500] = 0
    corr = gaussian_filter1d(corr, 1.6, mode="nearest")
    return np.clip(corr, lo, hi)


def apply_eq(x: np.ndarray, gains_db: np.ndarray) -> np.ndarray:
    """EQ de fase lineal (no corre las fases): la curva se sigue punto por punto."""
    f = np.concatenate([[0], BAND_FC, [SR / 2]])
    g = np.concatenate([[gains_db[0]], gains_db, [gains_db[-1]]])
    # pasa-altos suave en la curva: saca lo que hay por debajo de ~30 Hz
    hp = np.clip(np.log2(np.maximum(f, 1) / 22) / np.log2(32 / 22), 0, 1)
    lin = 10 ** (g / 20) * hp
    lin[0] = 0
    taps = signal.firwin2(8191, f, lin, fs=SR)
    return signal.oaconvolve(x, taps[:, None].astype(np.float32), mode="same", axes=0).astype(np.float32)


# ------------------------------------------------------------------------------------- dinamica

def _frame_db(v: np.ndarray, win: float = 0.1) -> np.ndarray:
    n = int(win * SR)
    k = len(v) // n
    if k < 3:
        return np.array([-60.0])
    d = 10 * np.log10((v[: k * n].reshape(k, n) ** 2).mean(axis=1) + 1e-12)
    return d[d > d.max() - 40]


def _comp(v: np.ndarray, thr: float, ratio: float, att: float, rel: float) -> np.ndarray:
    board = Pedalboard([Compressor(threshold_db=thr, ratio=ratio, attack_ms=att, release_ms=rel)])
    return board(np.ascontiguousarray(v.T), SR).T


def multiband_compress(x: np.ndarray, c: float) -> np.ndarray:
    """3 bandas (graves, medios, agudos) para que el bombo no apriete a las guitarras ni al reves."""
    lp = signal.butter(2, 140, "low", fs=SR, output="sos")
    hp = signal.butter(2, 3000, "high", fs=SR, output="sos")
    lo = signal.sosfiltfilt(lp, x, axis=0).astype(np.float32)
    hi = signal.sosfiltfilt(hp, x, axis=0).astype(np.float32)
    mid = x - lo - hi
    cfg = [(lo, 30, 160, 1.4 + 1.6 * c), (mid, 15, 120, 1.3 + 1.5 * c), (hi, 5, 80, 1.2 + 1.3 * c)]
    out = np.zeros_like(x)
    for band, att, rel, ratio in cfg:
        thr = float(np.percentile(_frame_db(band.mean(axis=1)), 70)) - 1.5 - 2.0 * (1 - c)
        out += _comp(band, thr, ratio, att, rel)
    thr = float(np.percentile(_frame_db(out.mean(axis=1)), 80)) - 1.0
    return _comp(out, thr, 1.25 + 0.75 * c, 30, 200)


def saturate(x: np.ndarray, amount: float) -> np.ndarray:
    """Saturacion suave tipo cinta, con sobremuestreo para que no ensucie los agudos."""
    if amount <= 0.02:
        return x
    drive = 1.0 + 2.2 * amount
    up = signal.resample_poly(x, 2, 1, axis=0)
    wet = (np.tanh(up * drive) / np.tanh(drive)).astype(np.float32)
    wet = signal.resample_poly(wet, 1, 2, axis=0)[: len(x)]
    mix = 0.15 + 0.35 * amount
    return ((1 - mix) * x + mix * wet).astype(np.float32)


def stereo(x: np.ndarray, width: float) -> np.ndarray:
    """Ancho estereo y graves (por debajo de ~140 Hz) siempre en el centro."""
    m, s = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    hp = signal.butter(2, 140, "high", fs=SR, output="sos")
    s = signal.sosfiltfilt(hp, s) * width
    return np.stack([m + s, m - s], axis=1).astype(np.float32)


LIM_BLK = 32


def peak_profile(x: np.ndarray) -> np.ndarray:
    """Pico real (4x sobremuestreado) de cada bloque de 32 muestras. Se calcula una sola vez por tema."""
    n = len(x)
    k = -(-n // LIM_BLK)
    pb = np.zeros(k, dtype=np.float32)
    seg, pad = SR * 8, 96
    xp = np.pad(x, ((pad, pad), (0, 0)), mode="reflect")
    for i in range(0, n, seg):
        m = min(seg, n - i)
        y = np.abs(signal.resample_poly(xp[i:i + m + 2 * pad], 4, 1, axis=0))[pad * 4:pad * 4 + m * 4].max(axis=1)
        y = np.maximum(y[: (len(y) // (LIM_BLK * 4)) * LIM_BLK * 4].reshape(-1, LIM_BLK * 4).max(axis=1) if len(y) >= LIM_BLK * 4 else y.max(keepdims=True), 0)
        j = i // LIM_BLK
        pb[j:j + len(y)] = np.maximum(pb[j:j + len(y)], y[: len(pb) - j])
        tail = len(np.abs(x[i:i + m])) - len(y) * LIM_BLK
        if tail > 0 and j + len(y) < k:   # ultimo bloque incompleto del tramo
            pb[j + len(y)] = max(pb[j + len(y)], float(np.abs(x[i + len(y) * LIM_BLK:i + m]).max()))
    return pb


def limiter(x: np.ndarray, pb: np.ndarray, gain_db: float, ceiling_db: float, release_ms: float = 90.0) -> np.ndarray:
    """Limitador de picos con anticipacion (lookahead) y deteccion de pico real: el volumen baja un instante ANTES del golpe."""
    la = 6
    c = 10 ** ((ceiling_db - 0.3) / 20)
    G = 10 ** (gain_db / 20)
    n, k = len(x), len(pb)
    req = np.minimum(1.0, c / np.maximum(pb * G, 1e-9))
    gmin = minimum_filter1d(req, size=2 * la + 1, mode="nearest")
    gatt = uniform_filter1d(gmin, size=la + 1, mode="nearest")
    a = np.exp(-LIM_BLK / (release_ms / 1000 * SR))
    out = np.empty(k)
    prev = 1.0
    for i in range(k):
        v = gatt[i]
        prev = v if v < prev else prev + (v - prev) * (1 - a)
        out[i] = prev
    gain = (np.interp(np.arange(n), np.arange(k) * LIM_BLK + LIM_BLK / 2, out) * G).astype(np.float32)
    return np.clip(x * gain[:, None], -1.0, 1.0).astype(np.float32)


def limit_to_target(x: np.ndarray, target: float, ceiling: float) -> tuple[np.ndarray, float, bool]:
    """Sube el volumen hasta el objetivo en LUFS sin pasar el techo de picos.
    Devuelve (audio, dB de ganancia aplicada, si llego al objetivo). No aplasta de mas: tiene un tope."""
    base = lufs(x)
    need = float(np.clip(target - base, -30, 30))
    pb = peak_profile(x)
    g, hist, y, best = need, [], x, None
    for _ in range(10):
        y = limiter(x, pb, g, ceiling)
        l = lufs(y)
        err = target - l
        hist.append((g, l))
        if best is None or abs(err) < best[0]:
            best = (abs(err), g, y)
        if abs(err) < 0.12:
            break
        slope = 0.6
        if len(hist) >= 2 and abs(hist[-1][0] - hist[-2][0]) > 1e-6:
            slope = float(np.clip((hist[-1][1] - hist[-2][1]) / (hist[-1][0] - hist[-2][0]), 0.15, 1.0))
        g = float(np.clip(g + err / slope, -30, need + 10))
        if err > 0 and g >= need + 10 - 1e-6 and len(hist) > 1 and hist[-1][0] >= need + 10 - 1e-6:
            break
    _, g, y = best
    reached = abs(target - lufs(y)) < 0.5
    tp = true_peak_db(y)
    if tp > ceiling + 0.05:
        y = (y * 10 ** ((ceiling - tp) / 20)).astype(np.float32)
    return y, g, reached


# ----------------------------------------------------------------------------------- orquestador

@dataclass
class Settings:
    lufs: float = -11.0                 # volumen final
    ceiling: float = -1.0               # techo de picos (dBTP)
    shape: list = field(default_factory=lambda: [0.0] * 10)   # curva de tono del genero
    strength: float = 0.55              # cuanto se acerca al tono objetivo (0 a 1)
    tone: dict = field(default_factory=dict)                  # bass, body, presence, air (dB)
    comp: float = 0.5                   # compresion base del genero (0 a 1)
    comp_mult: float = 1.0              # perilla "potencia" (0 a 1.5)
    sat: float = 0.3
    width: float = 1.0
    auto_balance: bool = True
    drums_db: float = 0.0               # ajustes manuales encima del automatico
    bass_db: float = 0.0
    voice_db: float = 0.0
    drums_target: float = -3.0          # peso ideal de la bateria en los medios (dB)
    bass_target: float = -1.0
    reference: Path | None = None
    genre_name: str = ""


def _zone(f: float) -> str:
    for hi, name in [(60, "los graves profundos"), (120, "el bajo"), (250, "el cuerpo"), (500, "la zona embarrada"),
                     (1500, "los medios"), (4000, "la presencia de voces y guitarras"), (8000, "el ataque y el brillo"),
                     (1e9, "el aire")]:
        if f < hi:
            return name
    return "el aire"


def _eq_phrases(curve: np.ndarray) -> list[str]:
    out = []
    i, n = 0, len(curve)
    while i < n:
        if abs(curve[i]) >= 1.2:
            sgn = np.sign(curve[i])
            j = i
            while j + 1 < n and np.sign(curve[j + 1]) == sgn and abs(curve[j + 1]) >= 1.2:
                j += 1
            seg = curve[i:j + 1]
            k = i + int(np.argmax(np.abs(seg)))
            lo, hi = BAND_FC[i], BAND_FC[j]
            if lo == hi:
                rng = f"alrededor de {lo:.0f} Hz" if lo < 1000 else f"alrededor de {lo / 1000:.1f} kHz".replace(".0", "")
            else:
                rng = f"{lo:.0f}–{hi:.0f} Hz" if hi < 1000 else f"{lo / 1000:.1f}–{hi / 1000:.1f} kHz".replace(".0", "")
            verb = "Subió" if sgn > 0 else "Bajó"
            extra = ""
            if sgn < 0 and 200 <= BAND_FC[k] < 520:
                extra = " (suena menos embarrado)"
            elif sgn > 0 and 2000 <= BAND_FC[k] < 5000:
                extra = " (voces y guitarras se escuchan más claras)"
            elif sgn > 0 and BAND_FC[k] >= 8000:
                extra = " (más brillo y aire)"
            elif sgn < 0 and BAND_FC[k] >= 5000:
                extra = " (menos áspero)"
            elif sgn > 0 and BAND_FC[k] < 130:
                extra = " (más peso en el bajo)"
            out.append(f"{verb} {abs(seg[k - i]):.1f} dB {_zone(BAND_FC[k])} ({rng}){extra}.")
            i = j + 1
        else:
            i += 1
    return out[:5]


def master(src: Path | str | np.ndarray, dst: Path | str, s: Settings) -> dict:
    """Masteriza `src` (archivo o arreglo) y escribe un WAV de 24 bits en `dst`. Devuelve el informe."""
    x = src if isinstance(src, np.ndarray) else decode(src)
    x = x.astype(np.float32)
    notes: list[str] = []
    before = {"lufs": round(lufs(x), 1), "peak": round(true_peak_db(x), 1), "width_db": round(stereo_width_db(x), 1)}
    levels_in = band_levels(x)

    target_levels = neutral_target() + shape_to_bands(s.shape)
    lufs_target, width, strength = s.lufs, s.width, s.strength
    drums_t, bass_t = s.drums_target, s.bass_target
    if s.reference is not None:
        ref = decode(s.reference)
        ref_levels = band_levels(ref)
        target_levels = ref_levels
        lufs_target = float(np.clip(lufs(ref), -20, -6))
        width = float(np.clip(10 ** ((stereo_width_db(ref) - before["width_db"]) / 40), 0.6, 1.5)) * s.width
        strength = max(strength, 0.85)
        rb = measure_balance(ref)
        if rb["drums"] is not None:
            drums_t, bass_t = rb["drums"], rb["bass"]
        notes.append(f"Tomó de la referencia el volumen ({lufs_target:.1f} LUFS), el tono y el ancho estéreo.")
    lufs_target = float(np.clip(lufs_target, -24, -6))

    # 1+2. equilibrio de instrumentos
    d_db = b_db = v_db = 0.0
    if s.auto_balance:
        bal = measure_balance(x)
        if bal["drums"] is not None:
            d_db = float(np.clip((drums_t - bal["drums"]) * 0.5, -4, 2))
            b_db = float(np.clip((bass_t - bal["bass"]) * 0.4, -3, 3))
    d_db += s.drums_db
    b_db += s.bass_db
    v_db += s.voice_db
    moved = {"drums": round(d_db, 1), "bass": round(b_db, 1), "voice": round(v_db, 1)}
    if max(abs(d_db), abs(b_db), abs(v_db)) >= 0.4:
        x = apply_balance(x, d_db, b_db, v_db)
        parts = []
        if abs(d_db) >= 0.4:
            parts.append(f"{'bajó' if d_db < 0 else 'subió'} la batería {abs(d_db):.1f} dB" +
                         (" (tapaba a las guitarras y la voz)" if d_db < 0 else ""))
        if abs(b_db) >= 0.4:
            parts.append(f"{'bajó' if b_db < 0 else 'subió'} el bajo {abs(b_db):.1f} dB")
        if abs(v_db) >= 0.4:
            parts.append(f"{'bajó' if v_db < 0 else 'subió'} voces y guitarras {abs(v_db):.1f} dB")
        notes.append("Equilibró los instrumentos: " + ", ".join(parts) + ".")

    # 3. tono
    curve = auto_eq(band_levels(x), target_levels, strength) if strength > 0 else np.zeros(len(BAND_FC))
    curve = np.clip(curve + _tone_curve(s.tone), -9, 7)
    if np.abs(curve).max() > 0.3:
        x = apply_eq(x, curve)
    phrases = _eq_phrases(curve)
    notes += phrases if phrases else ["El tono ya estaba parejo: casi no hizo falta tocar el EQ."]

    # 4. dinamica (depende de cuanto volumen hay que ganar)
    pre_l, pre_tp = lufs(x), true_peak_db(x)
    squash = max(0.0, (lufs_target - pre_l) - (s.ceiling - pre_tp))
    c = float(np.clip(s.comp * s.comp_mult * (0.45 + squash / 9.0), 0.0, 1.0))
    if c > 0.04:
        x = multiband_compress(x, c)
    # 5. color
    x = saturate(x, s.sat)
    # 6. estereo
    x = stereo(x, width)
    # 7. volumen final
    y, gain, reached = limit_to_target(x, lufs_target, s.ceiling)
    peak = float(np.abs(y).max())
    if peak > 0.999:
        y = y * (0.999 / peak)

    after = {"lufs": round(lufs(y), 1), "peak": round(true_peak_db(y), 1), "width_db": round(stereo_width_db(y), 1)}
    lv_out = band_levels(y)
    sf.write(str(dst), y, SR, subtype="PCM_24")

    if c > 0.04:
        notes.append(f"Compresión en 3 bandas ({int(round(c * 100))}% de intensidad): emparejó golpes y partes suaves para que el tema suene sólido.")
    notes.append(f"Subió el volumen de {before['lufs']:.1f} a {after['lufs']:.1f} LUFS sin pasar de {s.ceiling:.0f} dB de pico, "
                 f"así suena fuerte sin distorsionar.")
    if not reached:
        notes.append(f"Se pidieron {lufs_target:.1f} LUFS, pero este tema tiene golpes muy fuertes comparados con el resto: "
                     f"llegar más arriba lo aplastaría, así que se frenó en {after['lufs']:.1f} para cuidar el sonido.")
    if width > 1.04:
        notes.append("Abrió un poco el estéreo (los graves quedan siempre en el centro).")
    elif width < 0.96:
        notes.append("Cerró un poco el estéreo para un sonido más centrado.")

    return {
        "engine": 2,
        "genre": s.genre_name,
        "reference": bool(s.reference),
        "before": before, "after": after,
        "plr_before": round(before["peak"] - before["lufs"], 1), "plr_after": round(after["peak"] - after["lufs"], 1),
        "gain_db": round(gain, 1), "compression": round(c, 2),
        "target_lufs": round(lufs_target, 1), "target_reached": bool(reached),
        "balance": moved,
        "bands": {"hz": [float(f) for f in BAND_FC],
                  "before": [round(float(v), 1) for v in (levels_in - levels_in[PIVOT].mean())],
                  "after": [round(float(v), 1) for v in (lv_out - lv_out[PIVOT].mean())],
                  "eq": [round(float(v), 1) for v in curve]},
        "notes": notes,
    }
