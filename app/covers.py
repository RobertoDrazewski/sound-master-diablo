"""Generador de tapas de album: estilos locales (gratis) y, opcional, imagen con IA."""
import base64
import io
import json
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from .config import COVER_AI_MODEL, COVER_AI_QUALITY, OPENAI_API_KEY

FONT = Path(__file__).parent / "assets" / "cover-font.ttf"
FONT_DIR = Path(__file__).parent / "static" / "fonts"
# id -> (archivo, todo en mayusculas, nombre, pista). Las que no son "clasica" se ven mejor con mayusculas y minusculas.
FONTS = {
    "clasica": (FONT, True, "Clásica", "Condensada y fuerte"),
    "metal": (FONT_DIR / "MetalMania-Regular.ttf", False, "Metal", "Filosa, de portada de metal"),
    "gotica": (FONT_DIR / "PirataOne-Regular.ttf", False, "Gótica", "Estilo antiguo, se lee fácil"),
    "rocker": (FONT_DIR / "NewRocker-Regular.ttf", False, "Rocker", "Rock pesado, con filo"),
}
LOGO_SIZES = {"chico": .30, "mediano": .46, "grande": .64}
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


def _fit_font(draw, text: str, max_w: int, start: int, path=FONT) -> ImageFont.FreeTypeFont:
    size = start
    while size > 48:
        f = ImageFont.truetype(str(path), size)
        if max(draw.textlength(line, font=f) for line in text.split("\n")) <= max_w:
            return f
        size -= 6
    return ImageFont.truetype(str(path), 48)


def _wrap(draw, text: str, font_start: int, max_w: int, path=FONT):
    """Parte el titulo en hasta 3 renglones; si no entra, achica la letra hasta que entre completo."""
    for size in range(font_start, 70, -10):
        f = ImageFont.truetype(str(path), size)
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if draw.textlength(t, font=f) <= max_w or not cur:
                cur = t
            else:
                lines.append(cur); cur = w
        if cur:
            lines.append(cur)
        if len(lines) <= 3:
            return "\n".join(lines), size
    return "\n".join(lines[:3]), 70


def _text(im: Image.Image, title: str, subtitle: str, narrow: bool = False, font: str = "clasica") -> Image.Image:
    path, upper, _, _ = FONTS.get(font, FONTS["clasica"])
    im = _bottom_shade(im)
    d = ImageDraw.Draw(im)
    pad = int(SIZE * .07)
    max_w = SIZE - 2 * pad - (250 if narrow else 0)   # deja lugar al sello de contenido explicito
    wrapped, start = _wrap(d, title.upper() if upper else title, 190, max_w, path)
    f = _fit_font(d, wrapped, max_w, start, path)
    sub_f = ImageFont.truetype(str(path), 46)
    lines = wrapped.split("\n")
    line_h = f.size * (.92 if upper else 1.0)
    y = SIZE - pad - (sub_f.size + 18 if subtitle else 0) - line_h * len(lines)
    for ln in lines:
        d.text((pad, y), ln, font=f, fill=BONE)
        y += line_h
    if subtitle:
        d.text((pad, y + 6), subtitle.upper() if upper else subtitle, font=sub_f, fill=AMBER)
    return im


def _paste_logo(im: Image.Image, logo: bytes, pos: str, size: str) -> Image.Image:
    """Pega el logo tal cual lo subio la banda (con su transparencia, sin efectos), arriba al centro o en el centro."""
    try:
        lg = Image.open(io.BytesIO(logo))
        lg = ImageOps.exif_transpose(lg).convert("RGBA")
    except Exception:  # noqa: BLE001
        raise ValueError("El logo no es una imagen válida") from None
    max_w = int(SIZE * LOGO_SIZES.get(size, LOGO_SIZES["mediano"]))
    max_h = int(SIZE * .42)
    k = min(max_w / lg.width, max_h / lg.height)
    lg = lg.resize((max(1, round(lg.width * k)), max(1, round(lg.height * k))), Image.LANCZOS)
    base = im.convert("RGBA")
    x = (SIZE - lg.width) // 2
    y = int(SIZE * .09) if pos != "centro" else (SIZE - lg.height) // 2
    base.alpha_composite(lg, (x, y))
    return base.convert("RGB")


