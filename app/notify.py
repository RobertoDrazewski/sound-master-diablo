from .db import Membership, Notification


def notify_band(db, band_id: int, text: str, exclude_user_id: int | None = None,
                kind: str = "info", link: str = "") -> None:
    """Crea un aviso para cada integrante de la banda (menos quien hizo la accion).
    No hace commit: lo hace quien llama."""
    ids = {m.user_id for m in db.query(Membership).filter_by(band_id=band_id).all()}
    for uid in ids:
        if uid != exclude_user_id:
            db.add(Notification(user_id=uid, band_id=band_id, kind=kind, text=text[:300], link=link))
