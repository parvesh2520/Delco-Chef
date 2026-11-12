from collections.abc import Generator
from contextlib import contextmanager

import time

from sqlalchemy import MetaData, create_engine, event, exc, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


engine = create_engine(
    settings.sqlalchemy_url,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_recycle=300,  # Neon closes idle connections; recycle before that happens.
)

# Liveness check only for connections idle longer than this. A connection used moments ago is alive, and with a remote
# database every ping is a full network round-trip (pool_pre_ping would add one to every single request).
IDLE_PING_SECONDS = 20


def install_idle_ping(eng) -> None:
    """Ping a pooled connection on checkout only if it sat idle longer than IDLE_PING_SECONDS."""

    @event.listens_for(eng, "connect")
    def _fresh(dbapi_con, rec) -> None:
        rec.info["idle_since"] = time.monotonic()

    @event.listens_for(eng, "checkin")
    def _returned(dbapi_con, rec) -> None:
        if rec is not None:
            rec.info["idle_since"] = time.monotonic()

    @event.listens_for(eng, "checkout")
    def _ping_if_idle(dbapi_con, rec, proxy) -> None:
        if time.monotonic() - rec.info.get("idle_since", 0) < IDLE_PING_SECONDS:
            return
        cur = dbapi_con.cursor()
        try:
            cur.execute("select 1")
        except Exception as e:  # dropped by the server while idle: the pool discards it and connects afresh
            raise exc.DisconnectionError() from e
        finally:
            cur.close()


install_idle_ping(engine)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def prefer_ipv4(eng) -> None:
    """For networks where IPv6 to the database times out: connect to a fresh IPv4 address each time, while libpq keeps
    the hostname for TLS SNI / certificate checks (Neon routes by SNI)."""
    import socket
    from sqlalchemy import event

    host = eng.url.host

    @event.listens_for(eng, "do_connect")
    def _ipv4(dialect, conn_rec, cargs, cparams):
        try:
            cparams["hostaddr"] = socket.getaddrinfo(host, eng.url.port or 5432, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
        except OSError:
            pass  # fall back to normal resolution


if settings.DB_PREFER_IPV4:
    prefer_ipv4(engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """For background jobs: commit on success, roll back on error."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def check_database() -> tuple[bool, str | None]:
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
            rev = conn.execute(text("select version_num from alembic_version")).scalar()
        return True, rev
    except Exception:
        return False, None
