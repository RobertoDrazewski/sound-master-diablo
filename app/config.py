import os
import secrets
from pathlib import Path

DATA_DIR = Path(os.getenv("DATA_DIR", "./data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
(DATA_DIR / "tmp").mkdir(exist_ok=True)
(DATA_DIR / "cache").mkdir(exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'app.db'}")

# Clave de firma: variable de entorno o archivo generado una sola vez.
_key_file = DATA_DIR / "secret.key"
if os.getenv("SECRET_KEY"):
    SECRET_KEY = os.environ["SECRET_KEY"]
else:
    if not _key_file.exists():
        _key_file.write_text(secrets.token_urlsafe(48))
        _key_file.chmod(0o600)
    SECRET_KEY = _key_file.read_text().strip()

# Retencion del ensayo crudo completo (dias)
RAW_RETENTION_DAYS = int(os.getenv("RAW_RETENTION_DAYS", "30"))

# Tope de disco por banda (GB). Ajustar segun el espacio libre del VPS.
BAND_QUOTA_GB = float(os.getenv("BAND_QUOTA_GB", "15"))

# Tamano maximo por archivo subido (MB)
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "3000"))

# Duracion del fragmento de referencia que se guarda (segundos)
REFERENCE_SECONDS = int(os.getenv("REFERENCE_SECONDS", "90"))

# Vigencia de los links de reproduccion/descarga (segundos)
LINK_TTL = int(os.getenv("LINK_TTL", "21600"))  # 6 h: alcanza para escuchar un ensayo largo

JWT_TTL_DAYS = int(os.getenv("JWT_TTL_DAYS", "30"))
INVITE_TTL_DAYS = int(os.getenv("INVITE_TTL_DAYS", "7"))

# Super admin inicial (solo se crea si no hay usuarios)
SUPERADMIN_EMAIL = os.getenv("SUPERADMIN_EMAIL", "")
SUPERADMIN_PASSWORD = os.getenv("SUPERADMIN_PASSWORD", "")

# Origenes permitidos para el front (separados por coma)
CORS_ORIGINS = [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o]

# Los generos (con su volumen objetivo en LUFS y su receta de master) viven en app/genres.py.

# Direccion publica (ej. https://diablomastermix.com.ar); se usa para armar los links de invitacion.
PUBLIC_URL = os.getenv("PUBLIC_URL", "").rstrip("/")

# Asistente con IA (opcional, apagado si no hay clave). Solo se envian numeros del analisis, nunca audio.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
ASSISTANT_DAILY_LIMIT = int(os.getenv("ASSISTANT_DAILY_LIMIT", "20"))  # consultas por banda por dia

COVER_AI_MODEL = os.getenv("COVER_AI_MODEL", "gpt-image-2.5-sunburst")
COVER_AI_QUALITY = os.getenv("COVER_AI_QUALITY", "high")  # low | medium | high (cuesta mas cuanto mas alta; high ronda USD 0.05 por imagen)
COVER_AI_DAILY_LIMIT = int(os.getenv("COVER_AI_DAILY_LIMIT", "5"))  # imagenes con IA por banda por dia (tiene costo)


# ------------------------------------------------------------------ suscripciones (Mercado Pago)
MP_ACCESS_TOKEN = os.getenv("MP_ACCESS_TOKEN", "")           # credencial de produccion (APP_USR-...)
MP_WEBHOOK_SECRET = os.getenv("MP_WEBHOOK_SECRET", "")       # clave secreta de la notificacion (opcional, recomendada)
TRIAL_DAYS = int(os.getenv("TRIAL_DAYS", "14"))              # prueba gratis de las bandas nuevas que pagan
PAST_DUE_GRACE_DAYS = int(os.getenv("PAST_DUE_GRACE_DAYS", "3"))  # dias de gracia despues de un pago vencido
BILLING_CURRENCY = os.getenv("BILLING_CURRENCY", "ARS")

# ------------------------------------------------------------ contacto (mail + Cloudflare Turnstile)
TURNSTILE_SITE_KEY = os.getenv("TURNSTILE_SITE_KEY", "")
TURNSTILE_SECRET = os.getenv("TURNSTILE_SECRET", "")
CONTACT_TO = os.getenv("CONTACT_TO", "") or SUPERADMIN_EMAIL  # donde llegan los mensajes del formulario
MAIL_FROM = os.getenv("MAIL_FROM", "")                       # si no se define, se usa SMTP_USER
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")                       # la cuenta de Gmail que envía
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")               # "contrasena de aplicacion" de Google (16 letras)
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")             # alternativa a SMTP

# ------------------------------------------------------------------------------------- chatbot
CHAT_MODEL = os.getenv("CHAT_MODEL", "") or OPENAI_MODEL
CHAT_ENABLED = os.getenv("CHAT_ENABLED", "1") not in ("0", "false", "no")
CHAT_DAILY_LIMIT = int(os.getenv("CHAT_DAILY_LIMIT", "400"))      # mensajes por dia en total (tope de gasto)
CHAT_IP_HOURLY = int(os.getenv("CHAT_IP_HOURLY", "20"))           # mensajes por hora por visitante
