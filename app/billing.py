"""Suscripciones por banda con Mercado Pago (preapproval = cobro mensual automatico).

Quien paga es el admin de la banda; se cobra por banda, no por musico.
El estado se calcula siempre a partir de fechas (no hay un "cron" que pueda fallar en silencio):
  exempt     la banda no paga (decision del super admin)
  trial      prueba gratis vigente
  active     pagado hasta `paid_until`
  past_due   se vencio el pago y esta en los dias de gracia (todavia puede trabajar)
  suspended  sin pago / bloqueada: solo lectura y descargas (los archivos no se borran)
"""
import hashlib
import hmac
import json
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import config
from .netutil import HTTPFail, http_json
from .db import Band, Payment, Plan, Track, UsageEvent, Version, now

MP_API = "https://api.mercadopago.com"

# Precios en ARS (editables desde el panel de super admin). Costos estimados por banda y mes:
# disco + IA + comision de MP (~8%). Ver el analisis en la documentacion.
PLANS_SEED = [
    dict(slug="garage", name="Garage", tagline="Para la banda que recién arranca a grabar",
         price_ars=9900, quota_gb=5, masters_month=12, ai_covers_month=3, ai_notes_day=10, max_members=8, sort=1),
    dict(slug="estudio", name="Estudio", tagline="El plan de la banda que lanza música en serio",
         price_ars=19900, quota_gb=15, masters_month=40, ai_covers_month=10, ai_notes_day=25, max_members=8, sort=2,
         highlight=True),
    dict(slug="pro", name="Pro", tagline="Discos completos, varias sesiones y mucho material",
         price_ars=34900, quota_gb=40, masters_month=120, ai_covers_month=30, ai_notes_day=60, max_members=12, sort=3),
]


def seed_plans(db: Session):
    if db.query(Plan).count() == 0:
        for p in PLANS_SEED:
            db.add(Plan(**p))
        db.commit()


def month_start(t: datetime | None = None) -> datetime:
    t = t or now()
    return t.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


# ------------------------------------------------------------------------------- estado

def band_plan(db: Session, band: Band) -> Plan | None:
    if band.plan_id:
        return db.get(Plan, band.plan_id)
    return None


def status(db: Session, band: Band) -> dict:
    t = now()
    plan = band_plan(db, band)
    base = {"plan": plan.slug if plan else None, "plan_name": plan.name if plan else None,
            "mp_status": band.mp_status, "paid_until": band.paid_until, "trial_ends_at": band.trial_ends_at}
    if band.blocked:
        return {**base, "state": "suspended", "can_write": False, "reason": "blocked",
                "label": "Servicio suspendido"}
    if band.exempt:
        return {**base, "state": "exempt", "can_write": True, "label": "Sin cargo"}
    if band.paid_until and band.paid_until > t:
        return {**base, "state": "active", "can_write": True, "label": "Activa",
                "days_left": (band.paid_until - t).days}
    if band.paid_until and t <= band.paid_until + timedelta(days=config.PAST_DUE_GRACE_DAYS):
        return {**base, "state": "past_due", "can_write": True, "label": "Pago pendiente",
                "days_left": (band.paid_until + timedelta(days=config.PAST_DUE_GRACE_DAYS) - t).days}
    if not band.paid_until and band.trial_ends_at and band.trial_ends_at > t:
        return {**base, "state": "trial", "can_write": True, "label": "Prueba gratis",
                "days_left": (band.trial_ends_at - t).days}
    return {**base, "state": "suspended", "can_write": False, "reason": "unpaid",
            "label": "Suscripción vencida" if band.paid_until or band.trial_ends_at else "Sin suscripción"}


def limits(db: Session, band: Band) -> dict:
    """Topes vigentes. None = sin tope (bandas exentas usan los valores globales)."""
    if band.exempt:
        return {"quota_gb": config.BAND_QUOTA_GB, "masters_month": None, "ai_covers_month": None,
                "ai_notes_day": config.ASSISTANT_DAILY_LIMIT, "max_members": None}
    plan = band_plan(db, band) or db.query(Plan).filter_by(slug="estudio").first()
    if not plan:
        return {"quota_gb": 5, "masters_month": 12, "ai_covers_month": 3, "ai_notes_day": 10, "max_members": 8}
    return {"quota_gb": plan.quota_gb, "masters_month": plan.masters_month, "ai_covers_month": plan.ai_covers_month,
            "ai_notes_day": plan.ai_notes_day, "max_members": plan.max_members}


