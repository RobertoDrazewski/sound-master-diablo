import json
import re
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import audio
from .config import (BAND_QUOTA_GB, CORS_ORIGINS, DATA_DIR, DEFAULT_GENRES,
                     INVITE_TTL_DAYS, MAX_UPLOAD_MB, RAW_RETENTION_DAYS,
                     REFERENCE_SECONDS, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
from .db import (ApiToken, Band, Genre, Invite, Job, Membership, Reference,
                 SessionLocal, Track, User, Version, init_db, now)
from .security import (create_media_token, create_session_jwt,
                       decode_media_token, decode_session_jwt, hash_password,
                       new_secret, sha256, throttle, verify_password)
from .worker import remove_version_files, worker


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with SessionLocal() as db:
        if db.query(Genre).count() == 0:
            for name, lufs in DEFAULT_GENRES.items():
                db.add(Genre(name=name, target_lufs=lufs))
        if db.query(User).count() == 0 and SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD:
            db.add(User(email=SUPERADMIN_EMAIL.lower(), name="Super admin", is_super=True,
                        password_hash=hash_password(SUPERADMIN_PASSWORD)))
        db.commit()
    worker.start()
    yield
    worker.stop()


app = FastAPI(title="Masterizador de ensayos", lifespan=lifespan)
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
    # 404 y no 403: no revelar que la banda existe
    if role is None or (admin and role != "admin"):
        raise HTTPException(404 if role is None else 403, "No encontrado" if role is None else "Requiere admin de la banda")
    return role


def user_band_ids(db: Session, user: User) -> list[int]:
    if user.is_super:
        return [b.id for b in db.query(Band.id).all()]
    return [m.band_id for m in db.query(Membership).filter_by(user_id=user.id).all()]


# ----------------------------------------------------------------------- schemas

class LoginIn(BaseModel):
    email: str
    password: str


class AcceptInviteIn(BaseModel):
    token: str
    name: str = ""
    password: str = Field(min_length=10)


class BandIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class InviteIn(BaseModel):
    email: str
    band_id: int
    role: str = "member"


class GenreIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    target_lufs: float = Field(default=-14.0, ge=-24, le=-6)


class TokenIn(BaseModel):
    label: str = "reaper"


class MasterIn(BaseModel):
    reference_id: int | None = None
    genre_id: int | None = None
    lufs: float | None = Field(default=None, ge=-24, le=-6)
    separate_stems: bool = False


# ------------------------------------------------------------------------ helpers

def safe_name(text: str, fallback: str = "sin-nombre") -> str:
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
        "id": t.id, "band_id": t.band_id, "title": t.title,
        "uploaded_by": who.name or who.email if who else None,
        "created_at": t.created_at.isoformat(),
        "versions": [version_out(v, db) for v in t.versions],
    }


def ingest_files(db: Session, user: User, track: Track, mode: str, files: list[UploadFile]):
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
        db.add(Job(kind="ingest", payload=json.dumps({"tmp_path": str(tmp)}),
                   version_id=v.id, created_by=user.id))
    db.commit()
    worker.wake.set()


def check_quota(db: Session, band_id: int, incoming: int = 0):
    if band_used_bytes(db, band_id) + incoming > BAND_QUOTA_GB * 1e9:
        raise HTTPException(413, "La banda llego al tope de espacio. Borra ensayos viejos.")


# --------------------------------------------------------------------------- auth

@app.get("/health")
def health():
    return {"ok": True}


