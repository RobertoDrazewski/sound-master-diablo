import logging
import io
import json
import re
import shutil
import tempfile
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

log = logging.getLogger("uvicorn.error")
from . import align, config, analysis, assistant, audio, billing, chat, covers, genres, mail, masterjob, polar, purge, push, release
from .config import (ASSISTANT_DAILY_LIMIT, COVER_AI_DAILY_LIMIT, PUBLIC_URL, BAND_QUOTA_GB, CORS_ORIGINS, DATA_DIR,
                     INVITE_TTL_DAYS, MAX_UPLOAD_MB, RAW_RETENTION_DAYS,
                     REFERENCE_SECONDS, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, CHAT_ENABLED, TRIAL_DAYS,
                     TURNSTILE_SITE_KEY, PURGE_HOURS)
from .db import (Album, ApiToken, Band, Cancellation, ContactMessage, Event, Genre, Invite, Job, Membership, MusicianRequest,
                 Notification, Payment, Plan, PushSubscription, Reference, SessionLocal, Signup, Track, User, Version, init_db, now)
from .notify import notify_band
from .security import (create_media_token, create_session_jwt,
                       decode_media_token, decode_session_jwt, hash_password,
                       new_secret, sha256, throttle, throttle_ip, verify_password)
from .worker import remove_version_files, worker


def seed_genres(db: Session):
    """Carga el catalogo de generos por nombre: no pisa los que ya existen (ni su volumen objetivo)."""
    old = db.query(Genre).filter(Genre.name == "stoner").first()
    if old and not db.query(Genre).filter(Genre.name == "stoner rock").first():
        old.name = "stoner rock"
        db.flush()
    have = {g.name: g for g in db.query(Genre).all()}
    for name, family, lufs in genres.catalog_rows():
        g = have.get(name)
        if g is None:
            db.add(Genre(name=name, target_lufs=lufs, family=family))
        elif not g.family:
            g.family = family
    for g in have.values():
        if not g.family:
            g.family = genres.family(g.name)
    db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with SessionLocal() as db:
        seed_genres(db)
        billing.seed_plans(db)
        if db.query(User).count() == 0 and SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD:
            db.add(User(email=SUPERADMIN_EMAIL.lower(), name="Super admin", is_super=True,
                        password_hash=hash_password(SUPERADMIN_PASSWORD)))
        db.commit()
    worker.start()
    push.start()
    yield
    worker.stop()


# Sin documentacion publica de la API (/docs, /redoc, /openapi.json): no le regalamos el mapa de rutas a nadie.
app = FastAPI(title="Diablo Master", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
if CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"],
                       allow_headers=["*"])


# --------------------------------------------------------------------------- deps

def get_db():
    with SessionLocal() as db:
        yield db


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Falta el token")
    token = auth[7:].strip()
    user = None
    if token.startswith("pck_"):
        row = db.query(ApiToken).filter(ApiToken.token_hash == sha256(token)).first()
        if row:
            row.last_used_at = now()
            db.commit()
            user = db.get(User, row.user_id)
    else:
        uid = decode_session_jwt(token)
        user = db.get(User, uid) if uid else None
    if not user or not user.active:
        raise HTTPException(401, "Token invalido")
    return user


def require_super(user: User = Depends(current_user)) -> User:
    if not user.is_super:
        raise HTTPException(403, "Solo el super admin")
    return user


def band_role(db: Session, user: User, band_id: int) -> str | None:
    """'admin' | 'member' | None. El super admin cuenta como admin en todas."""
    if user.is_super:
        return "admin"
    m = db.query(Membership).filter_by(user_id=user.id, band_id=band_id).first()
    return m.role if m else None


def need_member(db: Session, user: User, band_id: int, admin: bool = False) -> str:
    role = band_role(db, user, band_id)
    # 404 y no 403: no revelar que la banda existe.
    # Todos los integrantes tienen los mismos derechos dentro de su banda; `admin` se conserva por compatibilidad.
    if role is None:
        raise HTTPException(404, "No encontrado")
    return role


def need_band_admin(db: Session, user: User, band_id: int, msg: str) -> None:
    """Solo el admin de la banda (o el super admin). A diferencia de need_member(admin=True), esto si se hace cumplir."""
    if need_member(db, user, band_id) != "admin":
        raise HTTPException(403, msg)


def user_band_ids(db: Session, user: User) -> list[int]:
    # el super admin no tiene "sus bandas": solo las suyas propias si es integrante (hoy ninguna)
    return [m.band_id for m in db.query(Membership).filter_by(user_id=user.id).all()]


# ----------------------------------------------------------------------- schemas

SECTIONS = ("ensayo", "produccion", "master")
SECTION_NAMES = {"ensayo": "Ensayos", "produccion": "Producción", "master": "Master"}

class LoginIn(BaseModel):
    email: str
    password: str


class AcceptInviteIn(BaseModel):
    token: str
    name: str = ""
    password: str = Field(min_length=10)


class AcceptInviteSessionIn(BaseModel):
    token: str


class BandIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class InviteIn(BaseModel):
    email: str
    band_id: int
    role: str = "member"
    kind: str = "musico"
    instrument: str = Field("", max_length=120)
    sings: bool = False


class BandInviteIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    kind: str = "musico"
    instrument: str = Field("", max_length=120)
    sings: bool = False


class MemberProfileIn(BaseModel):
    kind: str = "musico"
    instrument: str = Field("", max_length=120)
    sings: bool = False


def clean_profile(kind: str, instrument: str, sings: bool) -> tuple[str, str, bool]:
    if kind not in ("manager", "musico"):
        raise HTTPException(422, "kind debe ser manager o musico")
    if kind == "manager":
        return "manager", "", False
    return "musico", " ".join(instrument.split())[:120], bool(sings)


class GenreIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    target_lufs: float = Field(default=-14.0, ge=-24, le=-6)


class TokenIn(BaseModel):
    label: str = "reaper"


class MasterIn(BaseModel):
    reference_id: int | None = None
    genre_id: int | None = None
    lufs: float | None = Field(default=None, ge=-24, le=-6)
    strength: float | None = Field(default=None, ge=0, le=1)       # cuanto se acerca al tono objetivo
    power: float | None = Field(default=None, ge=0, le=1.5)        # potencia (compresion)
    width: float | None = Field(default=None, ge=0.5, le=1.6)      # ancho estereo
    tone: dict | None = None                                       # bass/body/presence/air en dB
    auto_balance: bool = True
    drums_db: float | None = Field(default=None, ge=-8, le=6)
    bass_db: float | None = Field(default=None, ge=-8, le=6)
    voice_db: float | None = Field(default=None, ge=-8, le=6)
    stem_offsets_ms: dict | None = None                            # {version_id: ms} corrección de desfase por pista
    stem_gains: dict | None = None                                 # {version_id: dB} para temas con pistas separadas
    separate_stems: bool = False                                   # ignorado (se conserva por compatibilidad)


# ------------------------------------------------------------------------ helpers

def safe_name(text: str, fallback: str = "sin-nombre") -> str:
    text = text.replace("/", "-").replace("\\", "-").replace(":", "-")
    text = re.sub(r"[^\w\- .()]", "", text, flags=re.UNICODE).strip()
    return text[:120] or fallback


def band_used_bytes(db: Session, band_id: int) -> int:
    q = (db.query(func.coalesce(func.sum(Version.size_bytes), 0))
         .join(Track, Track.id == Version.track_id).filter(Track.band_id == band_id))
    return int(q.scalar() or 0)


def save_upload(f: UploadFile, dest: Path):
    limit = MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    with open(dest, "wb") as out:
        while chunk := f.file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, f"El archivo supera {MAX_UPLOAD_MB} MB")
            out.write(chunk)
    return size


def version_out(v: Version, db: Session) -> dict:
    who = db.get(User, v.created_by)
    return {
        "id": v.id, "kind": v.kind, "label": v.label, "status": v.status, "error": v.error,
        "size_bytes": v.size_bytes, "duration": v.duration,
        "created_by": who.name or who.email if who else None,
        "created_at": v.created_at.isoformat(),
        "expires_at": v.expires_at.isoformat() if v.expires_at else None,
    }


def track_out(t: Track, db: Session) -> dict:
    who = db.get(User, t.uploaded_by)
    return {
        "id": t.id, "band_id": t.band_id, "title": t.title, "section": t.section,
        "album_id": t.album_id, "position": t.position, "session": t.session or "",
        "uploaded_by": who.name or who.email if who else None,
        "created_at": t.created_at.isoformat(),
        "versions": [version_out(v, db) for v in t.versions],
    }


def ingest_files(db: Session, user: User, track: Track, mode: str, files: list[UploadFile],
                 then_master: dict | None = None):
    """Guarda los archivos en tmp y encola su conversion a FLAC + preview."""
    for f in files:
        ext = Path(f.filename or "").suffix.lower()[:8] or ".bin"
        tmp = DATA_DIR / "tmp" / f"{uuid.uuid4().hex}{ext}"
        save_upload(f, tmp)
        stem_name = safe_name(Path(f.filename or "").stem)
        if mode == "stems":
            kind, label, expires = "stem", stem_name, None
        elif mode == "raw":
            kind, label = "raw", "ensayo completo"
            expires = now() + timedelta(days=RAW_RETENTION_DAYS)
        else:
            kind, label, expires = "mix", "mezcla", None
        v = Version(track_id=track.id, kind=kind, label=label, status="processing",
                    created_by=user.id, expires_at=expires)
        db.add(v)
        db.flush()
        payload = {"tmp_path": str(tmp)}
        if then_master and len(files) == 1:
            payload["then_master"] = then_master
        db.add(Job(kind="ingest", payload=json.dumps(payload),
                   version_id=v.id, created_by=user.id))
    db.commit()
    worker.wake.set()


def write_gate(db: Session, band_id: int) -> Band:
    """Corta lo que cuesta plata (subir, masterizar, IA, lanzar) si la banda no tiene el servicio al dia.
    Ver y descargar sus archivos queda siempre habilitado."""
    band = db.get(Band, band_id)
    if not band:
        raise HTTPException(404, "No encontrado")
    st = billing.status(db, band)
    if not st["can_write"]:
        msg = ("Esta banda está suspendida. Escribinos desde Contacto." if st.get("reason") == "blocked" else
               "La suscripción de la banda está vencida. El admin de la banda puede renovarla desde la sección Plan. "
               "Mientras tanto podés escuchar y descargar todo tu material.")
        raise HTTPException(402, msg)
    return band


def check_quota(db: Session, band_id: int, incoming: int = 0):
    band = write_gate(db, band_id)
    quota = billing.limits(db, band)["quota_gb"]
    if band_used_bytes(db, band_id) + incoming > quota * 1e9:
        raise HTTPException(413, f"La banda llegó al tope de espacio de su plan ({quota:g} GB). Borrá material viejo o pasá a un plan mayor.")


# --------------------------------------------------------------------------- auth

@app.get("/health")
def health():
    return {"ok": True}


_DUMMY_HASH = hash_password("clave-que-nadie-usa")