def add_logo(jpeg: bytes, logo: bytes, pos: str, size: str) -> bytes:
    out = io.BytesIO()
    _paste_logo(Image.open(io.BytesIO(jpeg)).convert("RGB"), logo, pos, size).save(out, "JPEG", quality=92, optimize=True)
    return out.getvalue()


def render(src: bytes | None, style: str, title: str, subtitle: str, show_text: bool, explicit: bool = False,
           font: str = "clasica", logo: bytes | None = None, logo_pos: str = "arriba", logo_size: str = "mediano") -> bytes:
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
    if logo:
        im = _paste_logo(im, logo, logo_pos, logo_size)
    if show_text and title.strip():
        im = _text(im, title.strip()[:60], subtitle.strip()[:50], explicit, font)
    out = io.BytesIO()
    im.save(out, "JPEG", quality=90, optimize=True)
    return add_explicit(out.getvalue()) if explicit else out.getvalue()


class CoverError(RuntimeError):
    """Error de la IA de imagenes con un mensaje para mostrarle al usuario."""


ARTIST_BRIEF = (
    "Album cover artwork for an independent rock/metal/punk band. Make it bold, expressive and truly artistic, "
    "with a strong personal point of view: unexpected composition, rich texture and atmosphere, as an illustrator "
    "or analog photographer would make it. Full creative freedom of style (painting, collage, screen print, "
    "film photography, comic ink, surreal). Square composition, striking at thumbnail size. "
    "No text, no letters, no words, no logos, no watermarks. Subject: "
)


def _openai_error(e: urllib.error.HTTPError) -> tuple[str, str]:
    try:
        err = json.loads(e.read()).get("error", {})
    except Exception:  # noqa: BLE001
        err = {}
    return str(err.get("code") or ""), str(err.get("message") or "")


