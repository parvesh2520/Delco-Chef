"""Attendance, photos, tracking, payments, notifications, audit, settings, payouts."""
from datetime import date, datetime

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer,
                        SmallInteger, String, Text, text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, SeedMixin, TimestampMixin


# ---------------- Attendance & photos ----------------
class Photo(IdMixin, TimestampMixin, Base):
    __tablename__ = "photos"
    visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id", ondelete="CASCADE"), index=True)
    chef_id: Mapped[int | None] = mapped_column(ForeignKey("chefs.id"))
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(200), nullable=False)  # bytes live in object storage, never here
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # spot selfie reuse
    __table_args__ = (CheckConstraint("kind in ('check_in_selfie','check_out_selfie','food','document')", name="kind"),)


class AttendanceRecord(IdMixin, TimestampMixin, SeedMixin, Base):
    __tablename__ = "attendance_records"
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id", ondelete="CASCADE"), nullable=False, unique=True)
    chef_id: Mapped[int] = mapped_column(ForeignKey("chefs.id"), nullable=False)
    check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_in_distance_m: Mapped[float | None] = mapped_column(Float)
    check_out_distance_m: Mapped[float | None] = mapped_column(Float)
    check_in_selfie_id: Mapped[int | None] = mapped_column(ForeignKey("photos.id"))
    check_out_selfie_id: Mapped[int | None] = mapped_column(ForeignKey("photos.id"))
    food_photo_id: Mapped[int | None] = mapped_column(ForeignKey("photos.id"))
    worked_minutes: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), server_default="open", nullable=False)
    exception: Mapped[str | None] = mapped_column(String(32))
    resolution: Mapped[str | None] = mapped_column(String(300))
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("status in ('open','ok','needs_review','exception','resolved')", name="status"),
        # D: "one at a time" — a chef can only be checked in (open, no checkout) to one visit.
        Index("uq_attendance_one_open_per_chef", "chef_id", unique=True,
              postgresql_where=text("check_in_at is not null and check_out_at is null and status = 'open'")),
        Index("ix_attendance_review", "status", postgresql_where=text("status in ('needs_review','exception')")),
    )


class AttendanceEvent(IdMixin, Base):
    __tablename__ = "attendance_events"
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id", ondelete="CASCADE"), nullable=False, index=True)
    chef_id: Mapped[int | None] = mapped_column(ForeignKey("chefs.id"))
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    result: Mapped[str] = mapped_column(String(48), nullable=False)  # OK or the error code
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    distance_m: Mapped[float | None] = mapped_column(Float)
    device_id: Mapped[str | None] = mapped_column(String(120))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)


class VisitRating(TimestampMixin, Base):
    """A customer's 1-5 star rating of a completed visit; one per visit. The chef's rating is the average of these."""
    __tablename__ = "visit_ratings"
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id", ondelete="CASCADE"), primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    chef_id: Mapped[int] = mapped_column(ForeignKey("chefs.id", ondelete="CASCADE"), nullable=False, index=True)
    stars: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(300))
    __table_args__ = (CheckConstraint("stars between 1 and 5", name="stars"),)


# ---------------- Tracking ----------------
class LocationPoint(Base):
    __tablename__ = "location_points"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    visit_id: Mapped[int] = mapped_column(BigInteger, nullable=False)  # no FK: high-volume append-only table
    chef_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    __table_args__ = (
        Index("ix_location_points_visit_time", "visit_id", "recorded_at"),
        Index("ix_location_points_recorded_brin", "recorded_at", postgresql_using="brin"),  # cheap 30-day retention deletes
    )


class ChefLastLocation(Base):
    __tablename__ = "chef_last_locations"
    chef_id: Mapped[int] = mapped_column(ForeignKey("chefs.id", ondelete="CASCADE"), primary_key=True)
    visit_id: Mapped[int | None] = mapped_column(BigInteger)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