@app.post("/auth/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    ip = _client_ip(request)   # cf-connecting-ip: lo pone Cloudflare y no se puede falsificar desde afuera
    key, ip_key = f"{email}|{ip}", f"ip|{ip}"
    if throttle.blocked(key) or throttle_ip.blocked(ip_key):
        raise HTTPException(429, "Demasiados intentos. Espera unos minutos.")
    user = db.query(User).filter(User.email == email).first()
    # se verifica siempre una clave (aunque el email no exista) para que el tiempo de respuesta no delate que cuentas existen
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not user.active or not ok:
        throttle.fail(key)
        throttle_ip.fail(ip_key)
        raise HTTPException(401, "Email o contrasena incorrectos")
    throttle.ok(key)
    return {"token": create_session_jwt(user.id)}


def _valid_invite(db: Session, token: str) -> Invite:
    inv = db.query(Invite).filter(Invite.token_hash == sha256(token)).first()
    if not inv or inv.used_at or inv.expires_at < now():
        raise HTTPException(400, "Invitacion invalida o vencida")
    return inv


@app.get("/auth/invite-info")
def invite_info(token: str, db: Session = Depends(get_db)):
    """Datos minimos para que la pantalla de invitacion sepa si la persona ya tiene cuenta."""
    inv = _valid_invite(db, token)
    band = db.get(Band, inv.band_id)
    exists = db.query(User).filter(User.email == inv.email).first() is not None
    return {"email": inv.email, "band": band.name if band else "", "exists": exists}


@app.post("/auth/accept-invite-session")
def accept_invite_session(body: AcceptInviteSessionIn, user: User = Depends(current_user),
                          db: Session = Depends(get_db)):
    """Quien ya tiene cuenta y esta con la sesion abierta se suma a la banda sin repetir la contrasena."""
    inv = _valid_invite(db, body.token)
    if user.email.lower() != inv.email.lower():
        raise HTTPException(403, f"Esta invitacion es para {inv.email}. Cerra sesion y abri el link de nuevo.")
    if not db.query(Membership).filter_by(user_id=user.id, band_id=inv.band_id).first():
        db.add(Membership(user_id=user.id, band_id=inv.band_id, role=inv.role, kind=inv.kind,
                          instrument=inv.instrument, sings=inv.sings))
    inv.used_at = now()
    db.commit()
    return {"ok": True, "band_id": inv.band_id}


@app.post("/auth/accept-invite")
def accept_invite(body: AcceptInviteIn, db: Session = Depends(get_db)):
    inv = db.query(Invite).filter(Invite.token_hash == sha256(body.token)).first()
    if not inv or inv.used_at or inv.expires_at < now():
        raise HTTPException(400, "Invitacion invalida o vencida")
    user = db.query(User).filter(User.email == inv.email).first()
    if user:
        if not verify_password(body.password, user.password_hash):
            raise HTTPException(403, "Ese email ya tiene cuenta: usa su contrasena")
    else:
        user = User(email=inv.email, name=body.name.strip(), password_hash=hash_password(body.password))
        db.add(user)
        db.flush()
    if not db.query(Membership).filter_by(user_id=user.id, band_id=inv.band_id).first():
        db.add(Membership(user_id=user.id, band_id=inv.band_id, role=inv.role, kind=inv.kind,
                          instrument=inv.instrument, sings=inv.sings))
    inv.used_at = now()
    db.commit()
    return {"token": create_session_jwt(user.id)}


# ------------------------------------------------------------------------ fotos

IMG_KINDS = {"users": 256, "bands": 640, "albums": 800}
MAX_IMAGE_MB = 10


def img_url(kind: str, obj_id: int, key: str | None) -> str | None:
    return f"/img/{kind}/{obj_id}-{key}.jpg" if key else None


def save_photo(kind: str, obj, upload: UploadFile) -> None:
    """Recorta a cuadrado, achica y guarda como JPG. La URL lleva una clave al azar."""
    from PIL import Image, ImageOps
    data = upload.file.read(MAX_IMAGE_MB * 1024 * 1024 + 1)
    if len(data) > MAX_IMAGE_MB * 1024 * 1024:
        raise HTTPException(413, f"La foto pesa más de {MAX_IMAGE_MB} MB")
    try:
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    except Exception:  # noqa: BLE001
        raise HTTPException(422, "Ese archivo no es una imagen válida") from None
    size = IMG_KINDS[kind]
    key = uuid.uuid4().hex[:12]
    folder = DATA_DIR / "images" / kind
    folder.mkdir(parents=True, exist_ok=True)
    if kind == "albums":  # copia grande para el paquete de lanzamiento (hasta 3000 px)
        hd = min(3000, min(im.size))
        ImageOps.fit(im, (hd, hd), Image.LANCZOS).save(folder / f"{obj.id}-{key}-hd.jpg", "JPEG", quality=92, optimize=True)
    im = ImageOps.fit(im, (size, size), Image.LANCZOS)
    im.save(folder / f"{obj.id}-{key}.jpg", "JPEG", quality=85, optimize=True)
    drop_photo_file(kind, obj)
    obj.photo = key


def drop_photo_file(kind: str, obj) -> None:
    if obj.photo:
        (DATA_DIR / "images" / kind / f"{obj.id}-{obj.photo}.jpg").unlink(missing_ok=True)
        (DATA_DIR / "images" / kind / f"{obj.id}-{obj.photo}-hd.jpg").unlink(missing_ok=True)


@app.get("/img/{kind}/{name}")
def get_image(kind: str, name: str):
    if kind not in IMG_KINDS or not re.fullmatch(r"\d+-[0-9a-f]{12}\.jpg", name):
        raise HTTPException(404, "No encontrado")
    path = DATA_DIR / "images" / kind / name
    if not path.exists():
        raise HTTPException(404, "No encontrado")
    return FileResponse(path, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/me")
def me(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ids = user_band_ids(db, user)
    bands = db.query(Band).filter(Band.id.in_(ids)).order_by(Band.name).all() if ids else []
    # el panel web del super admin no mezcla bandas (se administran desde Admin), pero Reaper
    # (token pck_) necesita ver las bandas de las que el super es integrante para poder subir
    es_reaper = request.headers.get("authorization", "")[7:].strip().startswith("pck_")
    if user.is_super:
        # el super admin cuenta como admin en todas las bandas: Reaper se las muestra todas
        bands = db.query(Band).order_by(Band.name).all() if es_reaper else []
    return {
        "id": user.id, "email": user.email, "name": user.name, "is_super": user.is_super,
        "photo": img_url("users", user.id, user.photo),
        "bands": [{"id": b.id, "name": b.name, "role": band_role(db, user, b.id),
                   "photo": img_url("bands", b.id, b.photo),
                   "billing": {k: v for k, v in billing.status(db, b).items() if k in ("state", "label", "can_write", "days_left", "hours_left", "purge_at")}}
                  for b in bands],
    }


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@app.post("/me/photo")
def set_my_photo(file: UploadFile = File(...), user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    save_photo("users", user, file)
    db.commit()
    return {"photo": img_url("users", user.id, user.photo)}


@app.delete("/me/photo")
def remove_my_photo(user: User = Depends(current_user), db: Session = Depends(get_db)):
    drop_photo_file("users", user)
    user.photo = None
    db.commit()
    return {"photo": None}


@app.put("/me")
def update_me(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.name = body.name.strip()
    db.commit()
    return {"ok": True, "name": user.name}


# ------------------------------------------------------------ banco de musicos

def _csv(v: str, max_items: int = 12, max_len: int = 40) -> str:
    """Normaliza una lista separada por comas: sin vacios ni repetidos."""
    out, seen = [], set()
    for x in (v or "").split(","):
        x = re.sub(r"\s+", " ", x).strip()[:max_len]
        if x and x.lower() not in seen:
            seen.add(x.lower())
            out.append(x)
    return ",".join(out[:max_items])


def _clean_contact(kind: str, value: str) -> tuple[str, str]:
    kind, value = (kind or "").strip().lower(), (value or "").strip()
    if not kind and not value:
        return "", ""
    if kind == "whatsapp":
        digits = re.sub(r"\D", "", value)
        if not 8 <= len(digits) <= 15:
            raise HTTPException(422, "El WhatsApp tiene que incluir el código de país, por ejemplo 5492615551234")
        return kind, digits
    if kind == "email":
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value) or len(value) > 160:
            raise HTTPException(422, "El mail no parece válido")
        return kind, value
    raise HTTPException(422, "Elegí WhatsApp o mail como forma de contacto")


def _music_profile(u: User) -> dict:
    return {"available": u.available, "bio": u.bio, "styles": [x for x in u.styles.split(",") if x],
            "instruments": [x for x in u.instruments.split(",") if x], "sings": u.sings, "equipment": u.equipment,
            "has_transport": u.has_transport, "has_rehearsal_space": u.has_rehearsal_space,
            "city": u.city, "country": u.country, "contact_kind": u.contact_kind, "contact_value": u.contact_value}


class MusicProfileIn(BaseModel):
    available: bool = False
    bio: str = Field(default="", max_length=800)
    styles: str = Field(default="", max_length=400)
    instruments: str = Field(default="", max_length=400)
    sings: bool = False
    equipment: str = Field(default="", max_length=600)
    has_transport: bool = False
    has_rehearsal_space: bool = False
    city: str = Field(default="", max_length=80)
    country: str = Field(default="", max_length=60)
    contact_kind: str = Field(default="", max_length=10)
    contact_value: str = Field(default="", max_length=160)


@app.get("/me/music-profile")
def get_music_profile(user: User = Depends(current_user)):
    return _music_profile(user)


@app.put("/me/music-profile")
def put_music_profile(body: MusicProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    kind, value = _clean_contact(body.contact_kind, body.contact_value)
    instruments, city, country = _csv(body.instruments, 6, 60), body.city.strip(), body.country.strip()
    if body.available and not (kind and value):
        raise HTTPException(422, "Para aparecer en el banco de músicos cargá cómo te contactan")
    if body.available and not (instruments or body.sings):
        raise HTTPException(422, "Para aparecer en el banco de músicos indicá qué instrumento tocás o si cantás")
    if body.available and not (city and country):
        raise HTTPException(422, "Para aparecer en el banco de músicos cargá tu ciudad y tu país")
    user.available, user.bio, user.styles = body.available, body.bio.strip(), _csv(body.styles)
    user.instruments, user.sings, user.equipment = instruments, body.sings, body.equipment.strip()
    user.has_transport, user.has_rehearsal_space = body.has_transport, body.has_rehearsal_space
    user.city, user.country, user.contact_kind, user.contact_value = city, country, kind, value
    db.commit()
    return _music_profile(user)


def _is_any_band_admin(db: Session, user: User) -> bool:
    return user.is_super or db.query(Membership).filter_by(user_id=user.id, role="admin").count() > 0


def need_any_band_admin(db: Session, user: User) -> None:
    if not _is_any_band_admin(db, user):
        raise HTTPException(403, "El banco de músicos es para admins de banda")


@app.get("/musicians")
def list_musicians(instrument: str = "", country: str = "", city: str = "", style: str = "",
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    need_any_band_admin(db, user)
    rows = db.query(User).filter(User.available.is_(True), User.active.is_(True), User.is_super.is_(False),
                                 User.id != user.id, User.contact_value != "").all()
    f = lambda v: (v or "").strip().lower()
    out = []
    for u in rows:
        ins = [x for x in u.instruments.split(",") if x] + (["Voz"] if u.sings and not any(f(x) == "voz" for x in u.instruments.split(",")) else [])
        sty = [x for x in u.styles.split(",") if x]
        if f(instrument) and not any(f(instrument) in f(x) for x in ins):
            continue
        if f(country) and f(country) not in f(u.country):
            continue
        if f(city) and f(city) not in f(u.city):
            continue
        if f(style) and not any(f(style) in f(x) for x in sty):
            continue
        out.append({"id": u.id, "name": u.name or u.email.split("@")[0], "photo": img_url("users", u.id, u.photo),
                    "instruments": ins, "sings": u.sings, "styles": sty, "bio": u.bio, "equipment": u.equipment,
                    "has_transport": u.has_transport, "has_rehearsal_space": u.has_rehearsal_space,
                    "city": u.city, "country": u.country, "contact_kind": u.contact_kind, "contact_value": u.contact_value})
    out.sort(key=lambda m: ((m["instruments"][0] if m["instruments"] else "~").lower(), m["country"].lower(),
                            m["city"].lower(), m["name"].lower()))
    return out


class MusicianRequestIn(BaseModel):
    instrument: str = Field(min_length=1, max_length=80)
    styles: str = Field(default="", max_length=400)
    city: str = Field(default="", max_length=80)
    country: str = Field(default="", max_length=60)
    description: str = Field(default="", max_length=600)
    contact_kind: str = Field(max_length=10)
    contact_value: str = Field(max_length=160)


MUSICIAN_REQUEST_DAYS = 60
MUSICIAN_REQUESTS_PER_BAND = 3


def _request_out(r: MusicianRequest, band_name: str, mine: bool) -> dict:
    return {"id": r.id, "band_id": r.band_id, "band_name": band_name, "instrument": r.instrument,
            "styles": [x for x in r.styles.split(",") if x], "city": r.city, "country": r.country,
            "description": r.description, "contact_kind": r.contact_kind, "contact_value": r.contact_value,
            "created_at": r.created_at.isoformat(), "mine": mine}


@app.get("/musician-requests")
def list_musician_requests(user: User = Depends(current_user), db: Session = Depends(get_db)):
    need_any_band_admin(db, user)
    since = now() - timedelta(days=MUSICIAN_REQUEST_DAYS)
    my_bands = {m.band_id for m in db.query(Membership).filter_by(user_id=user.id, role="admin").all()}
    rows = (db.query(MusicianRequest, Band.name).join(Band, Band.id == MusicianRequest.band_id)
            .filter(MusicianRequest.active.is_(True), MusicianRequest.created_at >= since)
            .order_by(MusicianRequest.created_at.desc()).limit(200).all())
    return [_request_out(r, n, user.is_super or r.band_id in my_bands) for r, n in rows]


@app.post("/bands/{band_id}/musician-requests")
def create_musician_request(band_id: int, body: MusicianRequestIn, user: User = Depends(current_user),
                            db: Session = Depends(get_db)):
    need_band_admin(db, user, band_id, "Solo el admin de la banda publica búsquedas")
    band = db.get(Band, band_id)
    if not billing.status(db, band)["can_write"]:
        raise HTTPException(402, "La suscripción de la banda no está al día")
    since = now() - timedelta(days=MUSICIAN_REQUEST_DAYS)
    if db.query(MusicianRequest).filter(MusicianRequest.band_id == band_id, MusicianRequest.active.is_(True),
                                        MusicianRequest.created_at >= since).count() >= MUSICIAN_REQUESTS_PER_BAND:
        raise HTTPException(409, f"Ya tenés {MUSICIAN_REQUESTS_PER_BAND} búsquedas activas. Sacá una para publicar otra")
    kind, value = _clean_contact(body.contact_kind, body.contact_value)
    if not kind:
        raise HTTPException(422, "Cargá cómo te contactan")
    r = MusicianRequest(band_id=band_id, created_by=user.id, instrument=body.instrument.strip(),
                        styles=_csv(body.styles), city=body.city.strip(), country=body.country.strip(),
                        description=body.description.strip(), contact_kind=kind, contact_value=value)
    db.add(r)
    db.commit()
    return _request_out(r, band.name, True)


@app.delete("/bands/{band_id}/musician-requests/{req_id}")
def delete_musician_request(band_id: int, req_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    need_band_admin(db, user, band_id, "Solo el admin de la banda saca búsquedas")
    r = db.get(MusicianRequest, req_id)
    if not r or r.band_id != band_id:
        raise HTTPException(404, "No encontrado")
    db.delete(r)
    db.commit()
    return {"ok": True}


class PasswordIn(BaseModel):
    current: str
    new: str = Field(min_length=10, max_length=200)


@app.post("/me/password")
def change_password(body: PasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current, user.password_hash):
        raise HTTPException(403, "La contraseña actual no es correcta")
    user.password_hash = hash_password(body.new)
    db.commit()
    return {"ok": True}


@app.post("/me/api-tokens")
def create_api_token(body: TokenIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    token = new_secret("pck_")
    db.add(ApiToken(user_id=user.id, token_hash=sha256(token), label=body.label[:80]))
    db.commit()
    return {"token": token, "note": "Guardalo ahora: no se vuelve a mostrar."}


@app.get("/me/api-tokens")
def list_api_tokens(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(ApiToken).filter_by(user_id=user.id).all()
    return [{"id": r.id, "label": r.label, "created_at": r.created_at.isoformat(),
             "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None} for r in rows]


@app.delete("/me/api-tokens/{token_id}")
def delete_api_token(token_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.query(ApiToken).filter_by(id=token_id, user_id=user.id).first()
    if not row:
        raise HTTPException(404, "No encontrado")
    db.delete(row)
    db.commit()
    return {"ok": True}


# -------------------------------------------------------------------------- admin

class AdminBandIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    exempt: bool = False                 # True = la banda no paga (la decide el super admin)
    plan_id: int | None = None
    trial_days: int | None = Field(None, ge=0, le=365)
    admin_email: str = ""                # si se completa, se genera la invitacion como admin de la banda


@app.post("/admin/bands")
def create_band(body: AdminBandIn, request: Request, user: User = Depends(require_super), db: Session = Depends(get_db)):
    if db.query(Band).filter(Band.name == body.name.strip()).first():
        raise HTTPException(409, "Ya existe una banda con ese nombre")
    plan = db.get(Plan, body.plan_id) if body.plan_id else db.query(Plan).filter_by(slug="estudio").first()
    band = Band(name=body.name.strip(), exempt=body.exempt, plan_id=plan.id if plan else None)
    if not body.exempt:
        days = TRIAL_DAYS if body.trial_days is None else body.trial_days
        band.trial_ends_at = now() + timedelta(days=days) if days else None
    db.add(band)
    db.commit()
    out = {"id": band.id, "name": band.name}
    if body.admin_email.strip():
        out["invite"] = make_invite(db, request, user, band.id, body.admin_email, "admin", "musico", "", False)
    return out


class UserAdminIn(BaseModel):
    name: str | None = Field(None, max_length=120)
    active: bool | None = None


class RoleIn(BaseModel):
    role: str


def temp_password() -> str:
    import secrets
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(12))


@app.get("/admin/overview")
def admin_overview(_: User = Depends(require_super), db: Session = Depends(get_db)):
    total, _used, free = shutil.disk_usage(DATA_DIR)
    used_bytes = int(db.query(func.coalesce(func.sum(Version.size_bytes), 0)).scalar() or 0)
    return {"users": db.query(User).count(), "bands": db.query(Band).count(),
            "tracks": db.query(Track).count(), "events": db.query(Event).count(),
            "used_gb": round(used_bytes / 1e9, 2), "disk_total_gb": round(total / 1e9, 1),
            "disk_free_gb": round(free / 1e9, 1), "ai_enabled": assistant.enabled()}


@app.get("/admin/users")
def admin_users(_: User = Depends(require_super), db: Session = Depends(get_db)):
    rows = (db.query(Membership, Band).join(Band, Band.id == Membership.band_id).all())
    by_user: dict[int, list] = {}
    for m, b in rows:
        by_user.setdefault(m.user_id, []).append({"id": b.id, "name": b.name, "role": m.role})
    return [{"id": u.id, "email": u.email, "name": u.name, "photo": img_url("users", u.id, u.photo),
             "is_super": u.is_super, "active": u.active, "created_at": u.created_at.isoformat(),
             "bands": by_user.get(u.id, [])} for u in db.query(User).order_by(User.created_at).all()]


@app.post("/admin/users/{user_id}/reset-password")
def admin_reset_password(user_id: int, me: User = Depends(require_super), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario inexistente")
    pw = temp_password()
    u.password_hash = hash_password(pw)
    db.commit()
    return {"email": u.email, "name": u.name, "password": pw}


@app.put("/admin/users/{user_id}")
def admin_update_user(user_id: int, body: UserAdminIn, me: User = Depends(require_super),
                      db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario inexistente")
    if body.name is not None:
        u.name = body.name.strip()
    if body.active is not None:
        if u.id == me.id and not body.active:
            raise HTTPException(422, "No podés desactivar tu propia cuenta")
        u.active = body.active
    db.commit()
    return {"ok": True}


@app.put("/admin/bands/{band_id}")
def admin_rename_band(band_id: int, body: BandIn, _: User = Depends(require_super), db: Session = Depends(get_db)):
    b = db.get(Band, band_id)
    if not b:
        raise HTTPException(404, "Banda inexistente")
    name = body.name.strip()
    if db.query(Band).filter(Band.name == name, Band.id != band_id).first():
        raise HTTPException(409, "Ya existe una banda con ese nombre")
    b.name = name
    db.commit()
    return {"ok": True}


@app.put("/admin/bands/{band_id}/members/{user_id}")
def admin_set_role(band_id: int, user_id: int, body: RoleIn, _: User = Depends(require_super),
                   db: Session = Depends(get_db)):
    if body.role not in ("admin", "member"):
        raise HTTPException(422, "role debe ser admin o member")
    m = db.query(Membership).filter_by(band_id=band_id, user_id=user_id).first()
    if not m:
        raise HTTPException(404, "No es integrante de esa banda")
    m.role = body.role
    db.commit()
    return {"ok": True}


@app.delete("/admin/bands/{band_id}")
def admin_delete_band(band_id: int, confirm_name: str = "", _: User = Depends(require_super),
                      db: Session = Depends(get_db)):
    b = db.get(Band, band_id)
    if not b:
        raise HTTPException(404, "Banda inexistente")
    if confirm_name.strip() != b.name:
        raise HTTPException(422, "Escribí el nombre exacto de la banda para confirmar")
    purge.delete_band(db, b)
    return {"ok": True}



def band_stats(db: Session, band_id: int) -> dict:
    per = dict(db.query(Track.section, func.count(Track.id)).filter_by(band_id=band_id).group_by(Track.section).all())
    masters = (db.query(func.count(Version.id)).join(Track, Track.id == Version.track_id)
               .filter(Track.band_id == band_id, Version.kind == "master").scalar() or 0)
    last = (db.query(func.max(Track.created_at)).filter_by(band_id=band_id).scalar())
    return {"ensayos": per.get("ensayo", 0), "produccion": per.get("produccion", 0), "master": per.get("master", 0),
            "masters_hechos": masters, "albumes": db.query(Album).filter_by(band_id=band_id).count(),
            "ultima_actividad": last.isoformat() if last else None}


@app.get("/admin/bands")
def admin_bands(_: User = Depends(require_super), db: Session = Depends(get_db)):
    out = []
    for b in db.query(Band).order_by(Band.name).all():
        members = (db.query(Membership, User).join(User, User.id == Membership.user_id)
                   .filter(Membership.band_id == b.id).all())
        out.append({
            "id": b.id, "name": b.name, "photo": img_url("bands", b.id, b.photo),
            "used_gb": round(band_used_bytes(db, b.id) / 1e9, 2), "quota_gb": billing.limits(db, b)["quota_gb"],
            "stats": band_stats(db, b.id), "billing": billing.status(db, b), "exempt": b.exempt, "blocked": b.blocked,
            "plan_id": b.plan_id, "mp_status": b.mp_status, "created_at": b.created_at,
            "usage": billing.usage(db, b.id),
            "members": [{"user_id": u.id, "email": u.email, "name": u.name, "role": m.role}
                        for m, u in members],
        })
    return out


def make_invite(db: Session, request: Request, inviter: User, band_id: int, email: str, role: str,
                kind: str, instrument: str, sings: bool) -> dict:
    if role not in ("admin", "member"):
        raise HTTPException(422, "role debe ser admin o member")
    if not db.get(Band, band_id):
        raise HTTPException(404, "Banda inexistente")
    email = email.strip().lower()
    if "@" not in email:
        raise HTTPException(422, "Poné un email válido")
    kind, instrument, sings = clean_profile(kind, instrument, sings)
    existing = db.query(User).filter(User.email == email).first()
    if existing and db.query(Membership).filter_by(user_id=existing.id, band_id=band_id).first():
        raise HTTPException(409, "Esa persona ya está en la banda")
    cap = billing.limits(db, db.get(Band, band_id))["max_members"]
    if cap is not None:
        used = db.query(Membership).filter_by(band_id=band_id).count() + \
            db.query(Invite).filter(Invite.band_id == band_id, Invite.used_at.is_(None), Invite.expires_at > now()).count()
        if used >= cap:
            raise HTTPException(409, f"Tu plan admite hasta {cap} integrantes por banda.")
    token = new_secret()
    db.add(Invite(token_hash=sha256(token), email=email, band_id=band_id, role=role, kind=kind,
                  instrument=instrument, sings=sings, invited_by=inviter.id,
                  expires_at=now() + timedelta(days=INVITE_TTL_DAYS)))
    db.commit()
    base = PUBLIC_URL or str(request.base_url).rstrip("/")
    return {"invite_token": token, "expires_in_days": INVITE_TTL_DAYS, "link_hint": f"{base}/#/invite/{token}"}


@app.post("/admin/invites")
def create_invite(body: InviteIn, request: Request, user: User = Depends(require_super),
                  db: Session = Depends(get_db)):
    return make_invite(db, request, user, body.band_id, body.email, body.role, body.kind, body.instrument, body.sings)


@app.post("/bands/{band_id}/invites")
def band_invite(band_id: int, body: BandInviteIn, request: Request, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    """Solo el admin de la banda (o el super admin) suma integrantes."""
    need_band_admin(db, user, band_id, "Solo el admin de la banda puede sumar integrantes")
    return make_invite(db, request, user, band_id, body.email, "member", body.kind, body.instrument, body.sings)


@app.get("/bands/{band_id}/invites")
def band_pending_invites(band_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    need_band_admin(db, user, band_id, "Solo el admin de la banda ve las invitaciones")
    rows = (db.query(Invite).filter(Invite.band_id == band_id, Invite.used_at == None,  # noqa: E711
                                    Invite.expires_at > now()).order_by(Invite.id.desc()).all())
    return [{"id": i.id, "email": i.email, "kind": i.kind, "instrument": i.instrument, "sings": i.sings,
             "expires_at": i.expires_at.isoformat()} for i in rows]


@app.delete("/bands/{band_id}/invites/{invite_id}")
def band_cancel_invite(band_id: int, invite_id: int, user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    need_band_admin(db, user, band_id, "Solo el admin de la banda cancela invitaciones")
    inv = db.query(Invite).filter_by(id=invite_id, band_id=band_id).first()
    if not inv:
        raise HTTPException(404, "No encontrada")
    db.delete(inv)
    db.commit()
    return {"ok": True}


@app.put("/bands/{band_id}/members/{user_id}")
def set_member_profile(band_id: int, user_id: int, body: MemberProfileIn, user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    """Cada integrante edita su propio lugar; el de los demás lo edita solo el admin de la banda (o el super admin)."""
    if user_id == user.id:
        need_member(db, user, band_id)
    else:
        need_band_admin(db, user, band_id, "Solo el admin de la banda puede editar el lugar de otros integrantes")
    m = db.query(Membership).filter_by(band_id=band_id, user_id=user_id).first()
    if not m:
        raise HTTPException(404, "No es integrante de esa banda")
    m.kind, m.instrument, m.sings = clean_profile(body.kind, body.instrument, body.sings)
    db.commit()
    return {"ok": True}


@app.delete("/bands/{band_id}/members/{user_id}")
def band_remove_member(band_id: int, user_id: int, user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    need_band_admin(db, user, band_id, "Solo el admin de la banda puede sacar integrantes")
    m = db.query(Membership).filter_by(band_id=band_id, user_id=user_id).first()
    if not m:
        raise HTTPException(404, "No es integrante de esa banda")
    if m.role == "admin" and not user.is_super:
        raise HTTPException(403, "Solo el super admin puede sacar a un admin de la banda")
    db.delete(m)
    db.commit()
    return {"ok": True}


@app.delete("/admin/bands/{band_id}/members/{user_id}")
def remove_member(band_id: int, user_id: int, _: User = Depends(require_super),
                  db: Session = Depends(get_db)):
    m = db.query(Membership).filter_by(band_id=band_id, user_id=user_id).first()
    if not m:
        raise HTTPException(404, "No encontrado")
    db.delete(m)
    db.commit()
    return {"ok": True}


@app.get("/genres")
def list_genres(_: User = Depends(current_user), db: Session = Depends(get_db)):
    out = []
    for g in db.query(Genre).order_by(Genre.name).all():
        p = genres.profile(g.name)
        out.append({"id": g.id, "name": g.name, "target_lufs": g.target_lufs, "family": g.family or p["family"],
                    "desc": p.get("desc", ""), "comp": p.get("comp"), "width": p.get("width"),
                    "drums": p.get("drums"), "shape": p.get("shape")})
    return out


@app.post("/admin/genres")
def create_genre(body: GenreIn, _: User = Depends(require_super), db: Session = Depends(get_db)):
    if db.query(Genre).filter(Genre.name == body.name.strip().lower()).first():
        raise HTTPException(409, "Ya existe")
    g = Genre(name=body.name.strip().lower(), target_lufs=body.target_lufs)
    db.add(g)
    db.commit()
    return {"id": g.id, "name": g.name, "target_lufs": g.target_lufs}


@app.put("/admin/genres/{genre_id}")
def update_genre(genre_id: int, body: GenreIn, _: User = Depends(require_super),
                 db: Session = Depends(get_db)):
    g = db.get(Genre, genre_id)
    if not g:
        raise HTTPException(404, "No encontrado")
    g.name, g.target_lufs = body.name.strip().lower(), body.target_lufs
    db.commit()
    return {"id": g.id, "name": g.name, "target_lufs": g.target_lufs}


@app.delete("/admin/genres/{genre_id}")
def delete_genre(genre_id: int, _: User = Depends(require_super), db: Session = Depends(get_db)):
    g = db.get(Genre, genre_id)
    if not g:
        raise HTTPException(404, "No encontrado")
    if db.query(Reference).filter_by(genre_id=genre_id).count():
        raise HTTPException(409, "Hay referencias en este genero: borralas primero")
    db.delete(g)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------- referencias

@app.get("/references")
def list_references(genre_id: int | None = None, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    ids = user_band_ids(db, user)
    q = db.query(Reference).filter((Reference.band_id == None) | (Reference.band_id.in_(ids)))  # noqa: E711
    if genre_id:
        q = q.filter(Reference.genre_id == genre_id)
    return [{"id": r.id, "name": r.name, "genre_id": r.genre_id, "genre": r.genre.name,
             "scope": "global" if r.band_id is None else "band", "band_id": r.band_id,
             "mine": r.uploaded_by == user.id, "lufs": r.lufs, "family": r.genre.family}
            for r in q.order_by(Reference.name).all()]


@app.post("/references")
def upload_reference(genre_id: int = Form(...), name: str = Form(...),
                     band_id: int | None = Form(None), file: UploadFile = File(...),
                     user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Se guarda solo un fragmento central. No hay endpoint para escucharla ni bajarla."""
    if not db.get(Genre, genre_id):
        raise HTTPException(404, "Genero inexistente")
    if band_id is None:
        if not user.is_super:
            raise HTTPException(403, "Solo el super admin carga referencias globales")
    else:
        need_member(db, user, band_id)
        write_gate(db, band_id)
        if db.query(Reference).filter_by(band_id=band_id).count() >= 40:
            raise HTTPException(409, "Ya tenés 40 referencias en la banda: borrá alguna para subir otra")
    tmp = DATA_DIR / "tmp" / f"{uuid.uuid4().hex}{Path(file.filename or '').suffix[:8] or '.bin'}"
    save_upload(file, tmp)
    dest_dir = DATA_DIR / "references"
    dest_dir.mkdir(exist_ok=True)
    dest = dest_dir / f"{uuid.uuid4().hex}.flac"
    try:
        audio.cut_reference(tmp, dest, REFERENCE_SECONDS)
    except audio.AudioError as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(422, f"No se pudo leer el audio: {e}") from None
    finally:
        tmp.unlink(missing_ok=True)
    try:
        from . import engine
        ref_lufs = round(engine.lufs(engine.decode(dest)), 1)
    except Exception:  # noqa: BLE001
        ref_lufs = None
    ref = Reference(genre_id=genre_id, band_id=band_id, name=safe_name(name), lufs=ref_lufs,
                    path=str(dest), size_bytes=dest.stat().st_size, uploaded_by=user.id)
    db.add(ref)
    db.commit()
    return {"id": ref.id, "name": ref.name}


@app.delete("/references/{ref_id}")
def delete_reference(ref_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ref = db.get(Reference, ref_id)
    if not ref:
        raise HTTPException(404, "No encontrado")
    if not (user.is_super or ref.uploaded_by == user.id):
        raise HTTPException(403, "Solo quien la subio o el super admin")
    Path(ref.path).unlink(missing_ok=True)
    db.delete(ref)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------------- temas

@app.get("/bands/{band_id}/tracks")
def list_tracks(band_id: int, section: str | None = None, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    need_member(db, user, band_id)
    q = db.query(Track).filter_by(band_id=band_id)
    if section in SECTIONS:
        q = q.filter_by(section=section)
    tracks = q.order_by(Track.id.desc()).all()
    return {"used_gb": round(band_used_bytes(db, band_id) / 1e9, 2), "quota_gb": BAND_QUOTA_GB,
            "raw_retention_days": RAW_RETENTION_DAYS,
            "tracks": [track_out(t, db) for t in tracks]}


@app.post("/bands/{band_id}/tracks")
def upload_track(band_id: int, title: str = Form(""), mode: str = Form("mix"),
                 section: str = Form("master"), session: str = Form(""), master_genre_id: int | None = Form(None),
                 master_reference_id: int | None = Form(None), master_options: str = Form(""),
                 files: list[UploadFile] = File(...), user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    """mode: mix (una cancion), stems (una pista por archivo) o raw (ensayo completo, vence)."""
    need_member(db, user, band_id)
    if mode not in ("mix", "stems", "raw"):
        raise HTTPException(422, "mode debe ser mix, stems o raw")
    if mode != "stems" and len(files) > 1:
        raise HTTPException(422, "Para varios archivos usa mode=stems")
    check_quota(db, band_id)
    name = safe_name(title) if title.strip() else safe_name(Path(files[0].filename or "").stem, "tema")
    if section not in SECTIONS:
        raise HTTPException(422, "section debe ser ensayo, produccion o master")
    track = Track(band_id=band_id, title=name, section=section, session=safe_name(session, "")[:120] if session.strip() else "",
                  uploaded_by=user.id)
    db.add(track)
    db.flush()
    then = None
    if mode != "stems" and len(files) == 1 and (master_genre_id or master_reference_id or master_options.strip()):
        try:
            then = json.loads(master_options) if master_options.strip() else {}
            assert isinstance(then, dict)
        except Exception:  # noqa: BLE001
            raise HTTPException(422, "master_options invalido") from None
        then.setdefault("genre_id", master_genre_id)
        then.setdefault("reference_id", master_reference_id)
        then = masterjob.normalize(then)
        if then["genre_id"] and not db.get(Genre, then["genre_id"]):
            raise HTTPException(404, "Género inexistente")
        if then["reference_id"]:
            ref = db.get(Reference, then["reference_id"])
            if not ref or ref.band_id not in (None, band_id):
                raise HTTPException(404, "Referencia inexistente")
        cap = billing.limits(db, db.get(Band, band_id))["masters_month"]
        if cap is not None and billing.usage(db, band_id)["masters_month"] >= cap:
            raise HTTPException(402, f"Usaste los {cap} masters de este mes en tu plan.")
    ingest_files(db, user, track, mode, files, then)
    who = user.name or user.email
    notify_band(db, band_id, f'{who} subió "{name}" a {SECTION_NAMES[section]}',
                exclude_user_id=user.id, kind="upload", link=f"#/band/{band_id}/{section}")
    db.commit()
    return track_out(track, db)


# ------------------------------------------------- subida por partes (archivos de mas de 100 MB)

CHUNK_MAX = 90 * 1024 * 1024
_UID_RE = re.compile(r"^[0-9a-f]{32}$")


def _chunk_dir(user_id: int, upload_id: str) -> Path:
    if not _UID_RE.match(upload_id):
        raise HTTPException(422, "upload_id invalido")
    return DATA_DIR / "tmp" / "chunks" / f"{user_id}-{upload_id}"


def _purge_old_chunks():
    base = DATA_DIR / "tmp" / "chunks"
    if not base.exists():
        return
    limit = datetime.now().timestamp() - 24 * 3600
    for d in base.iterdir():
        try:
            if d.stat().st_mtime < limit:
                shutil.rmtree(d, ignore_errors=True)
        except OSError:
            pass


@app.put("/uploads/{upload_id}/{index}")
async def put_chunk(upload_id: str, index: int, request: Request, user: User = Depends(current_user)):
    """Recibe una parte (hasta 90 MB) de un archivo grande. Se arma al final con /tracks/chunked."""
    if not 0 <= index < 2000:
        raise HTTPException(422, "indice invalido")
    folder = _chunk_dir(user.id, upload_id)
    if index == 0:
        _purge_old_chunks()
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{index:06d}.part"
    size = 0
    with open(dest, "wb") as out:
        async for piece in request.stream():
            size += len(piece)
            if size > CHUNK_MAX:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, "La parte pesa mas de 90 MB")
            out.write(piece)
    total = sum(p.stat().st_size for p in folder.iterdir())
    if total > MAX_UPLOAD_MB * 1024 * 1024:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(413, f"El archivo supera {MAX_UPLOAD_MB} MB")
    return {"ok": True, "size": size}


@app.post("/bands/{band_id}/tracks/chunked")
def upload_track_chunked(band_id: int, title: str = Form(""), mode: str = Form("mix"), section: str = Form("master"),
                         session: str = Form(""), items: str = Form(...), user: User = Depends(current_user),
                         db: Session = Depends(get_db)):
    """Arma los archivos que se subieron por partes y crea el tema, igual que /tracks."""
    need_member(db, user, band_id)
    try:
        entries = json.loads(items)
        assert isinstance(entries, list) and 0 < len(entries) <= 40
    except Exception:  # noqa: BLE001
        raise HTTPException(422, "items invalido") from None
    uploads, assembled = [], []
    try:
        for e in entries:
            folder = _chunk_dir(user.id, str(e.get("upload_id", "")))
            parts = int(e.get("parts", 0))
            names = [folder / f"{i:06d}.part" for i in range(parts)]
            if parts < 1 or not all(p.exists() for p in names):
                raise HTTPException(422, "Faltan partes del archivo: volve a subirlo")
            whole = DATA_DIR / "tmp" / f"{uuid.uuid4().hex}.assembling"
            assembled.append(whole)
            with open(whole, "wb") as out:
                for p in names:
                    with open(p, "rb") as src:
                        shutil.copyfileobj(src, out, 1024 * 1024)
            shutil.rmtree(folder, ignore_errors=True)
            uploads.append(UploadFile(file=open(whole, "rb"), filename=safe_name(str(e.get("filename", "audio.wav")), "audio.wav")))
        return upload_track(band_id=band_id, title=title, mode=mode, section=section, session=session,
                            master_genre_id=None, master_reference_id=None, files=uploads, user=user, db=db)
    finally:
        for u in uploads:
            u.file.close()
        for w in assembled:
            w.unlink(missing_ok=True)



@app.post("/tracks/{track_id}/versions")
def add_versions(track_id: int, mode: str = Form("stems"), files: list[UploadFile] = File(...),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(404, "No encontrado")
    need_member(db, user, track.band_id)
    if mode not in ("mix", "stems", "raw"):
        raise HTTPException(422, "mode debe ser mix, stems o raw")
    check_quota(db, track.band_id)
    ingest_files(db, user, track, mode, files)
    return track_out(db.get(Track, track_id), db)


def _track_for(db: Session, user: User, track_id: int, admin: bool = False) -> Track:
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(404, "No encontrado")
    need_member(db, user, track.band_id, admin=False)
    return track


@app.get("/tracks/{track_id}")
def get_track(track_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return track_out(_track_for(db, user, track_id), db)


@app.delete("/tracks/{track_id}")
def delete_track(track_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    track = _track_for(db, user, track_id, admin=True)
    for v in track.versions:
        remove_version_files(v)
    shutil.rmtree(DATA_DIR / "bands" / str(track.band_id) / str(track.id), ignore_errors=True)
    db.delete(track)
    db.commit()
    return {"ok": True}


@app.delete("/versions/{version_id}")
def delete_version(version_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = db.get(Version, version_id)
    if not v:
        raise HTTPException(404, "No encontrado")
    _track_for(db, user, v.track_id, admin=True)
    remove_version_files(v)
    db.delete(v)
    db.commit()
    return {"ok": True}


# ----------------------------------------------------------------------- masterizar

@app.post("/tracks/{track_id}/master")
def master_track(track_id: int, body: MasterIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    track = _track_for(db, user, track_id)
    if not any(v.status == "ready" and v.kind in ("mix", "stem", "raw") for v in track.versions):
        raise HTTPException(409, "El tema todavia no tiene audio listo")
    check_quota(db, track.band_id)
    band = db.get(Band, track.band_id)
    cap = billing.limits(db, band)["masters_month"]
    if cap is not None and billing.usage(db, band.id)["masters_month"] >= cap:
        raise HTTPException(402, f"Usaste los {cap} masters de este mes en tu plan. Se renuevan el 1° o podés pasar a un plan mayor.")

    if body.genre_id and not db.get(Genre, body.genre_id):
        raise HTTPException(404, "Genero inexistente")
    if body.reference_id:
        ref = db.get(Reference, body.reference_id)
        if not ref or (ref.band_id is not None and ref.band_id != track.band_id):
            raise HTTPException(404, "Referencia inexistente")
    opts = masterjob.normalize(body.model_dump())
    v = Version(track_id=track.id, kind="master", label=masterjob.label_for(db, opts), status="processing",
                created_by=user.id)
    db.add(v)
    db.flush()
    job = Job(kind="master", version_id=v.id, created_by=user.id, payload=json.dumps(opts))
    db.add(job)
    db.commit()
    worker.wake.set()
    return {"job_id": job.id, "version_id": v.id}


@app.get("/versions/{version_id}/master-report")
def master_report(version_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = db.get(Version, version_id)
    if not v:
        raise HTTPException(404, "No encontrado")
    _track_for(db, user, v.track_id)
    f = DATA_DIR / "analysis" / f"{v.id}.master.json"
    if not f.exists():
        raise HTTPException(404, "Este master no tiene informe")
    return json.loads(f.read_text())


@app.get("/jobs/{job_id}")
def get_job(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job or not job.version_id:
        raise HTTPException(404, "No encontrado")
    v = db.get(Version, job.version_id)
    _track_for(db, user, v.track_id)
    queued_ahead = db.query(Job).filter(Job.status == "queued", Job.id < job.id).count()
    return {"id": job.id, "kind": job.kind, "status": job.status, "error": job.error,
            "queued_ahead": queued_ahead if job.status == "queued" else 0}


# --------------------------------------------------------- reproduccion y descarga

FORMATS = {"preview": "m4a", "flac": "flac", "wav": "wav", "mp3": "mp3"}
MEDIA_TYPES = {"m4a": "audio/mp4", "flac": "audio/flac", "wav": "audio/wav", "mp3": "audio/mpeg"}


def _version_for(db: Session, user: User, version_id: int) -> tuple[Version, Track]:
    v = db.get(Version, version_id)
    if not v:
        raise HTTPException(404, "No encontrado")
    track = _track_for(db, user, v.track_id)
    if v.status != "ready":
        raise HTTPException(409, "Todavia se esta procesando")
    return v, track


@app.get("/versions/{version_id}/link")
def media_link(version_id: int, fmt: str = "preview", user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    """Devuelve una URL firmada y de corta vida para usar en <audio> o como descarga."""
    if fmt not in FORMATS:
        raise HTTPException(422, "fmt: preview, flac, wav o mp3")
    _version_for(db, user, version_id)
    token = create_media_token(user.id, version_id, fmt)
    return {"url": f"/versions/{version_id}/media?fmt={fmt}&t={token}"}


@app.get("/versions/{version_id}/media")
def media(version_id: int, request: Request, fmt: str = "preview", t: str | None = None,
          db: Session = Depends(get_db)):
    if fmt not in FORMATS:
        raise HTTPException(422, "fmt: preview, flac, wav o mp3")
    uid = decode_media_token(t, version_id, fmt) if t else None
    user = db.get(User, uid) if uid else None
    if not user or not user.active:
        raise HTTPException(401, "Link invalido o vencido")
    v, track = _version_for(db, user, version_id)  # revalida pertenencia a la banda

    ext = FORMATS[fmt]
    if fmt == "preview":
        path = Path(v.preview_path)
    elif fmt == "flac":
        path = Path(v.flac_path)
    else:
        path = DATA_DIR / "cache" / f"{v.id}.{ext}"
        if not path.exists():
            # el temporal conserva la extension real para que ffmpeg elija el formato
            partial = path.with_name(f"{v.id}.tmp{uuid.uuid4().hex[:6]}.{ext}")
            try:
                audio.convert(Path(v.flac_path), partial, fmt)
            except audio.AudioError as e:
                partial.unlink(missing_ok=True)
                raise HTTPException(500, f"No se pudo convertir: {e}") from None
            partial.replace(path)

    filename = f"{safe_name(track.title)} - {safe_name(v.label)}.{ext}"
    disposition = "inline" if fmt == "preview" else "attachment"
    return FileResponse(path, media_type=MEDIA_TYPES[ext], filename=filename,
                        content_disposition_type=disposition)





# ------------------------------------------------------------------- lanzamiento

def _release_tracks(db: Session, a: Album) -> list[dict]:
    out = []
    for t in db.query(Track).filter_by(album_id=a.id).order_by(Track.position, Track.id).all():
        vs = [v for v in t.versions if v.kind == "master" and v.status == "ready" and v.flac_path]
        v = max(vs, key=lambda x: x.id) if vs else None
        out.append({"track_id": t.id, "title": t.title, "version_id": v.id if v else None,
                    "duration": round(v.duration, 1) if v else 0, "has_master": bool(v)})
    return out


def _release_out(a: Album, db: Session) -> dict:
    tracks = _release_tracks(db, a)
    hd = DATA_DIR / "images" / "albums" / f"{a.id}-{a.photo}-hd.jpg" if a.photo else None
    cover_px = 0
    if hd and hd.exists():
        from PIL import Image
        with Image.open(hd) as im:
            cover_px = im.size[0]
    elif a.photo:
        cover_px = IMG_KINDS["albums"]
    st = release.state(a.id)
    return {"album_id": a.id, "title": a.title, "year": a.year, "cover": img_url("albums", a.id, a.photo),
            "cover_px": cover_px, "tracks": tracks,
            "total_seconds": round(sum(t["duration"] for t in tracks), 1),
            "missing_masters": [t["title"] for t in tracks if not t["has_master"]],
            "ready": bool(tracks) and all(t["has_master"] for t in tracks) and bool(a.photo),
            "build": st}


@app.get("/bands/{band_id}/releases")
def list_releases(band_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    need_member(db, user, band_id)
    return [_release_out(a, db) for a in db.query(Album).filter_by(band_id=band_id).order_by(Album.created_at.desc()).all()]


@app.post("/albums/{album_id}/release/build")
def release_build(album_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _album_for(db, user, album_id)
    write_gate(db, a.band_id)
    info = _release_out(a, db)
    if not info["tracks"]:
        raise HTTPException(409, "El álbum no tiene temas")
    if info["missing_masters"]:
        raise HTTPException(409, "Faltan masters: " + ", ".join(info["missing_masters"]))
    if release.state(a.id)["status"] == "building":
        return release.state(a.id)
    cover = DATA_DIR / "images" / "albums" / (f"{a.id}-{a.photo}-hd.jpg" if a.photo else "x")
    if a.photo and not cover.exists():
        cover = DATA_DIR / "images" / "albums" / f"{a.id}-{a.photo}.jpg"
    band = db.get(Band, a.band_id)
    release.start(a.id, {"album": a.title, "year": a.year, "band": band.name if band else "",
                         "cover": str(cover) if a.photo and cover.exists() else None,
                         "tracks": [{"title": t["title"], "flac": db.get(Version, t["version_id"]).flac_path,
                                     "version_id": t["version_id"], "duration": t["duration"]} for t in info["tracks"]]},
                  DATA_DIR)
    return release.state(a.id)


@app.get("/albums/{album_id}/release/link")
def release_link(album_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _album_for(db, user, album_id)
    st = release.state(a.id)
    if st["status"] != "ready":
        raise HTTPException(409, "El paquete todavía no está listo")
    return {"url": f"/albums/{a.id}/release/file?t={create_media_token(user.id, -a.id, 'release')}"}


@app.get("/albums/{album_id}/release/file")
def release_file(album_id: int, t: str | None = None, db: Session = Depends(get_db)):
    uid = decode_media_token(t, -album_id, "release") if t else None
    user = db.get(User, uid) if uid else None
    if not user or not user.active:
        raise HTTPException(401, "Link invalido o vencido")
    a = _album_for(db, user, album_id)
    path = release.zip_path(DATA_DIR, a.id)
    if not path.exists():
        raise HTTPException(404, "Preparalo de nuevo")
    return FileResponse(path, media_type="application/zip",
                        filename=f"{safe_name(a.title)} - lanzamiento.zip", content_disposition_type="attachment")


# ------------------------------------------------------------------- asistente

@app.get("/versions/{version_id}/analysis")
def version_analysis(version_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = db.get(Version, version_id)
    if not v:
        raise HTTPException(404, "No encontrado")
    track = db.get(Track, v.track_id)
    need_member(db, user, track.band_id)
    if v.status != "ready" or not v.flac_path or not Path(v.flac_path).exists():
        raise HTTPException(409, "El audio todavía se está procesando")
    cache = DATA_DIR / "analysis" / f"{v.id}.json"
    if cache.exists():
        result = json.loads(cache.read_text())
    else:
        try:
            result = analysis.analyze(v.flac_path, v.duration)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(422, f"No se pudo analizar: {e}") from None
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(result))
    note = DATA_DIR / "analysis" / f"{v.id}.note.txt"
    return {**result, "ai_available": assistant.enabled(),
            "ai_note": note.read_text() if note.exists() else None}


_ai_usage: dict[tuple[int, str], int] = {}


class NoteIn(BaseModel):
    style: str | None = Field(None, max_length=60)


@app.post("/versions/{version_id}/assistant-note")
def assistant_note(version_id: int, body: NoteIn, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    if not assistant.enabled():
        raise HTTPException(404, "El asistente con IA no está activado")
    v = db.get(Version, version_id)
    if not v:
        raise HTTPException(404, "No encontrado")
    track = db.get(Track, v.track_id)
    need_member(db, user, track.band_id)
    note = DATA_DIR / "analysis" / f"{v.id}.note.txt"
    if note.exists():
        return {"note": note.read_text()}
    base = version_analysis(version_id, user, db)
    band = write_gate(db, track.band_id)
    key = (track.band_id, now().strftime("%Y-%m-%d"))
    day_cap = min(ASSISTANT_DAILY_LIMIT, billing.limits(db, band)["ai_notes_day"] or ASSISTANT_DAILY_LIMIT)
    if _ai_usage.get(key, 0) >= day_cap:
        raise HTTPException(429, "Se alcanzó el límite de consultas de hoy para esta banda. Mañana vuelve.")
    try:
        text = assistant.summarize(base, track.title, body.style)
    except RuntimeError as e:
        raise HTTPException(502, str(e)) from None
    _ai_usage[key] = _ai_usage.get(key, 0) + 1
    billing.record_usage(db, band.id, "note")
    note.parent.mkdir(parents=True, exist_ok=True)
    note.write_text(text)
    return {"note": text}


# -------------------------------------------------------------------- integrantes

@app.get("/bands/{band_id}/members")
def band_members(band_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    role = need_member(db, user, band_id)
    rows = (db.query(Membership, User).join(User, User.id == Membership.user_id)
            .filter(Membership.band_id == band_id).order_by(User.name).all())
    show_email = True
    return [{"user_id": u.id, "name": u.name or u.email.split("@")[0], "role": m.role,
             "kind": m.kind, "instrument": m.instrument, "sings": m.sings,
             "photo": img_url("users", u.id, u.photo),
             **({"email": u.email} if show_email else {})} for m, u in rows]


# --------------------------------------------------------------------- calendario

class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    starts_at: str
    place: str = Field("", max_length=200)
    notes: str = Field("", max_length=2000)


def parse_dt(value: str) -> datetime:
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "Fecha inválida") from None
    if d.tzinfo:
        d = d.astimezone(timezone.utc).replace(tzinfo=None)
    return d


def event_out(e: Event, db: Session) -> dict:
    who = db.get(User, e.created_by)
    return {"id": e.id, "band_id": e.band_id, "title": e.title, "starts_at": e.starts_at.isoformat(),
            "place": e.place, "notes": e.notes,
            "created_by": (who.name or who.email) if who else None}


@app.get("/bands/{band_id}/events")
def list_events(band_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    need_member(db, user, band_id)
    since = now() - timedelta(days=45)
    rows = (db.query(Event).filter(Event.band_id == band_id, Event.starts_at >= since)
            .order_by(Event.starts_at).limit(300).all())
    return [event_out(e, db) for e in rows]


@app.post("/bands/{band_id}/events")
def create_event(band_id: int, body: EventIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    need_member(db, user, band_id)
    ev = Event(band_id=band_id, title=body.title.strip(), starts_at=parse_dt(body.starts_at),
               place=body.place.strip(), notes=body.notes.strip(), created_by=user.id)
    db.add(ev)
    db.flush()
    notify_band(db, band_id, f'{user.name or user.email} agendó "{ev.title}"',
                exclude_user_id=user.id, kind="event", link=f"#/band/{band_id}/calendario")
    db.commit()
    return event_out(ev, db)


@app.delete("/events/{event_id}")
def delete_event(event_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(404, "No encontrado")
    need_member(db, user, ev.band_id)
    db.delete(ev)
    db.commit()
    return {"ok": True}


# ----------------------------------------------------------------- notificaciones

@app.get("/notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = (db.query(Notification).filter_by(user_id=user.id)
            .order_by(Notification.id.desc()).limit(30).all())
    unread = db.query(Notification).filter_by(user_id=user.id, read=False).count()
    ids = user_band_ids(db, user)
    upcoming = []
    if ids:
        names = {b.id: b.name for b in db.query(Band).filter(Band.id.in_(ids)).all()}
        evs = (db.query(Event).filter(Event.band_id.in_(ids), Event.starts_at >= now() - timedelta(hours=3),
                                      Event.starts_at <= now() + timedelta(days=7))
               .order_by(Event.starts_at).limit(10).all())
        upcoming = [{**event_out(e, db), "band_name": names.get(e.band_id, "")} for e in evs]
    soon = sum(1 for e in upcoming if parse_dt(e["starts_at"]) <= now() + timedelta(hours=24))
    return {
        "unread": unread + soon,
        "items": [{"id": n.id, "text": n.text, "link": n.link, "read": n.read, "kind": n.kind,
                   "band_id": n.band_id, "created_at": n.created_at.isoformat()} for n in rows],
        "upcoming": upcoming,
    }


@app.post("/notifications/read")
def notifications_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter_by(user_id=user.id, read=False).update({"read": True})
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------- avisos en el celular (push)

class PushKeysIn(BaseModel):
    p256dh: str = Field(min_length=10, max_length=200)
    auth: str = Field(min_length=6, max_length=100)


class PushSubIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=900)
    keys: PushKeysIn


class PushEndpointIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=900)


@app.get("/push/key")
def push_key(user: User = Depends(current_user)):
    return {"key": push.public_key()}


@app.post("/push/subscribe")
def push_subscribe(body: PushSubIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not body.endpoint.startswith("https://"):
        raise HTTPException(400, "Dirección de avisos no válida")
    sub = db.query(PushSubscription).filter_by(endpoint=body.endpoint).first()
    if sub:      # el mismo celular puede pasar de una cuenta a otra
        sub.user_id, sub.p256dh, sub.auth = user.id, body.keys.p256dh, body.keys.auth
    else:
        db.add(PushSubscription(user_id=user.id, endpoint=body.endpoint, p256dh=body.keys.p256dh, auth=body.keys.auth))
    db.flush()
    extra = (db.query(PushSubscription).filter_by(user_id=user.id)
             .order_by(PushSubscription.id.desc()).offset(10).all())   # tope de 10 dispositivos por persona
    for e in extra:
        db.delete(e)
    db.commit()
    return {"ok": True}


@app.post("/push/unsubscribe")
def push_unsubscribe(body: PushEndpointIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(PushSubscription).filter_by(endpoint=body.endpoint, user_id=user.id).delete()
    db.commit()
    return {"ok": True}


@app.post("/push/test")
def push_test(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not db.query(PushSubscription).filter_by(user_id=user.id).count():
        raise HTTPException(409, "No hay ningún celular con avisos activados en tu cuenta")
    n = push.send_to_user(db, user.id, "Diablo Master Mix", "Los avisos funcionan: te vamos a avisar cuando haya novedades.",
                          "#/", tag="prueba")
    if not n:
        raise HTTPException(502, "No pudimos enviar el aviso. Desactivá y volvé a activar los avisos, y probá de nuevo.")
    return {"sent": n}


# ------------------------------------------------------ alinear pistas (desfase)

_align_slots = threading.BoundedSemaphore(2)       # análisis y vistas previas son CPU: de a dos como máximo


def _ready_stems(db: Session, user: User, track_id: int) -> list[Version]:
    track = _track_for(db, user, track_id)
    stems = [v for v in track.versions if v.kind == "stem" and v.status == "ready" and v.flac_path]
    if len(stems) < 2:
        raise HTTPException(422, "Hacen falta al menos dos pistas separadas para alinear")
    return stems


@app.get("/tracks/{track_id}/stem-align")
def stem_align(track_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stems = _ready_stems(db, user, track_id)
    if not _align_slots.acquire(timeout=20):
        raise HTTPException(429, "Hay otros análisis en curso. Probá en un momento.")
    try:
        res = align.measure([(v.id, v.label or f"Pista {v.id}", v.flac_path) for v in stems])
    except Exception:
        raise HTTPException(422, "No se pudo medir el desfase de estas pistas") from None
    finally:
        _align_slots.release()
    for it in res["items"]:
        it["late_ms"] = float(it["late_ms"])
    return res


class AlignPreviewIn(BaseModel):
    offsets_ms: dict | None = None                   # {version_id: ms}; vacío = sin corregir


@app.post("/tracks/{track_id}/stem-align/preview")
def stem_align_preview(track_id: int, body: AlignPreviewIn, user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    """30 s de la mezcla de las pistas, con o sin la corrección, para comparar de oído."""
    stems = _ready_stems(db, user, track_id)
    offs = {str(k): float(min(max(float(v), -150), 150)) for k, v in (body.offsets_ms or {}).items()}
    if not _align_slots.acquire(timeout=20):
        raise HTTPException(429, "Hay otros análisis en curso. Probá en un momento.")
    tmp = Path(tempfile.mkdtemp(dir=DATA_DIR / "tmp"))
    try:
        import numpy as np
        import soundfile as sf
        mix = None
        sr = 44100
        for v in stems:
            info = sf.info(v.flac_path)
            n, sr = int(30 * info.samplerate), info.samplerate
            data, _ = sf.read(v.flac_path, start=max(0, (info.frames - n) // 2), frames=n, always_2d=True)
            ms = offs.get(str(v.id), 0.0)
            if ms:
                data = align.shift(data, int(round(ms * sr / 1000.0)))
            if data.shape[1] == 1:
                data = np.repeat(data, 2, axis=1)
            if mix is None:
                mix = data
            else:
                big = max(len(mix), len(data))
                mix = np.pad(mix, ((0, big - len(mix)), (0, 0))) + np.pad(data, ((0, big - len(data)), (0, 0)))
        peak = float(np.max(np.abs(mix))) or 1.0
        mix = mix * (0.9 / peak)                      # mismo nivel en las dos versiones: se compara el tiempo, no el volumen
        wav, out = tmp / "p.wav", tmp / "p.mp3"
        sf.write(wav, mix, sr, subtype="PCM_16")
        audio.convert(wav, out, "mp3")
        return Response(out.read_bytes(), media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
    except audio.AudioError:
        raise HTTPException(500, "No se pudo preparar la vista previa") from None
    finally:
        _align_slots.release()
        shutil.rmtree(tmp, ignore_errors=True)


# --------------------------------------------------------- bandas: foto y ficha

@app.post("/bands/{band_id}/photo")
def set_band_photo(band_id: int, file: UploadFile = File(...), user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    need_member(db, user, band_id, admin=True)
    band = db.get(Band, band_id)
    save_photo("bands", band, file)
    db.commit()
    return {"photo": img_url("bands", band.id, band.photo)}


@app.delete("/bands/{band_id}/photo")
def remove_band_photo(band_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    need_member(db, user, band_id, admin=True)
    band = db.get(Band, band_id)
    drop_photo_file("bands", band)
    band.photo = None
    db.commit()
    return {"photo": None}


# --------------------------------------------------------------------- canciones

class TrackIn(BaseModel):
    section: str | None = None
    session: str | None = Field(None, max_length=120)
    title: str | None = Field(None, min_length=1, max_length=200)
    album_id: int | None = None
    clear_album: bool = False


@app.put("/tracks/{track_id}")
def update_track(track_id: int, body: TrackIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    track = _track_for(db, user, track_id)
    if body.title:
        track.title = safe_name(body.title)
    if body.session is not None:
        track.session = safe_name(body.session, "")[:120] if body.session.strip() else ""
    if body.section:
        if body.section not in SECTIONS:
            raise HTTPException(422, "Sección desconocida")
        if body.section != track.section:
            track.section = body.section
            if body.section == "ensayo":
                track.album_id = None
    if body.clear_album:
        track.album_id = None
    elif body.album_id:
        album = db.get(Album, body.album_id)
        if not album or album.band_id != track.band_id:
            raise HTTPException(404, "Álbum inexistente")
        track.album_id = album.id
        track.position = (db.query(func.max(Track.position)).filter_by(album_id=album.id).scalar() or 0) + 1
    db.commit()
    return track_out(track, db)


# ----------------------------------------------------------------------- albumes

class AlbumIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    year: int | None = Field(None, ge=1900, le=2100)


class AlbumOrderIn(BaseModel):
    track_ids: list[int]


def album_out(a: Album, db: Session) -> dict:
    tracks = db.query(Track).filter_by(album_id=a.id).order_by(Track.position, Track.id).all()
    return {"id": a.id, "band_id": a.band_id, "title": a.title, "year": a.year,
            "photo": img_url("albums", a.id, a.photo), "created_at": a.created_at.isoformat(),
            "tracks": [track_out(t, db) for t in tracks]}


def _album_for(db: Session, user: User, album_id: int) -> Album:
    a = db.get(Album, album_id)
    if not a:
        raise HTTPException(404, "No encontrado")
    need_member(db, user, a.band_id)
    return a


@app.get("/bands/{band_id}/albums")
def list_albums(band_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    need_member(db, user, band_id)
    albums = db.query(Album).filter_by(band_id=band_id).order_by(Album.created_at.desc()).all()
    loose = (db.query(Track).filter(Track.band_id == band_id, Track.album_id == None,  # noqa: E711
                                    Track.section != "ensayo").order_by(Track.id.desc()).all())
    return {"albums": [album_out(a, db) for a in albums], "loose": [track_out(t, db) for t in loose]}


@app.post("/bands/{band_id}/albums")
def create_album(band_id: int, body: AlbumIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    need_member(db, user, band_id)
    a = Album(band_id=band_id, title=body.title.strip(), year=body.year, created_by=user.id)
    db.add(a)
    db.commit()
    return album_out(a, db)


@app.put("/albums/{album_id}")
def update_album(album_id: int, body: AlbumIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    a = _album_for(db, user, album_id)
    a.title, a.year = body.title.strip(), body.year
    db.commit()
    return album_out(a, db)


@app.put("/albums/{album_id}/order")
def order_album(album_id: int, body: AlbumOrderIn, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    """Define que canciones tiene el album y en que orden. Las que no estan quedan sueltas."""
    a = _album_for(db, user, album_id)
    wanted = list(dict.fromkeys(body.track_ids))
    tracks = {t.id: t for t in db.query(Track).filter(Track.band_id == a.band_id, Track.id.in_(wanted or [0])).all()}
    if len(tracks) != len(wanted):
        raise HTTPException(404, "Hay canciones que no son de esta banda")
    for t in db.query(Track).filter_by(album_id=a.id).all():
        if t.id not in tracks:
            t.album_id = None
    for pos, tid in enumerate(wanted, start=1):
        tracks[tid].album_id, tracks[tid].position = a.id, pos
    db.commit()
    return album_out(a, db)


@app.delete("/albums/{album_id}")
def delete_album(album_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _album_for(db, user, album_id)
    for t in db.query(Track).filter_by(album_id=a.id).all():
        t.album_id = None
    drop_photo_file("albums", a)
    db.delete(a)
    db.commit()
    return {"ok": True}


@app.post("/albums/{album_id}/photo")
def set_album_photo(album_id: int, file: UploadFile = File(...), user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    a = _album_for(db, user, album_id)
    save_photo("albums", a, file)
    db.commit()
    return {"photo": img_url("albums", a.id, a.photo)}


@app.get("/cover-options")
def cover_options(user: User = Depends(current_user)):
    return {"styles": covers.STYLES, "fonts": [{"id": k, "name": v[2], "hint": v[3]} for k, v in covers.FONTS.items()], "ai_available": covers.ai_enabled(), "ai_daily_limit": COVER_AI_DAILY_LIMIT}


_cover_ai_usage: dict[tuple[int, str], int] = {}


@app.post("/albums/{album_id}/cover-preview")
def cover_preview(album_id: int, mode: str = Form("style"), style: str = Form("ember"),
                  title: str = Form(""), subtitle: str = Form(""), show_text: bool = Form(True),
                  prompt: str = Form(""), explicit: bool = Form(False), font: str = Form("clasica"), logo_pos: str = Form("arriba"),
                  logo_size: str = Form("mediano"), file: UploadFile | None = File(None), logo: UploadFile | None = File(None),
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Arma una tapa y la devuelve sin guardarla; el cliente la sube como tapa si le gusta."""
    a = _album_for(db, user, album_id)
    src = None
    if file is not None and file.filename:
        src = file.file.read(MAX_IMAGE_MB * 1024 * 1024 + 1)
        if len(src) > MAX_IMAGE_MB * 1024 * 1024:
            raise HTTPException(413, f"La foto pesa más de {MAX_IMAGE_MB} MB")
    logo_bytes = None
    if logo is not None and logo.filename:
        logo_bytes = logo.file.read(MAX_IMAGE_MB * 1024 * 1024 + 1)
        if len(logo_bytes) > MAX_IMAGE_MB * 1024 * 1024:
            raise HTTPException(413, f"El logo pesa más de {MAX_IMAGE_MB} MB")
    if font not in covers.FONTS:
        font = "clasica"
    title = title.strip() or a.title
    try:
        if mode == "ai":
            if not covers.ai_enabled():
                raise HTTPException(404, "La generación con IA no está activada")
            if len(prompt.strip()) < 8:
                raise HTTPException(422, "Contá un poco más qué imagen querés (mínimo 8 letras)")
            band = write_gate(db, a.band_id)
            key = (a.band_id, now().strftime("%Y-%m-%d"))
            if _cover_ai_usage.get(key, 0) >= COVER_AI_DAILY_LIMIT:
                raise HTTPException(429, "Se alcanzó el límite de imágenes con IA de hoy para esta banda. Mañana vuelve.")
            cap = billing.limits(db, band)["ai_covers_month"]
            if cap is not None and billing.usage(db, band.id)["ai_covers_month"] >= cap:
                raise HTTPException(402, f"Usaste las {cap} tapas con IA de este mes en tu plan.")
            jpeg, notice = covers.generate_ai(prompt.strip()[:600], src)
            _cover_ai_usage[key] = _cover_ai_usage.get(key, 0) + 1
            billing.record_usage(db, band.id, "cover")
            if logo_bytes:
                jpeg = covers.add_logo(jpeg, logo_bytes, logo_pos, logo_size)
            if show_text:
                jpeg = covers.add_text(jpeg, title, subtitle, explicit, font)
            if explicit:
                jpeg = covers.add_explicit(jpeg)
        else:
            if style not in {s["id"] for s in covers.STYLES}:
                raise HTTPException(422, "Estilo desconocido")
            if src is None and style != "oscuro":
                raise HTTPException(422, "Subí una foto o elegí el estilo Oscuro")
            notice = ""
            jpeg = covers.render(src, style, title, subtitle, show_text, explicit, font, logo_bytes, logo_pos, logo_size)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    except RuntimeError as e:
        # 424 y no 502: Cloudflare cambia el cuerpo de los 5xx y se pierde el mensaje
        raise HTTPException(424, str(e)) from None
    headers = {"Cache-Control": "no-store"}
    if notice:
        headers["X-Cover-Notice"] = notice.encode("ascii", "ignore").decode()
    return Response(jpeg, media_type="image/jpeg", headers=headers)


@app.delete("/albums/{album_id}/photo")
def remove_album_photo(album_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _album_for(db, user, album_id)
    drop_photo_file("albums", a)
    a.photo = None
    db.commit()
    return {"photo": None}


# ===================================================================== planes y suscripciones

def _client_ip(request: Request) -> str:
    return (request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "?"))[:64]


def _band_admin(db: Session, user: User, band_id: int) -> Band:
    """Quien gestiona el pago de la banda: su admin (o el super admin)."""
    band = db.get(Band, band_id)
    if not band or band_role(db, user, band_id) is None:
        raise HTTPException(404, "No encontrado")
    if band_role(db, user, band_id) != "admin":
        raise HTTPException(403, "Solo el admin de la banda gestiona la suscripción")
    return band


def _country(request: Request) -> str:
    """Pais del visitante segun Cloudflare (vacio si no se sabe)."""
    return (request.headers.get("cf-ipcountry") or "").strip().upper()[:2]


@app.get("/public-config")
def public_config(request: Request, db: Session = Depends(get_db)):
    return {"turnstile_site_key": TURNSTILE_SITE_KEY, "chat": CHAT_ENABLED, "trial_days": TRIAL_DAYS,
            "plans": billing.public_plans(db), "country": _country(request),
            "polar_enabled": polar.enabled(), "mp_enabled": billing.mp_enabled()}


@app.get("/bands/{band_id}/billing")
def band_billing(band_id: int, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    need_member(db, user, band_id)
    band = db.get(Band, band_id)
    pays = db.query(Payment).filter_by(band_id=band_id).order_by(Payment.paid_at.desc()).limit(120).all()
    lim = billing.limits(db, band)
    return {
        "is_admin": band_role(db, user, band_id) == "admin", "status": billing.status(db, band),
        "limits": lim, "usage": {**billing.usage(db, band_id), "used_gb": round(band_used_bytes(db, band_id) / 1e9, 2),
                                 "members": db.query(Membership).filter_by(band_id=band_id).count()},
        "plans": billing.public_plans(db), "mp_enabled": billing.mp_enabled(), "trial_days": TRIAL_DAYS,
        "polar_enabled": polar.enabled(), "country": _country(request), "provider": band.pay_provider or "mp",
        "payer_email": band.mp_payer_email or user.email,
        "has_subscription": bool(band.mp_preapproval_id or band.polar_subscription_id),
        "payments": [{"amount": p.amount, "currency": p.currency, "status": p.status, "paid_at": p.paid_at, "kind": p.kind} for p in pays],
        "total_paid": float(sum(p.amount for p in pays if p.status == "approved")),
        "can_cancel": band_role(db, user, band_id) == "admin" and not band.exempt and not band.purge_at
                      and (bool(band.mp_preapproval_id or band.polar_subscription_id) or band.mp_status is not None),
        "cancel_reasons": [{"key": k, "label": v} for k, v in billing.CANCEL_REASONS.items()],
        "purge_hours": PURGE_HOURS,
    }


class SubscribeIn(BaseModel):
    plan_id: int
    payer_email: str = Field(min_length=5, max_length=255)
    method: str = Field("mp", pattern="^(mp|polar)$")


@app.post("/bands/{band_id}/billing/subscribe")
def band_subscribe(band_id: int, body: SubscribeIn, request: Request, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    band = _band_admin(db, user, band_id)
    if band.exempt:
        raise HTTPException(409, "Esta banda no necesita suscripción")
    plan = db.get(Plan, body.plan_id)
    if not plan or not plan.active:
        raise HTTPException(404, "Plan inexistente")
    if "@" not in body.payer_email:
        raise HTTPException(422, "Poné el email de tu cuenta de Mercado Pago")
    if body.method == "polar":
        return _subscribe_polar(db, band, plan, body.payer_email.strip(), request)
    if band.polar_subscription_id and band.mp_status == "authorized":
        raise HTTPException(409, "Esta banda ya paga en dólares con tarjeta. Cambiá de plan desde ahí.")
    if not billing.mp_enabled():
        raise HTTPException(503, "El cobro con Mercado Pago todavía no está activado. Escribinos desde Contacto.")
    base = PUBLIC_URL or str(request.base_url).rstrip("/")
    try:
        # ya tiene una suscripcion autorizada: solo se cambia el monto (no hay que volver a autorizar)
        if band.mp_preapproval_id and band.mp_status == "authorized":
            billing.reprice_preapproval(band.mp_preapproval_id, plan.price_ars)
            band.plan_id, band.pending_plan_id = plan.id, None
            db.commit()
            return {"changed": True}
        st = billing.status(db, band)
        trial_days = st.get("days_left", 0) if st["state"] == "trial" else 0
        res = billing.create_preapproval(band, plan, body.payer_email.strip(), f"{base}/#/band/{band_id}/plan?mp=back",
                                         start_in_days=trial_days)
    except billing.MPError as e:
        raise HTTPException(424, str(e)) from None
    band.pending_plan_id = plan.id
    if not band.plan_id:
        band.plan_id = plan.id
    band.mp_preapproval_id, band.mp_status = res["id"], "pending"
    band.mp_payer_email = body.payer_email.strip()
    db.commit()
    return {"init_point": res["init_point"]}


def _subscribe_polar(db: Session, band: Band, plan: Plan, email: str, request: Request):
    """Pago en dolares con Polar: cambio de plan sobre la suscripcion vigente, o checkout nuevo."""
    if not polar.enabled():
        raise HTTPException(503, "El cobro en dólares todavía no está activado. Escribinos desde Contacto.")
    if band.mp_preapproval_id and band.mp_status == "authorized":
        raise HTTPException(409, "Esta banda ya paga con Mercado Pago. Para pasar a dólares cancelá esa suscripción primero.")
    base = PUBLIC_URL or str(request.base_url).rstrip("/")
    try:
        if band.polar_subscription_id and band.mp_status == "authorized":
            polar.change_plan(band.polar_subscription_id, plan)
            band.plan_id, band.pending_plan_id = plan.id, None
            db.commit()
            return {"changed": True}
        co = polar.create_checkout(plan, email, f"band:{band.id}", f"band-{band.id}",
                                   f"{base}/#/band/{band.id}/plan?polar=back", f"{base}/#/band/{band.id}/plan")
    except polar.PolarError as e:
        raise HTTPException(424, str(e)) from None
    band.pending_plan_id = plan.id
    if not band.plan_id:
        band.plan_id = plan.id
    band.pay_provider, band.mp_payer_email = "polar", email
    db.commit()
    return {"init_point": co["url"]}


@app.post("/bands/{band_id}/billing/sync")
def band_billing_sync(band_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Despues de volver del pago: pregunta el estado real (por si el aviso tarda)."""
    band = _band_admin(db, user, band_id)
    try:
        if band.polar_subscription_id:
            polar.sync_band(db, band)
        else:
            billing.sync_band(db, band)
    except (billing.MPError, polar.PolarError) as e:
        raise HTTPException(424, str(e)) from None
    return {"status": billing.status(db, band)}


class CancelIn(BaseModel):
    reasons: list[str] = Field(min_length=1, max_length=8)
    comment: str = Field("", max_length=500)
    confirm: bool = False


@app.post("/bands/{band_id}/billing/cancel")
def band_cancel(band_id: int, body: CancelIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Baja de la banda: cuestionario obligatorio + confirmacion. A las PURGE_HOURS se borra todo."""
    band = _band_admin(db, user, band_id)
    if band.exempt:
        raise HTTPException(409, "Esta banda no tiene una suscripción para cancelar")
    if band.purge_at:
        raise HTTPException(409, "La baja ya está en curso")
    if not body.confirm:
        raise HTTPException(422, "Confirmá que entendés que se eliminan todos los datos")
    reasons = [r for r in dict.fromkeys(body.reasons) if r in billing.CANCEL_REASONS]
    if not reasons:
        raise HTTPException(422, "Elegí al menos un motivo")
    try:
        billing.request_cancellation(db, band, reasons, body.comment)
    except billing.MPError as e:
        raise HTTPException(424, "No pudimos cancelar el cobro en Mercado Pago, así que no se dio de baja nada. Probá de nuevo en un rato. " + str(e)) from None
    return {"status": billing.status(db, band)}


@app.post("/billing/polar/webhook")
async def polar_webhook(request: Request, db: Session = Depends(get_db)):
    """Avisos de Polar firmados (Standard Webhooks). Sin firma valida no se procesa nada."""
    raw = await request.body()
    if not polar.verify_webhook(request.headers, raw):
        raise HTTPException(403, "Firma inválida")
    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Cuerpo inválido") from None
    try:
        polar.handle_event(db, event)
    except Exception:  # noqa: BLE001
        log.exception("webhook Polar: error procesando %s", event.get("type"))
        raise HTTPException(500, "Error procesando el aviso") from None     # Polar reintenta
    return {"ok": True}


@app.post("/billing/webhook")
async def billing_webhook(request: Request, db: Session = Depends(get_db)):
    """Avisos de Mercado Pago. No se confia en el cuerpo: se re-consulta el recurso a la API con nuestro token."""
    q = request.query_params
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    topic = q.get("type") or q.get("topic") or body.get("type") or body.get("topic") or ""
    rid = q.get("data.id") or q.get("id") or (body.get("data") or {}).get("id") or ""
    if not billing.verify_signature(request.headers, [q.get("data.id"), (body.get("data") or {}).get("id") if isinstance(body, dict) else None]):
        raise HTTPException(401, "firma invalida")
    if rid and topic in ("subscription_preapproval", "preapproval", "subscription_authorized_payment", "authorized_payment"):
        try:
            billing.handle_notification(db, topic, str(rid))
        except billing.MPError as e:
            if e.status in (400, 404):  # recurso que no existe (p. ej. la notificacion de prueba): no hay nada que reintentar
                return {"ok": True, "ignored": True}
            raise HTTPException(502, "reintentar") from None  # MP reintenta solo
    return {"ok": True}


# ---------------------------------------------------------------------- super admin: cobros

@app.get("/admin/billing/summary")
def admin_billing_summary(_: User = Depends(require_super), db: Session = Depends(get_db)):
    pend = (db.query(Signup).filter(Signup.status == "pending", Signup.created_at >= now() - timedelta(days=3))
            .order_by(Signup.created_at.desc()).limit(30).all())
    plans = {p.id: p.name for p in db.query(Plan).all()}
    return {**billing.overview(db), "mp_enabled": billing.mp_enabled(), "mail_enabled": mail.mail_enabled(),
            "turnstile": mail.turnstile_enabled(), "unread_messages": db.query(ContactMessage).filter_by(handled=False).count(),
            "pending_signups": [{"id": s.id, "band": s.band_name, "name": s.admin_name, "email": s.email,
                                 "plan": plans.get(s.plan_id, "-"), "created_at": s.created_at} for s in pend],
            "cancellations": [{"id": c.id, "band_id": c.band_id, "band": c.band_name, "plan": c.plan_name,
                               "reasons": [billing.CANCEL_REASONS.get(k, k) for k in c.reasons.split(",") if k],
                               "comment": c.comment, "months": c.months, "created_at": c.created_at,
                               "purge_at": c.purge_at, "purged_at": c.purged_at, "stopped": c.stopped}
                              for c in db.query(Cancellation).order_by(Cancellation.created_at.desc()).limit(40).all()]}


class BandBillingIn(BaseModel):
    exempt: bool | None = None
    blocked: bool | None = None
    plan_id: int | None = None
    trial_days: int | None = Field(None, ge=0, le=365)      # reinicia la prueba gratis
    add_paid_days: int | None = Field(None, ge=1, le=366)   # cobro manual (transferencia, efectivo)
    amount: float | None = None


@app.put("/admin/bands/{band_id}/billing")
def admin_band_billing(band_id: int, body: BandBillingIn, _: User = Depends(require_super),
                       db: Session = Depends(get_db)):
    b = db.get(Band, band_id)
    if not b:
        raise HTTPException(404, "Banda inexistente")
    if body.exempt is not None:
        b.exempt = body.exempt
    if body.blocked is not None:
        b.blocked = body.blocked
    if body.plan_id is not None:
        if not db.get(Plan, body.plan_id):
            raise HTTPException(404, "Plan inexistente")
        b.plan_id = body.plan_id
    if body.trial_days is not None:
        b.trial_ends_at = now() + timedelta(days=body.trial_days) if body.trial_days else None
        b.paid_until = None if body.trial_days else b.paid_until
    if body.add_paid_days:
        b.paid_until = max(b.paid_until or now(), now()) + timedelta(days=body.add_paid_days)
        db.add(Payment(band_id=b.id, band_name=b.name, amount=body.amount or 0, kind="manual", status="approved"))
    db.commit()
    return {"status": billing.status(db, b)}


@app.post("/admin/bands/{band_id}/billing/sync")
def admin_band_sync(band_id: int, _: User = Depends(require_super), db: Session = Depends(get_db)):
    b = db.get(Band, band_id)
    if not b:
        raise HTTPException(404, "Banda inexistente")
    try:
        billing.sync_band(db, b)
    except billing.MPError as e:
        raise HTTPException(424, str(e)) from None
    return {"status": billing.status(db, b)}


@app.post("/admin/bands/{band_id}/billing/stop-closing")
def admin_stop_closing(band_id: int, _: User = Depends(require_super), db: Session = Depends(get_db)):
    """Frena una baja por error antes de que se borre todo. La banda queda sin suscripcion activa."""
    b = db.get(Band, band_id)
    if not b or not b.purge_at:
        raise HTTPException(404, "Esa banda no tiene una baja en curso")
    billing.stop_cancellation(db, b)
    return {"status": billing.status(db, b)}


@app.get("/admin/payments")
def admin_payments(_: User = Depends(require_super), db: Session = Depends(get_db)):
    return [{"id": p.id, "band": p.band_name, "amount": p.amount, "currency": p.currency, "status": p.status,
             "kind": p.kind, "paid_at": p.paid_at} for p in db.query(Payment).order_by(Payment.paid_at.desc()).limit(200).all()]


@app.get("/admin/plans")
def admin_plans(_: User = Depends(require_super), db: Session = Depends(get_db)):
    out = []
    for p in db.query(Plan).order_by(Plan.sort).all():
        d = billing.plan_dict(p)
        d["bands"] = db.query(Band).filter(Band.plan_id == p.id, Band.exempt.is_(False)).count()
        out.append(d)
    return out


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    tagline: str = Field("", max_length=160)
    price_ars: int = Field(ge=0, le=100_000_000)
    quota_gb: float = Field(ge=1, le=2000)
    masters_month: int = Field(ge=1, le=10000)
    ai_covers_month: int = Field(ge=0, le=10000)
    ai_notes_day: int = Field(ge=0, le=1000)
    max_members: int = Field(ge=1, le=100)
    active: bool = True
    highlight: bool = False


@app.put("/admin/plans/{plan_id}")
def admin_update_plan(plan_id: int, body: PlanIn, _: User = Depends(require_super), db: Session = Depends(get_db)):
    p = db.get(Plan, plan_id)
    if not p:
        raise HTTPException(404, "Plan inexistente")
    price_changed = p.price_ars != body.price_ars
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit()
    failed = repriced = 0
    if price_changed and billing.mp_enabled():
        # el nuevo precio rige desde el proximo cobro de las bandas suscriptas a este plan
        for b in db.query(Band).filter(Band.plan_id == p.id, Band.mp_status == "authorized",
                                       Band.mp_preapproval_id.isnot(None)).all():
            try:
                billing.reprice_preapproval(b.mp_preapproval_id, p.price_ars)
                repriced += 1
            except billing.MPError:
                failed += 1
    return {"ok": True, "repriced": repriced, "failed": failed}


@app.get("/admin/contact-messages")
def admin_messages(_: User = Depends(require_super), db: Session = Depends(get_db)):
    return [{"id": m.id, "name": m.name, "email": m.email, "band": m.band, "message": m.message,
             "handled": m.handled, "emailed": m.emailed, "created_at": m.created_at}
            for m in db.query(ContactMessage).order_by(ContactMessage.created_at.desc()).limit(200).all()]


@app.put("/admin/contact-messages/{mid}")
def admin_message_handled(mid: int, handled: bool = True, _: User = Depends(require_super), db: Session = Depends(get_db)):
    m = db.get(ContactMessage, mid)
    if not m:
        raise HTTPException(404, "No encontrado")
    m.handled = handled
    db.commit()
    return {"ok": True}


@app.delete("/admin/contact-messages/{mid}")
def admin_message_delete(mid: int, _: User = Depends(require_super), db: Session = Depends(get_db)):
    m = db.get(ContactMessage, mid)
    if m:
        db.delete(m)
        db.commit()
    return {"ok": True}


# ----------------------------------------------------------------- contacto y chat (publicos)

class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    band: str = Field("", max_length=120)
    message: str = Field(min_length=5, max_length=3000)
    website: str = ""                    # honeypot: las personas no lo ven ni lo completan
    turnstile_token: str = ""


_contact_hits: dict[str, list[float]] = {}


@app.post("/contact")
def contact(body: ContactIn, request: Request, db: Session = Depends(get_db)):
    import time
    ip = _client_ip(request)
    if body.website.strip():
        return {"ok": True}  # robot: se hace como que salio bien
    t = time.time()
    hits = [h for h in _contact_hits.get(ip, []) if t - h < 3600]
    if len(hits) >= 5:
        raise HTTPException(429, "Enviaste varios mensajes seguidos. Probá de nuevo en un rato.")
    if not mail.verify_turnstile(body.turnstile_token, ip):
        raise HTTPException(400, "No pudimos verificar que no sos un robot. Marcá la casilla e intentá de nuevo.")
    email = body.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(422, "Revisá el email")
    hits.append(t)
    _contact_hits[ip] = hits
    m = ContactMessage(name=body.name.strip(), email=email, band=body.band.strip(), message=body.message.strip())
    db.add(m)
    db.commit()
    m.emailed = mail.send_mail(
        f"[Diablo Master Mix] Mensaje de {m.name}" + (f" ({m.band})" if m.band else ""),
        f"Nombre: {m.name}\nEmail: {m.email}\nBanda: {m.band or '-'}\n\n{m.message}", reply_to=m.email)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------- alta automatica (compra desde la portada)
_signup_hits: dict[str, list[float]] = {}
_sync_hits: dict[str, list[float]] = {}


class SignupIn(BaseModel):
    plan_id: int
    band_name: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=255)
    payer_email: str = Field("", max_length=255)      # solo si la cuenta de Mercado Pago usa otro mail
    method: str = Field("mp", pattern="^(mp|polar)$")
    website: str = ""                                  # trampa para robots
    turnstile_token: str = ""


def _rate(store: dict, ip: str, limit: int, window: int = 3600) -> bool:
    import time
    t = time.time()
    hits = [h for h in store.get(ip, []) if t - h < window]
    if len(hits) >= limit:
        store[ip] = hits
        return False
    hits.append(t)
    store[ip] = hits
    return True


@app.post("/public/signup")
def public_signup(body: SignupIn, request: Request, db: Session = Depends(get_db)):
    """Una banda nueva elige un plan: se crea la suscripcion en Mercado Pago y se devuelve el link de pago.
    La cuenta se crea recien cuando Mercado Pago autoriza el pago (ver billing.complete_signup)."""
    ip = _client_ip(request)
    if body.website.strip():
        raise HTTPException(400, "No pudimos procesar la solicitud")
    if not _rate(_signup_hits, ip, 6):
        raise HTTPException(429, "Hiciste varios intentos seguidos. Probá de nuevo en un rato.")
    if not mail.verify_turnstile(body.turnstile_token, ip):
        raise HTTPException(400, "No pudimos verificar que no sos un robot. Marcá la casilla e intentá de nuevo.")
    email = body.email.strip().lower()
    payer = body.payer_email.strip().lower()
    mailre = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    if not re.match(mailre, email) or (payer and not re.match(mailre, payer)):
        raise HTTPException(422, "Revisá el email")
    plan = db.get(Plan, body.plan_id)
    if not plan or not plan.active:
        raise HTTPException(404, "Ese plan no está disponible")
    if body.method == "polar":
        if not polar.enabled():
            raise HTTPException(503, "El cobro en dólares todavía no está activado. Escribinos desde Contacto y te ayudamos.")
    elif not billing.mp_enabled():
        raise HTTPException(503, "El cobro online todavía no está activado. Escribinos desde Contacto y te ayudamos.")
    band_name = " ".join(body.band_name.split())
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(409, "Ese email ya tiene una cuenta. Entrá y activá el plan desde la sección Plan de tu banda.")
    if db.query(Band).filter(func.lower(Band.name) == band_name.lower()).first():
        raise HTTPException(409, "Ya existe una banda con ese nombre. Probá con otro.")
    base = PUBLIC_URL or str(request.base_url).rstrip("/")
    if body.method == "polar":
        try:
            return {"init_point": polar.start_signup(db, plan, band_name, " ".join(body.name.split()), email, base)}
        except polar.PolarError as e:
            log.warning("signup Polar: %s", e)
            raise HTTPException(424, "No pudimos iniciar el pago. Probá de nuevo en unos minutos.") from None
    try:
        link = billing.start_signup(db, plan, band_name, " ".join(body.name.split()), email, payer, base)
    except billing.MPError:
        raise HTTPException(424, "No pudimos iniciar el pago con Mercado Pago. Probá de nuevo en unos minutos.") from None
    return {"init_point": link}


class SignupSyncIn(BaseModel):
    token: str = Field(min_length=10, max_length=64)


@app.post("/public/signup-sync")
def public_signup_sync(body: SignupSyncIn, request: Request, db: Session = Depends(get_db)):
    """Al volver de Mercado Pago: confirma el alta sin esperar al aviso. Solo devuelve el estado."""
    if not _rate(_sync_hits, _client_ip(request), 90):
        raise HTTPException(429, "Demasiadas consultas")
    su = db.query(Signup).filter_by(token=body.token).first()
    if not su:
        raise HTTPException(404, "No encontramos ese pedido")
    if su.status == "pending":
        try:
            if su.provider == "polar":
                polar.sync_signup(db, su)
            else:
                billing.sync_signup(db, su)
        except (billing.MPError, polar.PolarError):
            pass
    return {"status": su.status}


class ChatIn(BaseModel):
    message: str = Field(max_length=2000)
    history: list[dict] = Field(default_factory=list, max_length=40)


@app.post("/chat")
def chat_endpoint(body: ChatIn, request: Request, db: Session = Depends(get_db)):
    if not CHAT_ENABLED:
        raise HTTPException(404, "Chat desactivado")
    limit = chat.rate_ok(_client_ip(request))
    if limit:
        return {"reply": limit, "limited": True}
    plans = db.query(Plan).filter_by(active=True).order_by(Plan.sort).all()
    return {"reply": chat.reply(body.message, body.history, plans)}


# ---------------------------------------------------------------- front (al final)
# Se monta al final para que las rutas de la API tengan prioridad sobre los archivos estaticos.
from fastapi.staticfiles import StaticFiles  # noqa: E402


CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
])
SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # el microfono se usa para grabar ensayos; el resto de sensores y pagos del navegador, apagados
    "Permissions-Policy": "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), "
                          "serial=(), midi=(), accelerometer=(), gyroscope=(), magnetometer=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    lg = request.headers.get("x-lang", "es")[:2]
    config.REQ_LANG.set(lg if lg in config.LANG_NAMES else "es")
    resp = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        resp.headers.setdefault(k, v)
    # las respuestas de la API (con datos de personas, tokens, pagos) nunca se guardan en caches intermedias
    if resp.headers.get("content-type", "").startswith("application/json"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.middleware("http")
async def revalidate_shell(request: Request, call_next):
    """El front (html, js, css) se revalida siempre, para que un deploy nuevo se vea al instante aunque haya caché en el medio."""
    resp = await call_next(request)
    p = request.url.path
    if (p == "/" or p.endswith((".js", ".css", ".html", ".webmanifest"))) and "cache-control" not in resp.headers:
        resp.headers["Cache-Control"] = "no-cache"
    return resp


STATIC_DIR = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="front")
