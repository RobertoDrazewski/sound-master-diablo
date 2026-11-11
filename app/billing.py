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
import logging
import json
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import config, mail
from .notify import notify_supers
from .security import gen_password, hash_password
from .netutil import HTTPFail, http_json
from .db import Band, Membership, Payment, Plan, Signup, Track, UsageEvent, User, Version, now

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

log = logging.getLogger("uvicorn.error")


class MPError(Exception):
    def __init__(self, msg: str = "", status: int | None = None):
        super().__init__(msg)
        self.status = status


def mp_enabled() -> bool:
    return bool(config.MP_ACCESS_TOKEN)


def _mp(method: str, path: str, body: dict | None = None) -> dict:
    if not mp_enabled():
        raise MPError("Mercado Pago no está configurado todavía (falta MP_ACCESS_TOKEN).")
    try:
        return http_json(method, MP_API + path, body=body,
                         headers={"Authorization": f"Bearer {config.MP_ACCESS_TOKEN}"})
    except HTTPFail as e:
        raise MPError(f"Mercado Pago respondió {e.status}: {e.message}", e.status) from e


def create_preapproval(target, plan: Plan, payer_email: str, back_url: str, start_in_days: int = 0) -> dict:
    """Crea la suscripcion y devuelve {id, init_point}. El pago real lo autoriza el cliente en Mercado Pago.
    target: una Band o la referencia ("signup:ID") de un alta nueva."""
    ref = target if isinstance(target, str) else f"band:{target.id}"
    auto = {"frequency": 1, "frequency_type": "months", "transaction_amount": plan.price_ars,
            "currency_id": config.BILLING_CURRENCY}
    if start_in_days > 0:  # prueba gratis: el primer cobro es al terminar el trial
        auto["start_date"] = (datetime.utcnow() + timedelta(days=start_in_days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    data = _mp("POST", "/preapproval", {
        "reason": f"Diablo Master Mix · Plan {plan.name}",
        "external_reference": ref,
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


def verify_signature(headers, data_ids=("",)) -> bool:
    """Valida el x-signature de las notificaciones. Si no hay secreto configurado, se confia en el re-fetch a la API.
    El manifiesto usa el data.id de la URL y omite lo que no llega; como la simulacion del panel y los avisos reales
    pueden diferir, se prueban las variantes (id de la URL, id del cuerpo, sin id). Todas pasan por el HMAC."""
    # puede haber mas de una clave separada por comas (produccion y prueba): cada pestaña del panel de MP tiene la suya
    secrets = [s.strip() for s in (config.MP_WEBHOOK_SECRET or "").split(",") if s.strip()]
    if not secrets:
        return True
    sig = headers.get("x-signature", "")
    req_id = headers.get("x-request-id", "")
    parts = dict(p.strip().split("=", 1) for p in sig.split(",") if "=" in p)
    ts, v1 = parts.get("ts"), parts.get("v1")
    if not ts or not v1:
        log.warning("webhook MP rechazado: falta ts/v1 en x-signature (header presente: %s)", bool(sig))
        return False
    tried = []
    for did in dict.fromkeys([*(str(i) for i in data_ids if i), ""]):
        manifest = (f"id:{did.lower()};" if did else "") + (f"request-id:{req_id};" if req_id else "") + f"ts:{ts};"
        for secret in secrets:
            mine = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
            if hmac.compare_digest(mine, v1):
                return True
        tried.append(manifest)
    log.warning("webhook MP rechazado: firma no coincide. claves=%s v1_len=%d got4=%s manifiestos=%s",
                [(len(s), hashlib.sha256(s.encode()).hexdigest()[:4]) for s in secrets], len(v1), v1[:4], tried)
    return False


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
    prev = band.mp_status
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
    if st in ("cancelled", "paused") and prev != st:
        _tell_owner(db, f"Suscripción {'cancelada' if st == 'cancelled' else 'pausada'}: {band.name}",
                    f"La banda \"{band.name}\" {'canceló' if st == 'cancelled' else 'pausó'} su suscripción en Mercado Pago.\n"
                    f"Mantiene el servicio hasta el fin del período ya pagado.", "#/admin/cobros")
    return band


def apply_payment(db: Session, data: dict) -> Band | None:
    """Un cobro mensual (authorized_payment)."""
    pid = data.get("preapproval_id")
    band = _band_from_ref(db, data.get("external_reference"), pid)
    if not band:
        band = _signup_band_for_payment(db, data, pid)
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
            db.commit()
            _after_payment(db, band, float(amount), approved=True)
            return band
    elif st in ("rejected", "cancelled") and not pay:
        db.add(Payment(band_id=band.id, band_name=band.name, mp_id=mp_id, amount=float(amount),
                       currency=data.get("currency_id", "ARS"), status="rejected"))
        db.commit()
        _after_payment(db, band, float(amount), approved=False)
        return band
    db.commit()
    return band


def handle_notification(db: Session, topic: str, rid: str):
    """Re-consulta el recurso a la API (nunca confiamos en el cuerpo del webhook)."""
    if topic in ("subscription_preapproval", "preapproval"):
        data = get_preapproval(rid)
        if str(data.get("external_reference") or "").startswith("signup:"):
            handle_signup_preapproval(db, data)
        else:
            apply_preapproval(db, data)
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
    """Corre cada hora: sincroniza las bandas con suscripcion por vencer y cierra las altas que quedaron a medias."""
    t = now()
    for su in db.query(Signup).filter_by(status="pending").all():
        if su.created_at < t - timedelta(days=3):
            su.status = "expired"
            db.commit()
        elif su.mp_preapproval_id and mp_enabled():
            try:
                sync_signup(db, su)
            except MPError:
                continue
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


# ------------------------------------------------------------------ alta automatica (compra desde la portada)

def _ars(n) -> str:
    return "$" + f"{float(n):,.0f}".replace(",", ".")


def _fecha(d: datetime | None) -> str:
    return d.strftime("%d/%m/%Y") if d else ""


def _site(base: str = "") -> str:
    return (base or config.PUBLIC_URL or "").rstrip("/")


def _tell_owner(db: Session, subject: str, body: str, link: str = "#/admin/cobros"):
    """Aviso al super admin: dentro de la plataforma y por mail (al correo privado de CONTACT_TO)."""
    try:
        notify_supers(db, subject, link)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
    mail.send_mail(f"[Diablo Master Mix] {subject}", body)


def _admin_emails(db: Session, band_id: int) -> list[str]:
    rows = (db.query(User.email).join(Membership, Membership.user_id == User.id)
            .filter(Membership.band_id == band_id, Membership.role == "admin", User.is_super.is_(False)).all())
    return [r[0] for r in rows]


def _after_payment(db: Session, band: Band, amount: float, approved: bool):
    """Cada cobro mensual: aviso al super admin y recibo (o aviso de falla) al admin de la banda."""
    plan = band_plan(db, band)
    pname = plan.name if plan else "-"
    if approved:
        _tell_owner(db, f"Pago recibido: {band.name} ({_ars(amount)})",
                    f"Banda: {band.name}\nPlan: {pname}\nMonto: {_ars(amount)}\nServicio activo hasta: {_fecha(band.paid_until)}")
        for em in _admin_emails(db, band.id):
            mail.send_customer(em, "Diablo Master Mix: recibimos tu pago",
                               f"Recibimos el pago de la suscripción del plan {pname} de la banda \"{band.name}\".\n\n"
                               f"Monto: {_ars(amount)}\nServicio activo hasta: {_fecha(band.paid_until)}\n\n"
                               "El cobro se repite todos los meses de forma automática con Mercado Pago. "
                               "Podés cancelar cuando quieras desde la sección Plan de tu banda.\n\nDiablo Master Mix")
    else:
        _tell_owner(db, f"Pago rechazado: {band.name}",
                    f"Mercado Pago no pudo cobrar a la banda \"{band.name}\" (plan {pname}, {_ars(amount)}).\n"
                    f"Mercado Pago reintenta solo. Si no se regulariza, el servicio queda en solo lectura.")
        for em in _admin_emails(db, band.id):
            mail.send_customer(em, "Diablo Master Mix: no pudimos cobrar tu suscripción",
                               f"No pudimos cobrar la suscripción del plan {pname} de la banda \"{band.name}\".\n\n"
                               "Mercado Pago va a reintentar automáticamente. Revisá que el medio de pago de tu cuenta de "
                               "Mercado Pago tenga fondos o esté vigente. Mientras tanto la banda puede seguir usando la plataforma unos días; "
                               "si no se regulariza, queda en modo solo lectura (tu material no se borra).\n\nDiablo Master Mix")


def start_signup(db: Session, plan: Plan, band_name: str, admin_name: str, email: str, payer_email: str, base: str) -> str:
    """Registra el alta y crea la suscripcion en Mercado Pago. Devuelve el link de pago."""
    import secrets
    for old in db.query(Signup).filter(Signup.status == "pending", func.lower(Signup.email) == email.lower()).all():
        old.status = "expired"
    su = Signup(token=secrets.token_urlsafe(24), band_name=band_name, admin_name=admin_name, email=email,
                payer_email=payer_email, plan_id=plan.id, base_url=base)
    db.add(su)
    db.commit()
    try:
        res = create_preapproval(f"signup:{su.id}", plan, payer_email or email, f"{base}/#/gracias/{su.token}",
                                 start_in_days=config.TRIAL_DAYS)
    except MPError:
        db.delete(su)
        db.commit()
        raise
    su.mp_preapproval_id = res["id"]
    db.commit()
    return res["init_point"]


def _signup_of(db: Session, ref: str | None, pid: str | None) -> Signup | None:
    if ref and ref.startswith("signup:"):
        try:
            su = db.get(Signup, int(ref.split(":", 1)[1]))
            if su:
                return su
        except ValueError:
            pass
    if pid:
        return db.query(Signup).filter_by(mp_preapproval_id=pid).first()
    return None


def handle_signup_preapproval(db: Session, data: dict) -> Band | None:
    su = _signup_of(db, data.get("external_reference"), data.get("id"))
    if not su:
        return None
    if su.status == "done":
        return apply_preapproval(db, data)   # alta ya completada: cambios de estado (cancelacion, pausa, etc.)
    if data.get("status") == "authorized":
        return complete_signup(db, su, data)
    return None  # todavia pendiente (o la persona abandono el pago): no se crea nada


def sync_signup(db: Session, su: Signup) -> str:
    """Pregunta a Mercado Pago por un alta pendiente (por si el aviso se demora o se perdio)."""
    if su.status == "done" or not su.mp_preapproval_id or not mp_enabled():
        return su.status
    data = get_preapproval(su.mp_preapproval_id)
    if data.get("status") == "authorized":
        complete_signup(db, su, data)
    return su.status


def _signup_band_for_payment(db: Session, data: dict, pid: str | None) -> Band | None:
    """Llego un cobro de una suscripcion nueva antes que su aviso de alta: se completa el alta primero."""
    su = _signup_of(db, data.get("external_reference"), pid)
    if not su:
        return None
    if su.status == "done" and su.band_id:
        return db.get(Band, su.band_id)
    if su.mp_preapproval_id or pid:
        pre = get_preapproval(su.mp_preapproval_id or pid)
        if pre.get("status") == "authorized":
            return complete_signup(db, su, pre)
    return None


def complete_signup(db: Session, su: Signup, data: dict) -> Band | None:
    """Mercado Pago autorizo el pago: se crea la cuenta y la banda, y se manda el mail con el acceso."""
    if su.status == "done":
        return db.get(Band, su.band_id) if su.band_id else None
    plan = db.get(Plan, su.plan_id)
    if not plan:
        return None
    name = su.band_name.strip()
    n = 2
    while db.query(Band).filter(func.lower(Band.name) == name.lower()).first():
        name, n = f"{su.band_name.strip()} ({n})", n + 1
    email = su.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    password = None
    if not user:
        password = gen_password()
        user = User(email=email, name=su.admin_name.strip(), password_hash=hash_password(password))
        db.add(user)
        db.flush()
    band = Band(name=name, plan_id=plan.id, mp_preapproval_id=data.get("id"), mp_status=data.get("status"),
                mp_payer_email=data.get("payer_email") or su.payer_email or email)
    db.add(band)
    db.flush()
    db.add(Membership(user_id=user.id, band_id=band.id, role="admin", kind="musico"))
    su.status, su.band_id, su.completed_at = "done", band.id, now()
    su.mp_preapproval_id = data.get("id") or su.mp_preapproval_id
    db.commit()
    apply_preapproval(db, data)          # fechas de prueba / proximo cobro
    if not band.trial_ends_at and not band.paid_until:
        band.trial_ends_at = now() + timedelta(days=1)   # cobro inmediato: margen hasta que llegue el aviso del pago
        db.commit()

    site = _site(su.base_url)
    trial = band.trial_ends_at if band.trial_ends_at and band.trial_ends_at > now() + timedelta(days=2) else None
    cobro = (f"Los primeros {config.TRIAL_DAYS} días son gratis: el primer cobro de {_ars(plan.price_ars)} es el {_fecha(trial)}."
             if trial else f"Mercado Pago cobra {_ars(plan.price_ars)} por mes.")
    acceso = (f"Tus datos de acceso\n  Sitio:    {site}\n  Usuario:  {email}\n  Clave:    {password}\n\n"
              "Entrá y cambiá la clave cuando quieras desde tu perfil (Cambiar contraseña)."
              if password else
              f"Ya tenías una cuenta con este email: la banda quedó agregada a ella. Entrá con tu clave de siempre en {site}.")
    mail.send_customer(email, "Diablo Master Mix: suscripción confirmada y acceso a tu cuenta",
                       f"Hola {su.admin_name.strip() or ''},\n\n"
                       f"Tu suscripción del plan {plan.name} para la banda \"{name}\" quedó confirmada. {cobro}\n"
                       "Se cobra todos los meses de forma automática y podés cancelar cuando quieras desde la sección Plan de tu banda.\n\n"
                       f"{acceso}\n\n"
                       "Desde ahí podés invitar a tu banda, subir ensayos y masterizar.\n\nDiablo Master Mix")
    _tell_owner(db, f"Nueva banda suscripta: {name} (plan {plan.name})",
                f"Banda: {name}\nPlan: {plan.name} ({_ars(plan.price_ars)}/mes)\nAdmin: {su.admin_name} <{email}>\n"
                f"Email de Mercado Pago: {band.mp_payer_email}\n{cobro}")
    return band
