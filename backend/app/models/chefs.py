from datetime import date, datetime

from sqlalchemy import (Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, LargeBinary, Numeric,
                        SmallInteger, String, Text, text)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, SeedMixin, TimestampMixin
from app.models.identity import User

CHEF_STATUSES = ("draft", "submitted", "under_review", "approved", "rejected")


class Chef(IdMixin, TimestampMixin, SeedMixin, Base):
    __tablename__ = "chefs"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(16), server_default="draft", nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
    city: Mapped[str | None] = mapped_column(String(60))
    area: Mapped[str | None] = mapped_column(String(80))
    home_lat: Mapped[float | None] = mapped_column(Float)
    home_lng: Mapped[float | None] = mapped_column(Float)
    experience_years: Mapped[int] = mapped_column(SmallInteger, server_default="0", nullable=False)
    specialities: Mapped[str | None] = mapped_column(String(500))
    rating: Mapped[float] = mapped_column(Numeric(3, 2), server_default="0", nullable=False)
    rejection_reason: Mapped[str | None] = mapped_column(String(500))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    user: Mapped[User] = relationship(foreign_keys=[user_id])
    skills: Mapped[list["ChefSkill"]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    __table_args__ = (
        CheckConstraint(f"status in {CHEF_STATUSES}", name="status"),
        CheckConstraint("rating between 0 and 5", name="rating"),
        # B7: bounding-box prefilter for eligible chefs uses this composite index, never a full scan.
        Index("ix_chefs_eligible_geo", "home_lat", "home_lng", postgresql_where=text("status = 'approved' and active")),
    )


class ChefSkill(Base):
    __tablename__ = "chef_skills"
    chef_id: Mapped[int] = mapped_column(ForeignKey("chefs.id", ondelete="CASCADE"), primary_key=True)
    cuisine: Mapped[str] = mapped_column(String(40), primary_key=True)
    __table_args__ = (Index("ix_chef_skills_cuisine", "cuisine"),)


class ChefDocument(IdMixin, Base):
    __tablename__ = "chef_documents"
    chef_id: Mapped[int] = mapped_column(ForeignKey("chefs.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(24), nullable=False)
    value_enc: Mapped[bytes | None] = mapped_column(LargeBinary)  # ID / tax number, AES-GCM
    last4: Mapped[str | None] = mapped_column(String(4))
    storage_key: Mapped[str | None] = mapped_column(String(200))
    file_name: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(16), server_default="pending", nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    __table_args__ = (CheckConstraint("type in ('aadhaar','pan','police_verification','photo','food_safety')", name="type"),)


class ChefBankAccount(Base):
    __tablename__ = "chef_bank_accounts"
    chef_id: Mapped[int] = mapped_column(ForeignKey("chefs.id", ondelete="CASCADE"), primary_key=True)
    account_name: Mapped[str] = mapped_column(String(80), nullable=False)
    account_number_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    account_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    ifsc: Mapped[str] = mapped_column(String(11), nullable=False)
    upi_enc: Mapped[bytes | None] = mapped_column(LargeBinary)


class ChefOffDay(Base):
    __tablename__ = "chef_off_days"
    chef_id: Mapped[int] = mapped_column(ForeignKey("chefs.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
