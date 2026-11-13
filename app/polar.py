"""Cobro de suscripciones fuera de Argentina con Polar (merchant of record, precios en USD).

Mercado Pago sigue cobrando en pesos a Argentina (ver billing.py). Aca van el checkout, el webhook y la
sincronizacion de Polar. El estado de la banda sigue siendo el de siempre (fechas en `status()`):
Polar solo actualiza `paid_until`, `plan_id`, `mp_status` (pending | authorized | paused | cancelled) y los pagos.
"""
import base64
import hashlib
import hmac
import logging
import threading
import time
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from . import billing, config
from .db import Band, Payment, Plan, Signup, now
from .netutil import HTTPFail, http_json

log = logging.getLogger("uvicorn.error")
_lock = threading.Lock()          # los avisos de un mismo alta llegan casi juntos: se procesan de a uno


class PolarError(Exception):
    def __init__(self, msg: str = "", status: int | None = None):
        super().__init__(msg)
        self.status = status


def enabled() -> bool:
    return bool(config.POLAR_ACCESS_TOKEN)


def product_id(plan: Plan) -> str | None:
    return config.POLAR_PRODUCTS.get(plan.slug)


def plan_of_product(db: Session, pid: str | None) -> Plan | None:
    for slug, p in config.POLAR_PRODUCTS.items():
        if p == pid:
            return db.query(Plan).filter_by(slug=slug).first()
    return None


def _call(method: str, path: str, body: dict | None = None) -> dict:
    if not enabled():
        raise PolarError("El cobro internacional todavía no está configurado (falta POLAR_ACCESS_TOKEN).")
    try:
        return http_json(method, config.POLAR_API + path, body=body,
                         headers={"Authorization": f"Bearer {config.POLAR_ACCESS_TOKEN}", "Accept": "application/json",
                                  "User-Agent": "DiabloMasterMix/1.0 (+https://diablomastermix.com.ar)"})
    except HTTPFail as e:
        log.warning("Polar %s %s -> %s %s (servidor %s)", method, path, e.status, e.message, config.POLAR_SERVER)
        raise PolarError(f"Polar respondió {e.status}: {e.message}", e.status) from e


def create_checkout(plan: Plan, email: str, ref: str, customer_ref: str, success_url: str, return_url: str,
                    name: str = "", trial_days: int = 0) -> dict:
    """Crea el checkout y devuelve {id, url}. `ref` (signup:ID | band:ID) vuelve en los avisos."""
    pid = product_id(plan)
    if not pid:
        raise PolarError("Este plan todavía no está disponible para pagar en dólares.")
    body = {"products": [pid], "customer_email": email, "external_customer_id": customer_ref,
            "metadata": {"ref": ref}, "success_url": success_url, "return_url": return_url,
            "allow_discount_codes": False}
    if name:
        body["customer_name"] = name
    if trial_days > 0:  # prueba gratis: la tarjeta se registra pero el primer cobro es al terminar
        body["trial_interval"], body["trial_interval_count"] = "day", int(trial_days)
    data = _call("POST", "/v1/checkouts/", body)
    return {"id": data["id"], "url": data["url"]}


def get_subscription(sid: str) -> dict:
    return _call("GET", f"/v1/subscriptions/{sid}")


def get_checkout(cid: str) -> dict:
    return _call("GET", f"/v1/checkouts/{cid}")


def change_plan(sid: str, plan: Plan):
    pid = product_id(plan)
    if not pid:
        raise PolarError("Este plan todavía no está disponible para pagar en dólares.")
    _call("PATCH", f"/v1/subscriptions/{sid}", {"product_id": pid})


def revoke(sid: str):
    """Baja inmediata: no se vuelve a cobrar."""
    _call("DELETE", f"/v1/subscriptions/{sid}")


# ------------------------------------------------------------------------------ webhook

def verify_webhook(headers, raw: bytes) -> bool:
    """Standard Webhooks (webhook-id, webhook-timestamp, webhook-signature). Sin secreto configurado no se acepta nada."""
    secret = config.POLAR_WEBHOOK_SECRET
    if not secret:
        log.warning("webhook Polar rechazado: falta POLAR_WEBHOOK_SECRET")
        return False
    wid, ts, sig = headers.get("webhook-id", ""), headers.get("webhook-timestamp", ""), headers.get("webhook-signature", "")
    try:
        if abs(time.time() - int(ts)) > 600:
            log.warning("webhook Polar rechazado: timestamp fuera de rango")
            return False
    except ValueError:
        return False
    signed = f"{wid}.{ts}.".encode() + raw
    keys = [secret.encode()]
    try:
        keys.append(base64.b64decode(secret.removeprefix("whsec_"), validate=True))
    except Exception:  # noqa: BLE001
        pass
    got = [s.split(",", 1)[1] for s in sig.split() if "," in s]
    for k in keys:
        mine = base64.b64encode(hmac.new(k, signed, hashlib.sha256).digest()).decode()
        if any(hmac.compare_digest(mine, g) for g in got):
            return True
    log.warning("webhook Polar rechazado: la firma no coincide")
    return False


def _dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _ref(obj: dict) -> str:
    return str((obj.get("metadata") or {}).get("ref") or "")


def _band_of(db: Session, ref: str, sid: str | None) -> Band | None:
    if ref.startswith("band:"):
        try:
            b = db.get(Band, int(ref.split(":", 1)[1]))
            if b:
                return b
        except ValueError:
            pass
    if sid:
        return db.query(Band).filter_by(polar_subscription_id=sid).first()
    return None


