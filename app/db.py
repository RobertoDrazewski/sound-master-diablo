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


class Band(Base):
    __tablename__ = "bands"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    photo: Mapped[str | None] = mapped_column(String(20), nullable=True)
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


class Reference(Base):
    """Fragmento de referencia. Solo se usa para procesar; nunca se sirve."""
    __tablename__ = "references"
    id: Mapped[int] = mapped_column(primary_key=True)
    genre_id: Mapped[int] = mapped_column(ForeignKey("genres.id"), index=True)
    band_id: Mapped[int | None] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    path: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
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
        cols = {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))}
        if col not in cols:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
            return True
        return False

    with engine.begin() as conn:
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
