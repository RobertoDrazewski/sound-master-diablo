"""Borrado definitivo de una banda: archivos, registros y cuentas que solo existian por ella.

Lo usan la baja de suscripcion (a las PURGE_HOURS) y el borrado manual del super admin.
Los pagos se conservan (Payment.band_id pasa a NULL y queda el nombre) por registro contable.
"""
import logging
import shutil
from pathlib import Path

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import DATA_DIR
from .db import (Album, Band, Event, Invite, Job, Membership, Notification, Reference, Track, UsageEvent, User,
                 Version)

log = logging.getLogger("uvicorn.error")


def _drop_photo(kind: str, obj) -> None:
    if obj.photo:
        (DATA_DIR / "images" / kind / f"{obj.id}-{obj.photo}.jpg").unlink(missing_ok=True)
        (DATA_DIR / "images" / kind / f"{obj.id}-{obj.photo}-hd.jpg").unlink(missing_ok=True)


def delete_band(db: Session, band: Band, delete_orphan_users: bool = False) -> int:
    """Elimina todo lo de la banda. Con delete_orphan_users tambien borra las cuentas de integrantes que no
    pertenecen a ninguna otra banda (el super admin nunca). Devuelve cuantas cuentas borro."""
    from .worker import remove_version_files   # import tardio: worker no importa este modulo

    band_id = band.id
    member_ids = [m.user_id for m in db.query(Membership).filter_by(band_id=band_id).all()]
    for t in db.query(Track).filter_by(band_id=band_id).all():
        for v in t.versions:
            remove_version_files(v)
    for r in db.query(Reference).filter_by(band_id=band_id).all():
        Path(r.path).unlink(missing_ok=True)
    for a in db.query(Album).filter_by(band_id=band_id).all():
        _drop_photo("albums", a)
    _drop_photo("bands", band)
    shutil.rmtree(DATA_DIR / "bands" / str(band_id), ignore_errors=True)
    db.query(Job).filter(Job.version_id.in_(
        db.query(Version.id).join(Track, Track.id == Version.track_id).filter(Track.band_id == band_id))).delete(
        synchronize_session=False)
    db.query(Track).filter_by(band_id=band_id).delete(synchronize_session=False)
    db.query(Album).filter_by(band_id=band_id).delete(synchronize_session=False)
    db.query(Event).filter_by(band_id=band_id).delete(synchronize_session=False)
    db.query(Notification).filter_by(band_id=band_id).delete(synchronize_session=False)
    db.query(Membership).filter_by(band_id=band_id).delete(synchronize_session=False)
    db.query(Reference).filter_by(band_id=band_id).delete(synchronize_session=False)
    db.query(Invite).filter_by(band_id=band_id).delete(synchronize_session=False)
    db.query(UsageEvent).filter_by(band_id=band_id).delete(synchronize_session=False)
    db.delete(band)
    db.commit()

    removed = 0
    if delete_orphan_users:
        for uid in member_ids:
            u = db.get(User, uid)
            if not u or u.is_super or db.query(Membership).filter_by(user_id=uid).count():
                continue
            if u.photo:
                (DATA_DIR / "images" / "users" / f"{u.id}-{u.photo}.jpg").unlink(missing_ok=True)
                (DATA_DIR / "images" / "users" / f"{u.id}-{u.photo}-hd.jpg").unlink(missing_ok=True)
            try:
                db.delete(u)
                db.commit()
                removed += 1
            except IntegrityError:
                db.rollback()
                log.warning("no se pudo borrar la cuenta %s al eliminar la banda %s", uid, band_id)
    return removed