# ---------------- Payments ----------------
class Payment(IdMixin, TimestampMixin, SeedMixin, Base):
    """The order for a subscription. amount_paise is the price snapshot taken when the customer subscribed."""
    __tablename__ = "payments"
    subscription_id: Mapped[int] = mapped_column(ForeignKey("subscriptions.id"), nullable=False, unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), server_default="CREATED", nullable=False)
    gateway: Mapped[str] = mapped_column(String(16), nullable=False)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    method: Mapped[str | None] = mapped_column(String(24))
    attempts: Mapped[int] = mapped_column(SmallInteger, server_default="0", nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_reason: Mapped[str | None] = mapped_column(String(200))
    refunded_paise: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    __table_args__ = (
        CheckConstraint("status in ('CREATED','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED')", name="status"),
        CheckConstraint("amount_paise > 0 and refunded_paise between 0 and amount_paise", name="amounts"),
        Index("ix_payments_status_created", "status", "created_at"),
    )


class PaymentLink(IdMixin, TimestampMixin, Base):
    __tablename__ = "payment_links"
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True)
    gateway_link_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    url: Mapped[str] = mapped_column(String(300), nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(12), server_default="active", nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    replaced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("status in ('active','paid','expired','replaced','cancelled')", name="status"),
        Index("uq_payment_links_one_active", "payment_id", unique=True, postgresql_where=text("status = 'active'")),
    )


class PaymentEvent(IdMixin, Base):
    """Every webhook delivery. Unique gateway_event_id makes processing idempotent."""
    __tablename__ = "payment_events"
    gateway: Mapped[str] = mapped_column(String(16), nullable=False)
    gateway_event_id: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    event: Mapped[str] = mapped_column(String(48), nullable=False)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    outcome: Mapped[str | None] = mapped_column(String(48))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)


class Refund(IdMixin, TimestampMixin, Base):
    __tablename__ = "refunds"
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), nullable=False, index=True)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(12), server_default="requested", nullable=False)
    gateway_refund_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (CheckConstraint("amount_paise > 0", name="amount"),
                      CheckConstraint("status in ('requested','processed','failed','flagged')", name="status"))


# ---------------- Notifications ----------------
class Notification(IdMixin, TimestampMixin, Base):
    __tablename__ = "notifications"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(String(500), nullable=False)
    href: Mapped[str | None] = mapped_column(String(200))
    event: Mapped[str] = mapped_column(String(48), nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_notifications_user_created", "user_id", "created_at"),)


class OutboxEvent(IdMixin, TimestampMixin, Base):
    """Transactional outbox: written in the same transaction as the business change, delivered by a worker (B5)."""
    __tablename__ = "outbox_events"
    event: Mapped[str] = mapped_column(String(48), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(12), server_default="pending", nullable=False)
    attempts: Mapped[int] = mapped_column(SmallInteger, server_default="0", nullable=False)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(300))
    __table_args__ = (Index("ix_outbox_pending", "available_at", postgresql_where=text("status = 'pending'")),)


# ---------------- Audit & settings ----------------
class AuditLog(IdMixin, Base):
    """Append-only; a trigger in the migration rejects UPDATE and DELETE (H6)."""
    __tablename__ = "audit_logs"
    actor_id: Mapped[int | None] = mapped_column(BigInteger)
    actor_role: Mapped[str | None] = mapped_column(String(16))
    actor_name: Mapped[str | None] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target: Mapped[str] = mapped_column(String(200), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(300))
    meta: Mapped[dict | None] = mapped_column(JSONB)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    __table_args__ = (Index("ix_audit_at", "at"),)


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(48), primary_key=True)
    value: Mapped[str] = mapped_column(String(200), nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)


# ---------------- Payouts (Part G) ----------------
class Payout(IdMixin, TimestampMixin, Base):
    __tablename__ = "payouts"
    chef_id: Mapped[int] = mapped_column(ForeignKey("chefs.id"), nullable=False)
    cycle_start: Mapped[date] = mapped_column(Date, nullable=False)
    visits: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    held_paise: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    status: Mapped[str] = mapped_column(String(12), server_default="pending", nullable=False)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bank_reference: Mapped[str | None] = mapped_column(String(64))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        # G2: exactly one payout per chef per cycle no matter how often / where the job runs.
        Index("uq_payouts_chef_cycle", "chef_id", "cycle_start", unique=True),
        CheckConstraint("status in ('pending','approved','paid','rejected')", name="status"),
    )


class PayoutItem(IdMixin, Base):
    __tablename__ = "payout_items"
    payout_id: Mapped[int] = mapped_column(ForeignKey("payouts.id", ondelete="CASCADE"), nullable=False, index=True)
    visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id"), unique=True)  # a visit is paid in one cycle only
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)  # visit | adjustment
    note: Mapped[str | None] = mapped_column(String(200))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
