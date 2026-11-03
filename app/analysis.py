"""Asistente: escucha un audio (un fragmento representativo) y arma consejos en lenguaje simple.

Todo se calcula en el servidor con ffmpeg + numpy: no usa servicios externos ni cuesta nada.
Los umbrales son orientativos; los textos lo dicen asi.
"""
import re
import subprocess

import numpy as np

SR = 44100
SEGMENT_SECONDS = 180


def _segment(duration: float) -> tuple[float, float]:
    if duration <= SEGMENT_SECONDS + 10:
        return 0.0, duration or SEGMENT_SECONDS
    return max(0.0, duration / 2 - SEGMENT_SECONDS / 2), float(SEGMENT_SECONDS)


def _decode(path: str, start: float, length: float) -> np.ndarray:
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", path,
           "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"]
    out = subprocess.run(cmd, capture_output=True, timeout=180).stdout
    data = np.frombuffer(out, dtype=np.float32)
    if data.size < SR * 2:
        raise RuntimeError("El audio es demasiado corto para analizarlo")
    return data[: data.size // 2 * 2].reshape(-1, 2)


def _loudness(path: str, start: float, length: float) -> dict:
    cmd = ["ffmpeg", "-nostats", "-hide_banner", "-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", path,
           "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]
    err = subprocess.run(cmd, capture_output=True, text=True, timeout=300).stderr
    tail = err[err.rfind("Summary:"):] if "Summary:" in err else err

    def grab(pattern):
        m = re.search(pattern, tail)
        return float(m.group(1)) if m else None
    return {"lufs": grab(r"I:\s+(-?\d+\.?\d*)\s+LUFS"), "lra": grab(r"LRA:\s+(-?\d+\.?\d*)\s+LU"),
            "true_peak": grab(r"Peak:\s+(-?\d+\.?\d*)\s+dBFS")}


def _bands(mono: np.ndarray) -> dict:
    n = 8192
    if mono.size < n * 4:
        mono = np.pad(mono, (0, n * 4 - mono.size))
    frames = np.lib.stride_tricks.sliding_window_view(mono, n)[:: n // 2]
    frames = frames[:: max(1, len(frames) // 400)]
    spec = (np.abs(np.fft.rfft(frames * np.hanning(n), axis=1)) ** 2).mean(axis=0)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    edges = {"sub": (20, 60), "graves": (60, 250), "medios_bajos": (250, 500), "medios": (500, 2000),
             "presencia": (2000, 5000), "agudos": (5000, 12000)}
    out = {}
    for name, (lo, hi) in edges.items():
        e = spec[(freqs >= lo) & (freqs < hi)].sum() + 1e-18
        out[name] = 10 * np.log10(e / np.log2(hi / lo))  # por octava
    return out


def analyze(path: str, duration: float) -> dict:
    start, length = _segment(duration)
    audio = _decode(path, start, length)
    loud = _loudness(path, start, length)
    mono = audio.mean(axis=1)

    peak = float(np.abs(audio).max())
    clip_ratio = float((np.abs(audio) >= 0.999).mean())
    bands = _bands(mono)
    ref = bands["medios"]
    rel = {k: round(float(v - ref), 1) for k, v in bands.items()}

    left, right = audio[:, 0], audio[:, 1]
    corr = float(np.corrcoef(left, right)[0, 1]) if left.std() > 1e-6 and right.std() > 1e-6 else 1.0

    lufs, lra, tp = loud["lufs"], loud["lra"], loud["true_peak"]
    peak_db = 20 * np.log10(peak + 1e-9)
    tips = []

    def tip(level, title, text):
        tips.append({"level": level, "title": title, "text": text})

    # --- saturacion / nivel de grabacion
    if clip_ratio > 0.001 or (tp is not None and tp > 0.5):
        tip("bad", "Hay saturación (se pasó de nivel)",
            "Se escuchan partes recortadas. Esto no se arregla masterizando: bajá la ganancia de entrada "
            "(o el volumen del canal) y volvé a grabar. Si no se puede, igual masterizá y mirá cómo queda.")
    elif peak_db > -0.5:
        tip("warn", "Casi tocando el tope", "Los picos llegan al máximo. Está al límite: para la próxima grabá un poco más bajo.")
    elif peak_db < -18:
        tip("warn", "Grabaste muy bajito",
            "El nivel de grabación es bajo y se pierde calidad (más ruido de fondo). Subí un poco la ganancia "
            "de entrada para que los golpes más fuertes lleguen cerca de -6 dB en el medidor.")
    else:
        tip("ok", "Nivel de grabación sano", "Tenés buen margen: ni saturado ni demasiado bajo.")

    # --- volumen general
    if lufs is not None:
        if lufs < -28:
            tip("warn", "Volumen general muy bajo", f"Está en {lufs:.0f} LUFS. El master lo sube al volumen típico del estilo.")
        elif lufs < -16:
            tip("ok", "Volumen de ensayo normal", f"Está en {lufs:.0f} LUFS: lo esperable antes de masterizar. El master lo va a subir.")
        elif lufs > -10:
            tip("warn", "Ya está muy fuerte", f"Está en {lufs:.0f} LUFS, parecido a un tema terminado. Masterizarlo de nuevo puede aplastarlo.")
        else:
            tip("ok", "Buen volumen", f"Está en {lufs:.0f} LUFS.")

    # --- dinamica
    if lra is not None:
        if lra > 14:
            tip("warn", "Muy variable de volumen", "Hay partes muy suaves y otras muy fuertes. El master las va a emparejar; "
                "si es a propósito (intro tranquila), usá una referencia en vez de un estilo.")
        elif lra < 3:
            tip("warn", "Muy parejo y apretado", "Casi no hay diferencia entre suave y fuerte. Si ya viene comprimido, no hace falta un master pesado.")
        else:
            tip("ok", "Dinámica natural", "Se nota la diferencia entre partes suaves y fuertes, que es lo que queda bien.")

    # --- balance de frecuencias
    if rel["medios_bajos"] > 5:
        tip("warn", "Suena embarrado", "Hay mucha energía en los medios-bajos (zona de 250-500 Hz). Probá cortar un poco ahí en las guitarras o el bajo.")
    if rel["graves"] > 13:
        tip("warn", "Graves de más", "El bajo y el bombo tapan al resto. Bajalos un poco en la mezcla o probá un estilo con más aire.")
    elif rel["graves"] < 2:
        tip("warn", "Faltan graves", "Se siente flaco. Revisá que el bajo y el bombo se escuchen bien en la mezcla.")
    if rel["agudos"] < -30:
        tip("warn", "Suena apagado", "Faltan agudos (platos, brillo de las guitarras). Un poco de brillo en la mezcla ayuda.")
    elif rel["agudos"] > -14:
        tip("warn", "Suena áspero o muy brillante", "Hay muchos agudos: puede cansar el oído. Bajá platos o brillo de guitarras.")
    if not any(t["title"] in ("Suena embarrado", "Graves de más", "Faltan graves", "Suena apagado",
                              "Suena áspero o muy brillante") for t in tips):
        tip("ok", "Equilibrio de graves y agudos", "No se nota nada fuera de lugar entre graves, medios y agudos.")

    # --- estereo
    if corr < -0.1:
        tip("bad", "Problema de fase", "Los dos canales se pelean entre sí: en un parlante mono o en el celular va a sonar vacío. "
            "Revisá si hay un micrófono o pista con la fase invertida.")
    elif corr > 0.985:
        tip("ok", "Sonido centrado (casi mono)", "Está casi mono. Está bien para un ensayo; en la mezcla podés abrir guitarras a los costados.")

    level_order = {"ok": 0, "warn": 1, "bad": 2}
    worst = max((level_order[t["level"]] for t in tips), default=0)
    verdict = {0: ("listo", "Está listo para masterizar."),
               1: ("casi", "Se puede masterizar tal cual. Si querés el mejor resultado, mirá los consejos."),
               2: ("revisar", "Conviene corregir un problema antes de masterizar.")}[worst]
    return {
        "analyzed_seconds": round(length), "of_seconds": round(duration or length),
        "verdict": verdict[0], "verdict_text": verdict[1],
        "metrics": {"lufs": lufs, "lra": lra, "true_peak": tp, "peak_db": round(float(peak_db), 1),
                    "clipping_pct": round(clip_ratio * 100, 3), "stereo_corr": round(corr, 2), "bands_rel_db": rel},
        "tips": sorted(tips, key=lambda t: -level_order[t["level"]]),
    }