def _call_image_model(model: str, prompt: str, src: bytes | None, deadline: float) -> bytes:
    left = max(10, int(deadline - time.monotonic()))
    if src is None:
        payload = {"model": model, "prompt": prompt, "size": "1024x1024", "n": 1}
        if model.startswith("dall-e"):
            payload["quality"] = "hd" if model == "dall-e-3" else "standard"   # devuelve un enlace: se descarga abajo
        else:
            payload["quality"] = COVER_AI_QUALITY
        req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=json.dumps(payload).encode(),
                                     method="POST", headers={"Authorization": f"Bearer {OPENAI_API_KEY}",
                                                             "Content-Type": "application/json"})
    else:
        png = io.BytesIO()
        ImageOps.fit(ImageOps.exif_transpose(Image.open(io.BytesIO(src))).convert("RGB"),
                     (1024, 1024), Image.LANCZOS).save(png, "PNG")
        boundary = uuid.uuid4().hex
        parts = []
        for k, v in (("model", model), ("prompt", prompt), ("size", "1024x1024"), ("quality", COVER_AI_QUALITY)):
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="base.png"\r\n'
                      "Content-Type: image/png\r\n\r\n").encode() + png.getvalue() + b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        req = urllib.request.Request("https://api.openai.com/v1/images/edits", data=b"".join(parts), method="POST",
                                     headers={"Authorization": f"Bearer {OPENAI_API_KEY}",
                                              "Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=left) as r:
        data = json.loads(r.read())
    item = data["data"][0]
    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"])
    with urllib.request.urlopen(item["url"], timeout=30) as r2:  # algunos modelos devuelven un enlace
        return r2.read()


def generate_ai(prompt: str, src: bytes | None) -> tuple[bytes, str]:
    """Imagen con IA (de pago). Prueba el modelo configurado y, si la cuenta no lo tiene habilitado, uno de respaldo.
    Devuelve (jpeg, aviso). Cloudflare corta a los ~100 s, por eso el limite total."""
    full = ARTIST_BRIEF + prompt.strip()
    # El modelo configurado primero; despues los vigentes de OpenAI (sunburst = el mas capaz, flare = el mas rapido)
    # y los anteriores, por si la cuenta todavia los tiene. Un modelo que no existe falla al instante.
    models = []
    for m in (COVER_AI_MODEL, "gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-1", "dall-e-3"):
        if m not in models:
            models.append(m)
    deadline = time.monotonic() + 80
    notice, errors = "", []
    for i, model in enumerate(models):
        use_src = src if not model.startswith("dall-e") else None   # dall-e-3 no edita: sin foto de base
        try:
            raw = _call_image_model(model, full, use_src, deadline)
            if src is not None and use_src is None:
                notice = "La IA usó solo tu descripción: el modelo de respaldo no puede partir de una foto."
            break
        except urllib.error.HTTPError as e:
            code, msg = _openai_error(e)
            print(f"[covers] {model} -> HTTP {e.code} {code}: {msg}", flush=True)
            if code in ("moderation_blocked", "content_policy_violation") or "safety" in msg.lower():
                raise CoverError("OpenAI no aceptó ese pedido por sus reglas de contenido. "
                                 "Probá describirlo de otra forma (más como una escena o un estilo de arte).") from None
            if e.code == 401:
                raise CoverError("OpenAI rechazó la clave (OPENAI_API_KEY). Revisala en Coolify.") from None
            if code in ("billing_hard_limit_reached", "insufficient_quota"):
                raise CoverError("La cuenta de OpenAI no tiene crédito disponible para imágenes.") from None
            if e.code == 429:
                raise CoverError("OpenAI está limitando los pedidos en este momento. Esperá un minuto y probá de nuevo.") from None
            errors.append(f"{model}: {msg[:170] or e.code}")
            continue   # modelo no habilitado para la cuenta (403/404/400): probar el siguiente
        except Exception as e:  # noqa: BLE001
            print(f"[covers] {model} -> {e!r}", flush=True)
            errors.append(f"{model}: {e}")
            continue
    else:
        raise CoverError("No se pudo generar la imagen. " + " | ".join(errors))
    img = ImageOps.fit(Image.open(io.BytesIO(raw)).convert("RGB"), (SIZE, SIZE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue(), notice


def add_explicit(jpeg: bytes) -> bytes:
    """Sello de contenido explicito, siempre en la esquina inferior derecha. Diseno propio de la app."""
    im = Image.open(io.BytesIO(jpeg)).convert("RGB")
    d = ImageDraw.Draw(im)
    w, h, m = 232, 148, 36
    x1, y1 = SIZE - m, SIZE - m
    x0, y0 = x1 - w, y1 - h
    d.rectangle((x0, y0, x1, y1), fill=(8, 8, 8))
    d.rectangle((x0 + 7, y0 + 7, x1 - 7, y1 - 7), outline=(245, 245, 245), width=4)
    f1, f2 = ImageFont.truetype(str(FONT), 62), ImageFont.truetype(str(FONT), 62)
    for text, f, yy in (("EXPLICIT", f1, y0 + 17), ("CONTENT", f2, y0 + 76)):
        tw = d.textlength(text, font=f)
        d.text((x0 + (w - tw) / 2, yy), text, font=f, fill=(245, 245, 245))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()


def add_text(jpeg: bytes, title: str, subtitle: str, narrow: bool = False, font: str = "clasica") -> bytes:
    im = Image.open(io.BytesIO(jpeg)).convert("RGB")
    out = io.BytesIO()
    _text(im, title.strip()[:60], subtitle.strip()[:50], narrow, font).save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()
