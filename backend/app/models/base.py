from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

__all__ = ["Base", "IdMixin", "TimestampMixin", "SeedMixin"]


class IdMixin:
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SeedMixin:
    # Marks fixtures created by scripts/seed.py so they can be told apart from real records (and purged).
    is_seed: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