def usage(db: Session, band_id: int) -> dict:
    ms = month_start()
    masters = (db.query(func.count(Version.id)).join(Track, Track.id == Version.track_id)
               .filter(Track.band_id == band_id, Version.kind == "master", Version.created_at >= ms).scalar() or 0)
    covers = db.query(func.count(UsageEvent.id)).filter(
        UsageEvent.band_id == band_id, UsageEvent.kind == "cover", UsageEvent.at >= ms).scalar() or 0
    day = now().replace(hour=0, minute=0, second=0, microsecond=0)
    notes = db.query(func.count(UsageEvent.id)).filter(
        UsageEvent.band_id == band_id, UsageEvent.kind == "note", UsageEvent.at >= day).scalar() or 0
    return {"masters_month": masters, "ai_covers_month": covers, "ai_notes_day": notes}


def record_usage(db: Session, band_id: int, kind: str):
    db.add(UsageEvent(band_id=band_id, kind=kind))
    db.commit()


# --------------------------------------------------------------------------- Mercado Pago

class MPError(Exception):
    pass


def mp_enabled() -> bool:
    return bool(config.MP_ACCESS_TOKEN)


def _mp(method: str, path: str, body: dict | None = None) -> dict:
    if not mp_enabled():
        raise MPError("Mercado Pago no está configurado todavía (falta MP_ACCESS_TOKEN).")
    try:
        return http_json(method, MP_API + path, body=body,
                         headers={"Authorization": f"Bearer {config.MP_ACCESS_TOKEN}"})
    except HTTPFail as e:
        raise MPError(f"Mercado Pago respondió {e.status}: {e.message}") from e


