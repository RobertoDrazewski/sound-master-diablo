"""Avisos en el celular (Web Push) y número en el ícono de la app.

Sin costo ni cuentas externas: el navegador de cada persona usa su propio servicio de push (Apple, Google, Mozilla).
Las claves VAPID se generan una sola vez y quedan en el volumen de datos, como la clave de firma.
"""
import base64
import json
import logging
import threading
import time
from datetime import timedelta

from sqlalchemy import event
from sqlalchemy.orm import Session, object_session

from .config import DATA_DIR, PUBLIC_URL
from .db import Event, Membership, Notification, PushSubscription, SessionLocal, now

log = logging.getLogger("push")
_KEY_FILE = DATA_DIR / "vapid_private.pem"
_vapid = None
_lock = threading.Lock()


def _load_vapid():
    global _vapid
    with _lock:
        if _vapid is None:
            from py_vapid import Vapid
            if _KEY_FILE.exists():
                _vapid = Vapid.from_file(str(_KEY_FILE))
            else:
                _vapid = Vapid()
                _vapid.generate_keys()
                _vapid.save_key(str(_KEY_FILE))
                _KEY_FILE.chmod(0o600)
        return _vapid


def public_key() -> str:
    """Clave pública (base64url) que el navegador necesita para suscribirse."""
    from cryptography.hazmat.primitives import serialization
    raw = _load_vapid().public_key.public_bytes(serialization.Encoding.X962,
                                                serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def unread_total(db, user_id: int) -> int:
    """Lo mismo que cuenta la campanita: avisos sin leer + eventos de las próximas 24 h."""
    n = db.query(Notification).filter_by(user_id=user_id, read=False).count()
    ids = [m.band_id for m in db.query(Membership).filter_by(user_id=user_id).all()]
    if ids:
        n += db.query(Event).filter(Event.band_id.in_(ids), Event.starts_at >= now() - timedelta(hours=3),
                                    Event.starts_at <= now() + timedelta(hours=24)).count()
    return n


def send_to_user(db, user_id: int, title: str, body: str, link: str = "", tag: str = "") -> int:
    """Manda un aviso a todos los celulares de la persona. Devuelve cuántos salieron."""
    subs = db.query(PushSubscription).filter_by(user_id=user_id).all()
    if not subs:
        return 0
    from pywebpush import WebPushException, webpush
    payload = json.dumps({"title": title, "body": body, "link": link, "tag": tag,
                          "badge": unread_total(db, user_id)})
    claims_sub = PUBLIC_URL or "https://diablomastermix.com.ar"
    sent = 0
    for s in subs:
        try:
            webpush({"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}}, data=payload,
                    vapid_private_key=_load_vapid(), vapid_claims={"sub": claims_sub}, ttl=86400, timeout=10)
            sent += 1
        except WebPushException as e:
            code = getattr(getattr(e, "response", None), "status_code", None)
            if code in (404, 410):          # el celular ya no recibe: se borra
                db.delete(s)
            else:
                log.warning("push fallido (%s): %s", code, str(e)[:160])
        except Exception as e:              # red, clave, etc.: nunca rompe lo que lo disparó
            log.warning("push fallido: %s", str(e)[:160])
    db.commit()
    return sent


# ---- cada aviso nuevo de la plataforma sale también como push, después de guardarse

@event.listens_for(Notification, "after_insert")
def _collect(mapper, connection, target):
    s = object_session(target)
    if s is not None:
        s.info.setdefault("push", []).append((target.user_id, target.text, target.link or "", target.id))


@event.listens_for(Session, "after_rollback")
def _drop(session):
    session.info.pop("push", None)


@event.listens_for(Session, "after_commit")
def _flush(session):
    items = session.info.pop("push", None)
    if items:
        threading.Thread(target=_send_many, args=(items,), daemon=True).start()


def _send_many(items):
    try:
        with SessionLocal() as db:
            for uid, text, link, nid in items:
                send_to_user(db, uid, "Diablo Master Mix", text, link, tag=f"n{nid}")
    except Exception as e:
        log.warning("push: %s", str(e)[:160])


# ---- recordatorio de eventos: una hora antes

def _remind_events():
    from .notify import notify_band
    with SessionLocal() as db:
        t = now()
        rows = db.query(Event).filter(Event.reminded_at.is_(None), Event.starts_at <= t + timedelta(hours=1)).all()
        for ev in rows:
            ev.reminded_at = t
            recien_creado = ev.created_at >= ev.starts_at - timedelta(hours=1)
            if ev.starts_at > t and not recien_creado:       # ya empezó, o se agendó hace poco: sin aviso
                donde = f" en {ev.place}" if ev.place else ""
                notify_band(db, ev.band_id, f'En una hora: {ev.title}{donde}', kind="evento",
                            link=f"#/band/{ev.band_id}/calendario")
        db.commit()


def _loop():
    while True:
        try:
            _remind_events()
        except Exception as e:
            log.warning("recordatorios: %s", str(e)[:160])
        time.sleep(60)


def start():
    try:
        _load_vapid()
    except Exception as e:
        log.warning("push: no se pudieron preparar las claves: %s", str(e)[:160])
        return
    threading.Thread(target=_loop, daemon=True, name="push-recordatorios").start()
