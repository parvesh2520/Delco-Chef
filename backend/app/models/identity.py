"""Users, auth, customers, addresses, consents."""
from datetime import date, datetime

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer,
                        LargeBinary, SmallInteger, String, Text, UniqueConstraint, text)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, SeedMixin, TimestampMixin

ROLES = ("customer", "chef", "ops_admin", "super_admin")


class User(IdMixin, TimestampMixin, SeedMixin, Base):
    __tablename__ = "users"
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    phone_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    phone_hmac: Mapped[str | None] = mapped_column(String(64))  # keyed hash → lookup without decrypting
    full_name: Mapped[str | None] = mapped_column(String(80))
    email: Mapped[str | None] = mapped_column(String(254))
    status: Mapped[str] = mapped_column(String(16), server_default="active", nullable=False)  # active|disabled|deleted
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    __table_args__ = (
        CheckConstraint(f"role in {ROLES}", name="role"),
        CheckConstraint("status in ('active','disabled','deleted')", name="status"),
        # A phone number holds one role only (A4); deleted users have phone wiped so the number can re-register.
        Index("uq_users_phone_hmac", "phone_hmac", unique=True, postgresql_where=text("phone_hmac is not null")),
    )


class OtpChallenge(IdMixin, TimestampMixin, Base):
    __tablename__ = "otp_challenges"
    phone_hmac: Mapped[str] = mapped_column(String(64), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    portal: Mapped[str] = mapped_column(String(16), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(SmallInteger, server_default="0", nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_otp_phone_created", "phone_hmac", "created_at"),)  # hourly rate-limit count


class RefreshToken(IdMixin, TimestampMixin, Base):
    __tablename__ = "refresh_tokens"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    session_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # rotation family
    device: Mapped[str | None] = mapped_column(String(120))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CustomerProfile(SeedMixin, Base):
    __tablename__ = "customer_profiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    preferred_language: Mapped[str] = mapped_column(String(16), server_default="en", nullable=False)
    diet: Mapped[str | None] = mapped_column(String(16))
    household_size: Mapped[int | None] = mapped_column(SmallInteger)
    cuisines: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}", nullable=False)
    allergies: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}", nullable=False)
    allergy_notes: Mapped[str | None] = mapped_column(String(500))
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user: Mapped[User] = relationship()
    __table_args__ = (CheckConstraint("household_size between 1 and 20", name="household"),)


class Address(IdMixin, TimestampMixin, SeedMixin, Base):
    __tablename__ = "addresses"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String(40), nullable=False)
    line1_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    line2_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    landmark_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    city: Mapped[str] = mapped_column(String(60), nullable=False)
    pincode: Mapped[str] = mapped_column(String(6), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("lat between 6.5 and 37.2 and lng between 68.0 and 97.5", name="in_india"),
        Index("ix_addresses_user", "user_id", postgresql_where=text("deleted_at is null")),
        Index("uq_addresses_one_default", "user_id", unique=True, postgresql_where=text("is_default and deleted_at is null")),
    )


class Consent(IdMixin, Base):
    __tablename__ = "consents"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # terms | location
    version: Mapped[str] = mapped_column(String(16), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    __table_args__ = (CheckConstraint("kind in ('terms','location')", name="kind"),)


class ServiceInterest(TimestampMixin, Base):
    __tablename__ = "service_interests"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    service: Mapped[str] = mapped_column(String(24), primary_key=True)


class DataExport(IdMixin, Base):
    __tablename__ = "data_exports"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), server_default="processing", nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(200))
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
