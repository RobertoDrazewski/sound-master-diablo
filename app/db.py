from datetime import datetime, timezone

from sqlalchemy import (Boolean, DateTime, Float, ForeignKey, Integer, String,
                        Text, UniqueConstraint, create_engine, event)
from sqlalchemy.orm import (DeclarativeBase, Mapped, mapped_column, relationship,
                            sessionmaker)

from .config import DATABASE_URL


def now() -> datetime:
    """UTC sin zona horaria (SQLite no guarda tzinfo)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _sqlite else {},
    pool_pre_ping=True,
)

if _sqlite:
    @event.listens_for(engine, "connect")
    def _pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    photo: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_super: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    # perfil de musico (banco de musicos): solo se muestra si available=True (opt-in)
    available: Mapped[bool] = mapped_column(Boolean, default=False)
    bio: Mapped[str] = mapped_column(Text, default="")
    styles: Mapped[str] = mapped_column(String(300), default="")        # separados por coma
    instruments: Mapped[str] = mapped_column(String(300), default="")   # separados por coma
    sings: Mapped[bool] = mapped_column(Boolean, default=False)
    equipment: Mapped[str] = mapped_column(Text, default="")
    has_transport: Mapped[bool] = mapped_column(Boolean, default=False)
    has_rehearsal_space: Mapped[bool] = mapped_column(Boolean, default=False)
    city: Mapped[str] = mapped_column(String(80), default="")
    country: Mapped[str] = mapped_column(String(60), default="")
    contact_kind: Mapped[str] = mapped_column(String(10), default="")   # whatsapp | email
    contact_value: Mapped[str] = mapped_column(String(160), default="")


class MusicianRequest(Base):
    """Aviso de una banda que busca musico. Lo ven los admins de otras bandas."""
    __tablename__ = "musician_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    band_id: Mapped[int] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    instrument: Mapped[str] = mapped_column(String(80), default="")
    styles: Mapped[str] = mapped_column(String(300), default="")
    city: Mapped[str] = mapped_column(String(80), default="")
    country: Mapped[str] = mapped_column(String(60), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    contact_kind: Mapped[str] = mapped_column(String(10), default="")
    contact_value: Mapped[str] = mapped_column(String(160), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Band(Base):
    __tablename__ = "bands"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    photo: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    # suscripcion: el estado se calcula (ver app/billing.py), aca solo van los datos
    exempt: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")        # no paga (la decide el super admin)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")       # corte manual
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id", ondelete="SET NULL"), nullable=True)
    pending_plan_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    mp_preapproval_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    mp_status: Mapped[str | None] = mapped_column(String(20), nullable=True)               # pending | authorized | paused | cancelled
    mp_payer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    purge_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)              # baja pedida: se borra todo en esta fecha


class Plan(Base):
    """Plan de suscripcion mensual (se cobra por banda, no por musico)."""
    __tablename__ = "plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    tagline: Mapped[str] = mapped_column(String(160), default="")
    price_ars: Mapped[int] = mapped_column(Integer)
    quota_gb: Mapped[float] = mapped_column(Float, default=5)
    masters_month: Mapped[int] = mapped_column(Integer, default=12)
    ai_covers_month: Mapped[int] = mapped_column(Integer, default=3)
    ai_notes_day: Mapped[int] = mapped_column(Integer, default=10)
    max_members: Mapped[int] = mapped_column(Integer, default=8)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    highlight: Mapped[bool] = mapped_column(Boolean, default=False)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    band_id: Mapped[int | None] = mapped_column(ForeignKey("bands.id", ondelete="SET NULL"), nullable=True, index=True)
    band_name: Mapped[str] = mapped_column(String(120), default="")
    mp_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    amount: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(5), default="ARS")
    status: Mapped[str] = mapped_column(String(20), default="approved")
    kind: Mapped[str] = mapped_column(String(12), default="mp")           # mp | manual
    paid_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Cancellation(Base):
    """Baja de una banda: motivos del cuestionario. No guarda datos de la banda (solo nombre, plan y fechas)."""
    __tablename__ = "cancellations"
    id: Mapped[int] = mapped_column(primary_key=True)
    band_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    band_name: Mapped[str] = mapped_column(String(120), default="")
    plan_name: Mapped[str] = mapped_column(String(60), default="")
    reasons: Mapped[str] = mapped_column(String(300), default="")      # claves separadas por coma
    comment: Mapped[str] = mapped_column(Text, default="")
    months: Mapped[int] = mapped_column(Integer, default=0)            # meses de antiguedad
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    purge_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    purged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    stopped: Mapped[bool] = mapped_column(Boolean, default=False)      # el super admin freno la baja


class Signup(Base):
    """Alta de una banda que compra sola desde la portada. La cuenta se crea recien cuando Mercado Pago autoriza el pago."""
    __tablename__ = "signups"
    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    band_name: Mapped[str] = mapped_column(String(120))
    admin_name: Mapped[str] = mapped_column(String(120), default="")
    email: Mapped[str] = mapped_column(String(255), index=True)
    payer_email: Mapped[str] = mapped_column(String(255), default="")
    plan_id: Mapped[int] = mapped_column(Integer)
    base_url: Mapped[str] = mapped_column(String(200), default="")
    mp_preapproval_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)   # pending | done | expired
    band_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class UsageEvent(Base):
    """Consumos con costo (tapas con IA, notas del asistente) para aplicar los limites del plan."""
    __tablename__ = "usage_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    band_id: Mapped[int] = mapped_column(Integer, index=True)
    kind: Mapped[str] = mapped_column(String(12), index=True)             # cover | note
    at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class ContactMessage(Base):
    __tablename__ = "contact_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255))
    band: Mapped[str] = mapped_column(String(120), default="")
    message: Mapped[str] = mapped_column(Text)
    emailed: Mapped[bool] = mapped_column(Boolean, default=False)
    handled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Album(Base):
    __tablename__ = "albums"
    id: Mapped[int] = mapped_column(primary_key=True)
    band_id: Mapped[int] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    photo: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "band_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    band_id: Mapped[int] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="member")  # admin | member
    kind: Mapped[str] = mapped_column(String(10), default="musico")  # manager | musico
    instrument: Mapped[str] = mapped_column(String(120), default="")
    sings: Mapped[bool] = mapped_column(Boolean, default=False)


class Invite(Base):
    __tablename__ = "invites"
    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255))
    band_id: Mapped[int] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20), default="member")
    kind: Mapped[str] = mapped_column(String(10), default="musico")
    instrument: Mapped[str] = mapped_column(String(120), default="")
    sings: Mapped[bool] = mapped_column(Boolean, default=False)
    invited_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ApiToken(Base):
    """Token personal para el script de Reaper."""
    __tablename__ = "api_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(80), default="reaper")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Genre(Base):
    __tablename__ = "genres"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    target_lufs: Mapped[float] = mapped_column(Float, default=-14.0)
    family: Mapped[str] = mapped_column(String(40), default="", server_default="")


class Reference(Base):
    """Fragmento de referencia. Solo se usa para procesar; nunca se sirve."""
    __tablename__ = "references"
    id: Mapped[int] = mapped_column(primary_key=True)
    genre_id: Mapped[int] = mapped_column(ForeignKey("genres.id"), index=True)
    band_id: Mapped[int | None] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    path: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    lufs: Mapped[float | None] = mapped_column(Float, nullable=True)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    genre: Mapped[Genre] = relationship()


class Track(Base):
    __tablename__ = "tracks"
    id: Mapped[int] = mapped_column(primary_key=True)
    band_id: Mapped[int] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    section: Mapped[str] = mapped_column(String(10), default="master", server_default="master")  # master | ensayo
    album_id: Mapped[int | None] = mapped_column(ForeignKey("albums.id", ondelete="SET NULL"), nullable=True, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    session: Mapped[str] = mapped_column(String(120), default="", server_default="")  # "ensayo del 12/10": agrupa temas
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    versions: Mapped[list["Version"]] = relationship(
        back_populates="track", cascade="all, delete-orphan", order_by="Version.id")
    uploader: Mapped[User] = relationship()


class Version(Base):
    __tablename__ = "versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # raw | mix | stem | master
    label: Mapped[str] = mapped_column(String(160), default="")
    status: Mapped[str] = mapped_column(String(12), default="processing")  # processing | ready | error
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    flac_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    duration: Mapped[float] = mapped_column(Float, default=0.0)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    track: Mapped[Track] = relationship(back_populates="versions")


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))  # ingest | master
    status: Mapped[str] = mapped_column(String(10), default="queued", index=True)
    payload: Mapped[str] = mapped_column(Text, default="{}")
    version_id: Mapped[int | None] = mapped_column(ForeignKey("versions.id", ondelete="CASCADE"), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Event(Base):
    """Evento del calendario de una banda (ensayo, show, grabacion...)."""
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    band_id: Mapped[int] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True)  # UTC sin zona
    place: Mapped[str] = mapped_column(String(200), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    band_id: Mapped[int | None] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), default="info")
    text: Mapped[str] = mapped_column(String(300))
    link: Mapped[str] = mapped_column(String(200), default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


def init_db():
    Base.metadata.create_all(engine)
    if _sqlite:
        _migrate_sqlite()


def _migrate_sqlite():
    """Agrega columnas nuevas a bases creadas con versiones anteriores."""
    from sqlalchemy import text

    def add(conn, table, col, ddl):
        cols = {r[1] for r in conn.execute(text(f"PRAGMA table_info(\"{table}\")"))}
        if col not in cols:
            conn.execute(text(f"ALTER TABLE \"{table}\" ADD COLUMN {col} {ddl}"))
            return True
        return False

    with engine.begin() as conn:
        for col, ddl in (("available", "BOOLEAN NOT NULL DEFAULT 0"), ("bio", "TEXT NOT NULL DEFAULT ''"),
                         ("styles", "VARCHAR(300) NOT NULL DEFAULT ''"), ("instruments", "VARCHAR(300) NOT NULL DEFAULT ''"),
                         ("sings", "BOOLEAN NOT NULL DEFAULT 0"), ("equipment", "TEXT NOT NULL DEFAULT ''"),
                         ("has_transport", "BOOLEAN NOT NULL DEFAULT 0"), ("has_rehearsal_space", "BOOLEAN NOT NULL DEFAULT 0"),
                         ("city", "VARCHAR(80) NOT NULL DEFAULT ''"), ("country", "VARCHAR(60) NOT NULL DEFAULT ''"),
                         ("contact_kind", "VARCHAR(10) NOT NULL DEFAULT ''"), ("contact_value", "VARCHAR(160) NOT NULL DEFAULT ''")):
            add(conn, "users", col, ddl)
        if add(conn, "tracks", "section", "VARCHAR(10) NOT NULL DEFAULT 'master'"):
            conn.execute(text("UPDATE tracks SET section='ensayo' WHERE id IN "
                              "(SELECT track_id FROM versions WHERE kind='raw')"))
        add(conn, "tracks", "album_id", "INTEGER REFERENCES albums(id) ON DELETE SET NULL")
        add(conn, "tracks", "position", "INTEGER NOT NULL DEFAULT 0")
        add(conn, "tracks", "session", "VARCHAR(120) NOT NULL DEFAULT ''")
        for t in ("memberships", "invites"):
            add(conn, t, "kind", "VARCHAR(10) NOT NULL DEFAULT 'musico'")
            add(conn, t, "instrument", "VARCHAR(120) NOT NULL DEFAULT ''")
            add(conn, t, "sings", "BOOLEAN NOT NULL DEFAULT 0")
        add(conn, "invites", "invited_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL")
        add(conn, "users", "photo", "VARCHAR(20)")
        add(conn, "bands", "photo", "VARCHAR(20)")
        add(conn, "genres", "family", "VARCHAR(40) NOT NULL DEFAULT ''")
        add(conn, "references", "lufs", "FLOAT")
        # suscripciones: las bandas que ya existian (las de prueba) quedan exentas de pago
        if add(conn, "bands", "exempt", "BOOLEAN NOT NULL DEFAULT 0"):
            conn.execute(text("UPDATE bands SET exempt=1"))
        add(conn, "bands", "blocked", "BOOLEAN NOT NULL DEFAULT 0")
        add(conn, "bands", "plan_id", "INTEGER REFERENCES plans(id) ON DELETE SET NULL")
        add(conn, "bands", "pending_plan_id", "INTEGER")
        add(conn, "bands", "trial_ends_at", "DATETIME")
        add(conn, "bands", "paid_until", "DATETIME")
        add(conn, "bands", "mp_preapproval_id", "VARCHAR(80)")
        add(conn, "bands", "mp_status", "VARCHAR(20)")
        add(conn, "bands", "mp_payer_email", "VARCHAR(255)")
        add(conn, "bands", "purge_at", "DATETIME")
