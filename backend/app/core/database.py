from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

Base = declarative_base()

_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        db_url = settings.DATABASE_URL
        connect_args = {}
        if db_url.startswith("sqlite"):
            connect_args = {"check_same_thread": False}
        try:
            _engine = create_engine(
                db_url,
                connect_args=connect_args,
                pool_pre_ping=True,
            )
        except Exception:
            # Fallback to in-memory sqlite if driver is missing in local test environment
            _engine = create_engine(
                "sqlite:///:memory:",
                connect_args={"check_same_thread": False},
            )
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine()
        )
    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    """Dependency for obtaining database sessions."""
    session_factory = get_session_factory()
    db = session_factory()
    try:
        yield db
    finally:
        db.close()
