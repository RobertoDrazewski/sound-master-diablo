"""Generador de tapas de album: estilos locales (gratis) y, opcional, imagen con IA."""
import base64
import io
import json
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from .config import COVER_AI_MODEL, OPENAI_API_KEY

FONT = Path(__file__).parent / "assets" / "cover-font.ttf"
SIZE = 1000
STYLES = [
    {"id": "ember", "name": "Brasas", "hint": "Foto en negro y naranja"},
    {"id": "bn", "name": "Blanco y negro", "hint": "Contraste fuerte y grano"},
    {"id": "original", "name": "Original", "hint": "Tus colores, con sombra"},
    {"id": "oscuro", "name": "Oscuro", "hint": "Sin foto, fondo con humo"},
]
INK, EMBER, AMBER, BONE = (10, 9, 8), (255, 90, 31), (255, 179, 71), (242, 235, 226)


def ai_enabled() -> bool:
    return bool(OPENAI_API_KEY)


def _gradient_map(gray: Image.Image, stops) -> Image.Image:
    lut = []
    for ch in range(3):
        for i in range(256):
            t = i / 255 * (len(stops) - 1)
            k = min(int(t), len(stops) - 2)
            f = t - k
            lut.append(round(stops[k][1][ch] * (1 - f) + stops[k + 1][1][ch] * f))
    return Image.merge("RGB", [gray.point(lut[c * 256:(c + 1) * 256]) for c in range(3)])


def _grain(im: Image.Image, amount: int = 22) -> Image.Image:
    noise = Image.effect_noise(im.size, 60).convert("RGB")
    return Image.blend(im, Image.blend(im, noise, .5), amount / 100)


def _vignette(im: Image.Image, strength: float = .75) -> Image.Image:
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse((-w * .25, -h * .25, w * 1.25, h * 1.25), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(w // 5))
    dark = Image.new("RGB", (w, h), INK)
    return Image.composite(im, Image.blend(im, dark, strength), mask)


def _smoke_background() -> Image.Image:
    base = Image.effect_noise((SIZE // 4, SIZE // 4), 90).filter(ImageFilter.GaussianBlur(5)).filter(ImageFilter.GaussianBlur(3))
    base = ImageOps.autocontrast(base).resize((SIZE, SIZE), Image.BICUBIC).filter(ImageFilter.GaussianBlur(18))
    return _gradient_map(base, [(0, INK), (.6, (38, 20, 12)), (1, (150, 60, 25))])


def _bottom_shade(im: Image.Image) -> Image.Image:
    w, h = im.size
    shade = Image.linear_gradient("L").resize((w, h)).point(lambda v: int(max(0, v - 70) / 185 * 235))
    return Image.composite(Image.new("RGB", (w, h), INK), im, shade)


def _fit_font(draw, text: str, max_w: int, start: int) -> ImageFont.FreeTypeFont:
    size = start
    while size > 48:
        f = ImageFont.truetype(str(FONT), size)
        if max(draw.textlength(line, font=f) for line in text.split("\n")) <= max_w:
            return f
        size -= 6
    return ImageFont.truetype(str(FONT), 48)


def _wrap(draw, text: str, font_start: int, max_w: int):
    words, lines, cur = text.split(), [], ""
    f = ImageFont.truetype(str(FONT), font_start)
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return "\n".join(lines[:3])


def _text(im: Image.Image, title: str, subtitle: str) -> Image.Image:
    im = _bottom_shade(im)
    d = ImageDraw.Draw(im)
    pad = int(SIZE * .07)
    wrapped = _wrap(d, title.upper(), 190, SIZE - 2 * pad)
    f = _fit_font(d, wrapped, SIZE - 2 * pad, 190)
    sub_f = ImageFont.truetype(str(FONT), 46)
    lines = wrapped.split("\n")
    line_h = f.size * .92
    y = SIZE - pad - (sub_f.size + 18 if subtitle else 0) - line_h * len(lines)
    for ln in lines:
        d.text((pad, y), ln, font=f, fill=BONE)
        y += line_h
    if subtitle:
        d.text((pad, y + 6), subtitle.upper(), font=sub_f, fill=AMBER)
    return im


def render(src: bytes | None, style: str, title: str, subtitle: str, show_text: bool) -> bytes:
    if style == "oscuro" or src is None:
        im = _smoke_background()
    else:
        try:
            raw = ImageOps.exif_transpose(Image.open(io.BytesIO(src))).convert("RGB")
        except Exception:  # noqa: BLE001
            raise ValueError("Ese archivo no es una imagen válida") from None
        im = ImageOps.fit(raw, (SIZE, SIZE), Image.LANCZOS)
        if style == "ember":
            g = ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=2)
            im = _vignette(_grain(_gradient_map(g, [(0, INK), (.45, (120, 38, 14)), (.8, EMBER), (1, AMBER)]), 14))
        elif style == "bn":
            g = ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=3).point(lambda v: min(255, int(((v / 255 - .5) * 1.25 + .5) * 255)) if v else 0)
            im = _vignette(_grain(g.convert("RGB"), 26), .8)
        else:
            im = _vignette(im, .6)
    if show_text and title.strip():
        im = _text(im, title.strip()[:60], subtitle.strip()[:50])
    out = io.BytesIO()
    im.save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()


def generate_ai(prompt: str, src: bytes | None) -> bytes:
    """Imagen con IA (de pago). Con foto de base usa la edicion; sin foto, la generacion."""
    full = (f"{prompt.strip()}. Tapa de disco de rock, composicion cuadrada, estetica oscura y granulada, "
            "sin texto ni letras ni logos.")
    try:
        if src is None:
            body = json.dumps({"model": COVER_AI_MODEL, "prompt": full, "size": "1024x1024",
                               "quality": "low", "n": 1}).encode()
            req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=body, method="POST",
                                         headers={"Authorization": f"Bearer {OPENAI_API_KEY}",
                                                  "Content-Type": "application/json"})
        else:
            png = io.BytesIO()
            ImageOps.fit(ImageOps.exif_transpose(Image.open(io.BytesIO(src))).convert("RGB"),
                         (1024, 1024), Image.LANCZOS).save(png, "PNG")
            boundary = uuid.uuid4().hex
            parts = []
            for k, v in (("model", COVER_AI_MODEL), ("prompt", full), ("size", "1024x1024"), ("quality", "low")):
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
            parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="base.png"\r\n'
                          "Content-Type: image/png\r\n\r\n").encode() + png.getvalue() + b"\r\n")
            parts.append(f"--{boundary}--\r\n".encode())
            req = urllib.request.Request("https://api.openai.com/v1/images/edits", data=b"".join(parts), method="POST",
                                         headers={"Authorization": f"Bearer {OPENAI_API_KEY}",
                                                  "Content-Type": f"multipart/form-data; boundary={boundary}"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read())
        img = Image.open(io.BytesIO(base64.b64decode(data["data"][0]["b64_json"]))).convert("RGB")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"OpenAI respondió {e.code}") from None
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"No se pudo generar la imagen: {e}") from None
    img = ImageOps.fit(img, (SIZE, SIZE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()


def add_text(jpeg: bytes, title: str, subtitle: str) -> bytes:
    im = Image.open(io.BytesIO(jpeg)).convert("RGB")
    out = io.BytesIO()
    _text(im, title.strip()[:60], subtitle.strip()[:50]).save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()