def _signup_of(db: Session, ref: str) -> Signup | None:
    if ref.startswith("signup:"):
        try:
            return db.get(Signup, int(ref.split(":", 1)[1]))
        except ValueError:
            return None
    return None


def _state(st: str | None) -> str:
    if st in ("active", "trialing"):
        return "authorized"
    if st in ("past_due", "unpaid"):
        return "paused"
    if st in ("canceled", "incomplete_expired"):
        return "cancelled"
    return "pending"


def apply_subscription(db: Session, sub: dict) -> Band | None:
    """Sincroniza la banda con lo que dice Polar (fuente de verdad)."""
    sid, ref = sub.get("id"), _ref(sub)
    band = _band_of(db, ref, sid)
    st = _state(sub.get("status"))
    if not band:
        su = _signup_of(db, ref)
        if su and su.status == "pending" and st == "authorized":
            return billing.complete_signup_polar(db, su, sub)
        return None
    if band.polar_subscription_id and band.polar_subscription_id != sid and band.mp_status == "authorized":
        return band                      # una suscripcion vieja o repetida: manda la que la banda ya tiene
    prev = band.mp_status
    band.pay_provider, band.polar_subscription_id, band.mp_status = "polar", sid, st
    cust = sub.get("customer") or {}
    if cust.get("email"):
        band.mp_payer_email = cust["email"]
    plan = plan_of_product(db, sub.get("product_id"))
    if plan:
        band.plan_id, band.pending_plan_id = plan.id, None
    if st == "authorized":
        if sub.get("status") == "trialing":
            te = _dt(sub.get("trial_end"))
            if te and te > now():
                band.trial_ends_at = te
        else:
            pe = _dt(sub.get("current_period_end"))
            if pe and pe > now():
                band.paid_until = pe
                band.trial_ends_at = None
    db.commit()
    if st in ("cancelled", "paused") and prev != st and not band.purge_at:
        billing._tell_owner(db, f"Suscripción {'cancelada' if st == 'cancelled' else 'con pago pendiente'}: {band.name}",
                            f"La banda \"{band.name}\" {'canceló' if st == 'cancelled' else 'tiene un pago pendiente'} "
                            f"su suscripción internacional (Polar).\nMantiene el servicio hasta el fin del período ya pagado.",
                            "#/admin/cobros")
    return band


def apply_order(db: Session, order: dict) -> Band | None:
    """Un cobro: queda registrado una sola vez y se avisa."""
    sid, ref = order.get("subscription_id"), _ref(order)
    band = _band_of(db, ref, sid)
    if not band:
        su = _signup_of(db, ref)
        if su and sid:
            band = apply_subscription(db, {**get_subscription(sid), "metadata": {"ref": ref}})
    if not band:
        return None
    oid = f"polar:{order.get('id')}"
    if db.query(Payment).filter_by(mp_id=oid).first():
        return band
    cents = order.get("net_amount")
    if cents is None:
        cents = order.get("total_amount") or order.get("amount") or 0
    amount = float(cents) / 100
    db.add(Payment(band_id=band.id, band_name=band.name, mp_id=oid, amount=amount,
                   currency=str(order.get("currency") or "usd").upper(), status="approved", kind="polar"))
    db.commit()
    if sid:                                # el vencimiento sale del periodo que informa Polar
        try:
            apply_subscription(db, {**get_subscription(sid), "metadata": {"ref": ref or f"band:{band.id}"}})
        except PolarError:
            pass
    billing._after_payment(db, band, amount, approved=True)
    return band


def handle_event(db: Session, event: dict):
    typ, data = str(event.get("type") or ""), event.get("data") or {}
    with _lock:
        if typ.startswith("subscription."):
            apply_subscription(db, data)
        elif typ == "order.paid":
            apply_order(db, data)
        elif typ == "order.refunded":
            billing._tell_owner(db, "Reembolso en Polar", f"Se reembolsó un pago (orden {data.get('id')}). Revisalo en Polar.")


def sync_band(db: Session, band: Band):
    if band.polar_subscription_id and enabled():
        sub = get_subscription(band.polar_subscription_id)
        apply_subscription(db, {**sub, "metadata": {"ref": f"band:{band.id}"}})


def sync_signup(db: Session, su: Signup) -> str:
    """Por si el aviso se demora: busca la suscripcion de esta alta en Polar."""
    if su.status != "pending" or not enabled():
        return su.status
    try:
        res = _call("GET", f"/v1/subscriptions/?external_customer_id=signup-{su.id}&limit=5")
    except PolarError:
        return su.status
    for sub in res.get("items") or []:
        with _lock:
            apply_subscription(db, {**sub, "metadata": {"ref": f"signup:{su.id}"}})
        db.refresh(su)
    return su.status


def start_signup(db: Session, plan: Plan, band_name: str, admin_name: str, email: str, base: str) -> str:
    """Alta nueva de una banda fuera de Argentina: devuelve el link de pago de Polar."""
    import secrets
    from sqlalchemy import func
    for old in db.query(Signup).filter(Signup.status == "pending", func.lower(Signup.email) == email.lower()).all():
        old.status = "expired"
    su = Signup(token=secrets.token_urlsafe(24), band_name=band_name, admin_name=admin_name, email=email,
                payer_email=email, plan_id=plan.id, base_url=base, provider="polar")
    db.add(su)
    db.commit()
    try:
        co = create_checkout(plan, email, f"signup:{su.id}", f"signup-{su.id}", f"{base}/#/gracias/{su.token}", f"{base}/",
                             name=admin_name, trial_days=config.TRIAL_DAYS)
    except PolarError:
        db.delete(su)
        db.commit()
        raise
    su.polar_checkout_id = co["id"]
    db.commit()
    return co["url"]
