"""Formulario de contacto: Cloudflare Turnstile (anti-robots) + envio de mail (Resend o SMTP)."""
import smtplib
import ssl
from email.message import EmailMessage

from . import config
from .netutil import HTTPFail, http_json


def turnstile_enabled() -> bool:
    return bool(config.TURNSTILE_SITE_KEY and config.TURNSTILE_SECRET)


def verify_turnstile(token: str, ip: str = "") -> bool:
    if not turnstile_enabled():
        return True  # sin claves configuradas el control queda apagado (igual rigen honeypot y limite por IP)
    if not token:
        return False
    form = {"secret": config.TURNSTILE_SECRET, "response": token}
    if ip:
        form["remoteip"] = ip
    try:
        res = http_json("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", form=form, timeout=10)
    except HTTPFail:
        return False
    return bool(res.get("success"))


def mail_enabled() -> bool:
    return bool(config.RESEND_API_KEY or (config.SMTP_USER and config.SMTP_PASSWORD))


def send_mail(subject: str, body: str, reply_to: str = "") -> bool:
    """True si salio el mail. Nunca levanta: el mensaje igual queda guardado en el panel."""
    to = config.CONTACT_TO
    if not to or not mail_enabled():
        return False
    sender = config.MAIL_FROM or config.SMTP_USER or "onboarding@resend.dev"
    try:
        if config.RESEND_API_KEY:
            payload = {"from": f"Diablo Master Mix <{sender}>", "to": [to], "subject": subject, "text": body}
            if reply_to:
                payload["reply_to"] = reply_to
            http_json("POST", "https://api.resend.com/emails", body=payload,
                      headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"}, timeout=15)
            return True
        msg = EmailMessage()
        msg["Subject"], msg["From"], msg["To"] = subject, f"Diablo Master Mix <{sender}>", to
        if reply_to:
            msg["Reply-To"] = reply_to
        msg.set_content(body)
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as s:
            s.starttls(context=ssl.create_default_context())
            s.login(config.SMTP_USER, config.SMTP_PASSWORD)
            s.send_message(msg)
        return True
    except Exception:  # noqa: BLE001
        return False