@app.post("/auth/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    key = f"{email}|{request.client.host if request.client else '?'}"
    if throttle.blocked(key):
        raise HTTPException(429, "Demasiados intentos. Espera unos minutos.")
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.active or not verify_password(body.password, user.password_hash):
        throttle.fail(key)
        raise HTTPException(401, "Email o contrasena incorrectos")
    throttle.ok(key)
    return {"token": create_session_jwt(user.id)}


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
        db.add(Membership(user_id=user.id, band_id=inv.band_id, role=inv.role))
    inv.used_at = now()
    db.commit()
    return {"token": create_session_jwt(user.id)}


@app.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ids = user_band_ids(db, user)
    bands = db.query(Band).filter(Band.id.in_(ids)).order_by(Band.name).all() if ids else []
    return {
        "id": user.id, "email": user.email, "name": user.name, "is_super": user.is_super,
        "bands": [{"id": b.id, "name": b.name, "role": band_role(db, user, b.id)} for b in bands],
    }


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

@app.post("/admin/bands")
def create_band(body: BandIn, _: User = Depends(require_super), db: Session = Depends(get_db)):
    if db.query(Band).filter(Band.name == body.name.strip()).first():
        raise HTTPException(409, "Ya existe una banda con ese nombre")
    band = Band(name=body.name.strip())
    db.add(band)
    db.commit()
    return {"id": band.id, "name": band.name}


@app.get("/admin/bands")
def admin_bands(_: User = Depends(require_super), db: Session = Depends(get_db)):
    out = []
    for b in db.query(Band).order_by(Band.name).all():
        members = (db.query(Membership, User).join(User, User.id == Membership.user_id)
                   .filter(Membership.band_id == b.id).all())
        out.append({
            "id": b.id, "name": b.name,
            "used_gb": round(band_used_bytes(db, b.id) / 1e9, 2), "quota_gb": BAND_QUOTA_GB,
            "members": [{"user_id": u.id, "email": u.email, "name": u.name, "role": m.role}
                        for m, u in members],
        })
    return out


@app.post("/admin/invites")
def create_invite(body: InviteIn, request: Request, user: User = Depends(require_super),
                  db: Session = Depends(get_db)):
    if body.role not in ("admin", "member"):
        raise HTTPException(422, "role debe ser admin o member")
    if not db.get(Band, body.band_id):
        raise HTTPException(404, "Banda inexistente")
    token = new_secret()
    db.add(Invite(token_hash=sha256(token), email=body.email.strip().lower(), band_id=body.band_id,
                  role=body.role, expires_at=now() + timedelta(days=INVITE_TTL_DAYS)))
    db.commit()
    base = str(request.base_url).rstrip("/")
    return {"invite_token": token, "expires_in_days": INVITE_TTL_DAYS,
            "link_hint": f"{base}/invite?token={token}"}


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
    return [{"id": g.id, "name": g.name, "target_lufs": g.target_lufs}
            for g in db.query(Genre).order_by(Genre.name).all()]


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
             "scope": "global" if r.band_id is None else "band", "band_id": r.band_id}
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
    ref = Reference(genre_id=genre_id, band_id=band_id, name=safe_name(name),
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
def list_tracks(band_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    need_member(db, user, band_id)
    tracks = db.query(Track).filter_by(band_id=band_id).order_by(Track.id.desc()).all()
    return {"used_gb": round(band_used_bytes(db, band_id) / 1e9, 2), "quota_gb": BAND_QUOTA_GB,
            "tracks": [track_out(t, db) for t in tracks]}


@app.post("/bands/{band_id}/tracks")
def upload_track(band_id: int, title: str = Form(""), mode: str = Form("mix"),
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
    track = Track(band_id=band_id, title=name, uploaded_by=user.id)
    db.add(track)
    db.flush()
    ingest_files(db, user, track, mode, files)
    return track_out(track, db)


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
    if admin:
        role = band_role(db, user, track.band_id)
        if not (role == "admin" or track.uploaded_by == user.id):
            raise HTTPException(403, "Solo quien lo subio o un admin de la banda")
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

    lufs, label = -14.0, "master"
    if body.genre_id:
        g = db.get(Genre, body.genre_id)
        if not g:
            raise HTTPException(404, "Genero inexistente")
        lufs, label = g.target_lufs, f"master {g.name}"
    if body.lufs is not None:
        lufs = body.lufs
    if body.reference_id:
        ref = db.get(Reference, body.reference_id)
        if not ref or (ref.band_id is not None and ref.band_id != track.band_id):
            raise HTTPException(404, "Referencia inexistente")
        label = f"master ref: {ref.name}"

    v = Version(track_id=track.id, kind="master", label=label, status="processing", created_by=user.id)
    db.add(v)
    db.flush()
    job = Job(kind="master", version_id=v.id, created_by=user.id,
              payload=json.dumps({"reference_id": body.reference_id, "lufs": lufs,
                                  "separate_stems": body.separate_stems}))
    db.add(job)
    db.commit()
    worker.wake.set()
    return {"job_id": job.id, "version_id": v.id}


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
