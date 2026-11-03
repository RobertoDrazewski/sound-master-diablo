#!/usr/bin/env python3
"""
Worker de masterizacion para audios de ensayo (100% open source, costo cero).

Pipeline:
  1. FFmpeg: decodifica cualquier formato a WAV 44.1 kHz estereo 24 bit
  2. (opcional) Demucs: separa stems y los vuelve a mezclar tras tratarlos
  3. Pedalboard: limpieza (pasa-altos, compresor suave)
  4. Matchering (si hay referencia) o FFmpeg loudnorm (si no) para el master final

Instalacion (Python 3.10+):
  pip install pedalboard matchering soundfile numpy
  pip install demucs        # solo si vas a usar --stems (descarga ~1 GB de modelo)
  sudo apt install ffmpeg

Uso:
  python master_ensayo.py ensayo.wav
  python master_ensayo.py ensayo.m4a --reference referencia.wav
  python master_ensayo.py ensayo.wav --stems --lufs -14
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from pedalboard import Compressor, HighpassFilter, Limiter, Pedalboard


def run(cmd):
    """Ejecuta un comando y corta si falla."""
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit(f"Error ejecutando {' '.join(cmd)}:\n{res.stderr}")
    return res


def a_wav(entrada: Path, salida: Path):
    """Convierte cualquier audio a WAV 44.1 kHz estereo 24 bit."""
    run([
        "ffmpeg", "-y", "-i", str(entrada),
        "-ar", "44100", "-ac", "2", "-c:a", "pcm_s24le", str(salida),
    ])


def separar_stems(wav: Path, carpeta: Path) -> dict:
    """Separa en drums / bass / other / vocals con Demucs."""
    run([
        sys.executable, "-m", "demucs", "-n", "htdemucs",
        "-o", str(carpeta), str(wav),
    ])
    base = carpeta / "htdemucs" / wav.stem
    return {n: base / f"{n}.wav" for n in ("drums", "bass", "other", "vocals")}


def tratar_stem(nombre: str, audio: np.ndarray, sr: int) -> np.ndarray:
    """Cadena de limpieza por stem. audio con shape (canales, muestras)."""
    cadenas = {
        "drums": Pedalboard([HighpassFilter(40), Compressor(threshold_db=-18, ratio=3, attack_ms=15, release_ms=120)]),
        "bass": Pedalboard([HighpassFilter(30), Compressor(threshold_db=-20, ratio=4, attack_ms=25, release_ms=150)]),
        "vocals": Pedalboard([HighpassFilter(90), Compressor(threshold_db=-20, ratio=3, attack_ms=10, release_ms=100)]),
        "other": Pedalboard([HighpassFilter(60), Compressor(threshold_db=-18, ratio=2, attack_ms=20, release_ms=120)]),
    }
    return cadenas[nombre](audio, sr)


def limpiar_mezcla(audio: np.ndarray, sr: int) -> np.ndarray:
    """Limpieza general cuando no se usan stems."""
    cadena = Pedalboard([
        HighpassFilter(35),
        Compressor(threshold_db=-18, ratio=2.5, attack_ms=20, release_ms=150),
    ])
    return cadena(audio, sr)


def normalizar_lufs(entrada: Path, salida: Path, lufs: float):
    """Normalizacion de loudness con FFmpeg (EBU R128) y limitador de pico."""
    run([
        "ffmpeg", "-y", "-i", str(entrada),
        "-af", f"loudnorm=I={lufs}:TP=-1.0:LRA=11",
        "-ar", "44100", "-c:a", "pcm_s24le", str(salida),
    ])


def masterizar(entrada: Path, salida: Path, referencia: Path | None, stems: bool, lufs: float):
    if not shutil.which("ffmpeg"):
        sys.exit("Falta ffmpeg. Instalalo con: sudo apt install ffmpeg")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        wav = tmp / "entrada.wav"
        a_wav(entrada, wav)

        # --- Paso 1: limpieza (con o sin stems) ---
        if stems:
            print("Separando stems con Demucs (puede tardar)...")
            pistas = separar_stems(wav, tmp / "stems")
            mezcla = None
            sr = 44100
            for nombre, ruta in pistas.items():
                datos, sr = sf.read(ruta, always_2d=True)
                tratado = tratar_stem(nombre, datos.T.astype(np.float32), sr)
                mezcla = tratado if mezcla is None else mezcla + tratado
            audio = mezcla
        else:
            datos, sr = sf.read(wav, always_2d=True)
            audio = limpiar_mezcla(datos.T.astype(np.float32), sr)

        # Margen para evitar clipping antes del master
        pico = np.max(np.abs(audio))
        if pico > 0.95:
            audio = audio * (0.95 / pico)

        limpio = tmp / "limpio.wav"
        sf.write(limpio, audio.T, sr, subtype="PCM_24")

        # --- Paso 2: master final ---
        if referencia:
            import matchering as mg

            ref_wav = tmp / "referencia.wav"
            a_wav(referencia, ref_wav)
            print("Masterizando con Matchering contra la referencia...")
            mg.process(
                target=str(limpio),
                reference=str(ref_wav),
                results=[mg.pcm24(str(salida))],
            )
        else:
            print(f"Normalizando a {lufs} LUFS...")
            normalizado = tmp / "normalizado.wav"
            normalizar_lufs(limpio, normalizado, lufs)
            datos, sr = sf.read(normalizado, always_2d=True)
            final = Pedalboard([Limiter(threshold_db=-1.0, release_ms=100)])(datos.T.astype(np.float32), sr)
            sf.write(salida, final.T, sr, subtype="PCM_24")

    print(f"Listo: {salida}")


def main():
    p = argparse.ArgumentParser(description="Masterizacion de audios de ensayo")
    p.add_argument("entrada", type=Path, help="Audio del ensayo (wav, mp3, m4a, etc.)")
    p.add_argument("-o", "--salida", type=Path, help="Archivo de salida (.wav)")
    p.add_argument("-r", "--reference", type=Path, help="Tema de referencia para Matchering")
    p.add_argument("--stems", action="store_true", help="Separar y tratar stems con Demucs")
    p.add_argument("--lufs", type=float, default=-14.0, help="Loudness objetivo sin referencia (default -14)")
    args = p.parse_args()

    if not args.entrada.exists():
        sys.exit(f"No existe el archivo: {args.entrada}")

    salida = args.salida or args.entrada.with_name(f"{args.entrada.stem}_master.wav")
    masterizar(args.entrada, salida, args.reference, args.stems, args.lufs)


if __name__ == "__main__":
    main()