def create_preapproval(band: Band, plan: Plan, payer_email: str, back_url: str, start_in_days: int = 0) -> dict:
    """Crea la suscripcion y devuelve {id, init_point}. El pago real lo autoriza el cliente en Mercado Pago."""
    auto = {"frequency": 1, "frequency_type": "months", "transaction_amount": plan.price_ars,
            "currency_id": config.BILLING_CURRENCY}
    if start_in_days > 0:  # prueba gratis: el primer cobro es al terminar el trial
        auto["start_date"] = (datetime.utcnow() + timedelta(days=start_in_days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    data = _mp("POST", "/preapproval", {
        "reason": f"Diablo Master Mix · Plan {plan.name}",
        "external_reference": f"band:{band.id}",
        "payer_email": payer_email,
        "back_url": back_url,
        "status": "pending",
        "auto_recurring": auto,
    })
    return {"id": data["id"], "init_point": data.get("init_point") or data.get("sandbox_init_point")}


def get_preapproval(pid: str) -> dict:
    return _mp("GET", f"/preapproval/{pid}")


def cancel_preapproval(pid: str):
    _mp("PUT", f"/preapproval/{pid}", {"status": "cancelled"})


def reprice_preapproval(pid: str, amount: int):
    _mp("PUT", f"/preapproval/{pid}", {"auto_recurring": {"transaction_amount": amount,
                                                          "currency_id": config.BILLING_CURRENCY}})


def get_authorized_payment(pid: str) -> dict:
    return _mp("GET", f"/authorized_payments/{pid}")


def verify_signature(headers, data_id: str) -> bool:
    """Valida el x-signature de las notificaciones. Si no hay secreto configurado, se confia en el re-fetch a la API."""
    if not config.MP_WEBHOOK_SECRET:
        return True
    sig = headers.get("x-signature", "")
    req_id = headers.get("x-request-id", "")
    parts = dict(p.strip().split("=", 1) for p in sig.split(",") if "=" in p)
    ts, v1 = parts.get("ts"), parts.get("v1")
    if not ts or not v1:
        return False
    manifest = f"id:{str(data_id).lower()};request-id:{req_id};ts:{ts};"
    mine = hmac.new(config.MP_WEBHOOK_SECRET.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(mine, v1)


def _band_from_ref(db: Session, ref: str | None, pid: str | None = None) -> Band | None:
    if ref and ref.startswith("band:"):
        try:
            b = db.get(Band, int(ref.split(":", 1)[1]))
            if b:
                return b
        except ValueError:
            pass
    if pid:
        return db.query(Band).filter_by(mp_preapproval_id=pid).first()
    return None


def apply_preapproval(db: Session, data: dict) -> Band | None:
    """Sincroniza la banda con lo que dice Mercado Pago (fuente de verdad)."""
    band = _band_from_ref(db, data.get("external_reference"), data.get("id"))
    if not band:
        return None
    if band.mp_preapproval_id and band.mp_preapproval_id != data.get("id"):
        # una suscripcion vieja/duplicada: solo importa la que la banda tiene registrada
        return band
    st = data.get("status")
    band.mp_preapproval_id = data.get("id")
    band.mp_status = st
    if data.get("payer_email"):
        band.mp_payer_email = data["payer_email"]
    if st == "authorized":
        if band.pending_plan_id:
            band.plan_id, band.pending_plan_id = band.pending_plan_id, None
        nxt = data.get("next_payment_date")
        if nxt and not band.paid_until:
            # autorizada y con trial pendiente: queda en prueba hasta el primer cobro
            try:
                nd = datetime.fromisoformat(nxt.replace("Z", "+00:00")).replace(tzinfo=None)
                band.trial_ends_at = max(band.trial_ends_at or nd, nd) if nd > now() else band.trial_ends_at
            except ValueError:
                pass
    db.commit()
    return band


def apply_payment(db: Session, data: dict) -> Band | None:
    """Un cobro mensual (authorized_payment)."""
    pid = data.get("preapproval_id")
    band = _band_from_ref(db, data.get("external_reference"), pid)
    if not band:
        return None
    st = data.get("status")
    mp_id = str(data.get("id"))
    paid = data.get("payment", {}) or {}
    amount = data.get("transaction_amount") or paid.get("transaction_amount") or 0
    pay = db.query(Payment).filter_by(mp_id=mp_id).first()
    if st in ("processed", "approved") and (paid.get("status") in (None, "approved") or st == "approved"):
        if not pay:
            db.add(Payment(band_id=band.id, band_name=band.name, mp_id=mp_id, amount=float(amount),
                           currency=data.get("currency_id", "ARS"), status="approved"))
            base = max(band.paid_until or now(), now())
            band.paid_until = base + timedelta(days=31)
            band.trial_ends_at = None if band.trial_ends_at and band.trial_ends_at < now() else band.trial_ends_at
            if band.pending_plan_id:
                band.plan_id, band.pending_plan_id = band.pending_plan_id, None
    elif st in ("rejected", "cancelled") and not pay:
        db.add(Payment(band_id=band.id, band_name=band.name, mp_id=mp_id, amount=float(amount),
                       currency=data.get("currency_id", "ARS"), status="rejected"))
    db.commit()
    return band


def handle_notification(db: Session, topic: str, rid: str):
    """Re-consulta el recurso a la API (nunca confiamos en el cuerpo del webhook)."""
    if topic in ("subscription_preapproval", "preapproval"):
        apply_preapproval(db, get_preapproval(rid))
    elif topic in ("subscription_authorized_payment", "authorized_payment"):
        apply_payment(db, get_authorized_payment(rid))


def sync_band(db: Session, band: Band):
    """Reconciliacion: pregunta a MP el estado actual de la suscripcion de la banda."""
    if not band.mp_preapproval_id or not mp_enabled():
        return
    data = get_preapproval(band.mp_preapproval_id)
    apply_preapproval(db, data)
    # ultimos cobros de esta suscripcion
    try:
        res = _mp("GET", f"/authorized_payments/search?preapproval_id={band.mp_preapproval_id}")
        for p in (res.get("results") or [])[:6]:
            p.setdefault("preapproval_id", band.mp_preapproval_id)
            apply_payment(db, p)
    except MPError:
        pass


def reconcile_all(db: Session):
    """Corre una vez al dia: sincroniza las bandas con suscripcion que estan por vencer o ya vencieron."""
    t = now()
    for b in db.query(Band).filter(Band.mp_preapproval_id.isnot(None), Band.exempt.is_(False)).all():
        if not b.paid_until or b.paid_until < t + timedelta(days=2):
            try:
                sync_band(db, b)
            except MPError:
                continue


def overview(db: Session) -> dict:
    bands = db.query(Band).all()
    counts = {"exempt": 0, "trial": 0, "active": 0, "past_due": 0, "suspended": 0}
    mrr = 0
    for b in bands:
        s = status(db, b)
        counts[s["state"]] += 1
        if s["state"] in ("active", "past_due") and b.mp_status == "authorized":
            p = band_plan(db, b)
            mrr += p.price_ars if p else 0
    ms = month_start()
    collected = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status == "approved", Payment.paid_at >= ms).scalar() or 0
    return {"bands": len(bands), **counts, "mrr": mrr, "collected_month": float(collected)}


def public_plans(db: Session) -> list[dict]:
    return [plan_dict(p) for p in db.query(Plan).filter_by(active=True).order_by(Plan.sort).all()]


def plan_dict(p: Plan) -> dict:
    return {"id": p.id, "slug": p.slug, "name": p.name, "tagline": p.tagline, "price_ars": p.price_ars,
            "quota_gb": p.quota_gb, "masters_month": p.masters_month, "ai_covers_month": p.ai_covers_month,
            "ai_notes_day": p.ai_notes_day, "max_members": p.max_members, "highlight": p.highlight,
            "sort": p.sort, "active": p.active}
