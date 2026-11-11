"""Service requests (board cards), trials, visits (bookings), assignments, subscriptions."""
from datetime import date, datetime

from sqlalchemy import (Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, LargeBinary,
                        Numeric, SmallInteger, String, Text, text)
from sqlalchemy.dialects.postgresql import ARRAY, ExcludeConstraint, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, SeedMixin, TimestampMixin

SERVICES = ("monthly_subscription", "custom_time", "home_food", "party_mode")
BOOKABLE = ("monthly_subscription", "custom_time")
STAGES = ("request", "trial1_scheduled", "trial1_awaiting_decision", "trial2_requested", "trial2_scheduled",
          "trial2_awaiting_decision", "subscription_requested", "payment_done", "closed")


class ServiceRequest(IdMixin, TimestampMixin, SeedMixin, Base):
    """One card per customer per service on the admin board."""
    __tablename__ = "service_requests"
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    service: Mapped[str] = mapped_column(String(24), nullable=False)
    stage: Mapped[str] = mapped_column(String(32), server_default="request", nullable=False)
    members: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    slot: Mapped[str] = mapped_column(String(8), nullable=False)  # morning | evening | both
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)  # custom time only
    weekdays: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger), server_default="{}", nullable=False)
    meals: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}", nullable=False)
    cuisines: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}", nullable=False)
    diet: Mapped[str] = mapped_column(String(16), nullable=False)
    dietary_notes: Mapped[str | None] = mapped_column(String(300))
    allergies: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}", nullable=False)
    allergy_notes: Mapped[str | None] = mapped_column(String(500))
    instructions: Mapped[str | None] = mapped_column(String(300))
    address_id: Mapped[int] = mapped_column(ForeignKey("addresses.id"), nullable=False)
    chef_id: Mapped[int | None] = mapped_column(ForeignKey("chefs.id"))
    closed_reason: Mapped[str | None] = mapped_column(String(200))
    # C9 stage timestamps
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subscription_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint(f"service in {BOOKABLE}", name="bookable"),
        CheckConstraint(f"stage in {STAGES}", name="stage"),
        CheckConstraint("members between 1 and 7", name="members"),
        CheckConstraint("slot in ('morning','evening','both')", name="slot"),
        # C1: one open request per customer per service, enforced by the database.
        Index("uq_requests_one_open", "customer_id", "service", unique=True,
              postgresql_where=text("stage not in ('closed','payment_done')")),
        Index("ix_requests_stage_created", "stage", "created_at"),  # admin queue filter + sort
        Index("ix_requests_customer_created", "customer_id", "created_at"),  # booking history
    )


class BoardMove(IdMixin, Base):
    __tablename__ = "board_moves"
    request_id: Mapped[int] = mapped_column(ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    from_stage: Mapped[str | None] = mapped_column(String(32))
    to_stage: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    actor_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    note: Mapped[str | None] = mapped_column(String(300))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)


class Trial(IdMixin, TimestampMixin, SeedMixin, Base):
    __tablename__ = "trials"
    request_id: Mapped[int] = mapped_column(ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    service: Mapped[str] = mapped_column(String(24), nullable=False)
    number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(20), server_default="pending_assignment", nullable=False)
    decision: Mapped[str | None] = mapped_column(String(16))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    counted: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pushed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    __table_args__ = (
        CheckConstraint("number in (1, 2)", name="max_two"),
        CheckConstraint("status in ('requested','pending_assignment','scheduled','in_progress','completed','cancelled')", name="status"),
        CheckConstraint("decision is null or decision in ('subscribe','another_trial','reject')", name="decision"),
        # Structural guard against a third trial: per customer+service only trial #1 and #2 can be live.
        Index("uq_trials_customer_service_number", "customer_id", "service", "number", unique=True,
              postgresql_where=text("status <> 'cancelled'")),
    )


class Subscription(IdMixin, TimestampMixin, SeedMixin, Base):
    __tablename__ = "subscriptions"
    request_id: Mapped[int] = mapped_column(ForeignKey("service_requests.id"), nullable=False, unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    service: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(16), server_default="pending_payment", nullable=False)
    slot: Mapped[str] = mapped_column(String(8), nullable=False)
    members: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    meals: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}", nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    weekdays: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger), server_default="{}", nullable=False)
    # Price snapshot (F: settings changes never alter an existing order).
    rate_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    per_visit_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    planned_visits: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    chef_id: Mapped[int | None] = mapped_column(ForeignKey("chefs.id"))
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("status in ('pending_payment','active','completed','cancelled')", name="status"),
        CheckConstraint("amount_paise >= 0", name="amount"),
    )


class SubscriptionDay(Base):
    """Customer off-days and company-missed days; the schedule is derived from these (C7)."""
    __tablename__ = "subscription_days"
    subscription_id: Mapped[int] = mapped_column(ForeignKey("subscriptions.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    __table_args__ = (CheckConstraint("kind in ('off','missed')", name="kind"),)


class Visit(IdMixin, TimestampMixin, SeedMixin, Base):
    """A 60-minute booking at the customer's home: a free trial or one subscription service day."""
    __tablename__ = "visits"
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    request_id: Mapped[int] = mapped_column(ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    trial_id: Mapped[int | None] = mapped_column(ForeignKey("trials.id"), unique=True)
    subscription_id: Mapped[int | None] = mapped_column(ForeignKey("subscriptions.id"))
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    address_id: Mapped[int] = mapped_column(ForeignKey("addresses.id"), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)  # snapshot of the pin at booking time
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    chef_id: Mapped[int | None] = mapped_column(ForeignKey("chefs.id"))
    service_date: Mapped[date] = mapped_column(Date, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(24), server_default="pending_assignment", nullable=False)
    price_paise: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    check_in_code_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    code_attempts: Mapped[int] = mapped_column(SmallInteger, server_default="0", nullable=False)
    code_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    travel_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    travel_stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    score: Mapped[float | None] = mapped_column(Numeric(5, 3))
    runner_up_chef_id: Mapped[int | None] = mapped_column(ForeignKey("chefs.id"))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("kind in ('trial','subscription')", name="kind"),
        CheckConstraint("ends_at > starts_at", name="interval"),
        CheckConstraint("status in ('pending_assignment','needs_manual_assignment','scheduled','chef_travelling','checked_in',"
                        "'completed','customer_unavailable','cancelled','missed')", name="status"),
        # B4 backstop: the DB itself refuses two live visits for one chef whose 60-min slots intersect.
        ExcludeConstraint(("chef_id", "="), (text("tstzrange(starts_at, ends_at)"), "&&"), name="ex_visits_chef_no_overlap",
                          using="gist", where=text("chef_id is not null and status not in ('cancelled','missed')")),
        Index("ix_visits_chef_starts", "chef_id", "starts_at"),  # chef schedule / buffer-overlap check
        Index("ix_visits_customer_starts", "customer_id", "starts_at"),
        Index("ix_visits_status_date", "status", "service_date"),
        Index("ix_visits_subscription", "subscription_id"),
    )


class Assignment(IdMixin, TimestampMixin, Base):
    """Every assign / reassign of a chef to a visit, with the ranked list as it was shown (B2)."""
    __tablename__ = "assignments"
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id", ondelete="CASCADE"), nullable=False, index=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    chef_id: Mapped[int] = mapped_column(ForeignKey("chefs.id"), nullable=False)
    previous_chef_id: Mapped[int | None] = mapped_column(ForeignKey("chefs.id"))
    action: Mapped[str] = mapped_column(String(16), nullable=False)  # assigned | reassigned | declined_by_chef
    status: Mapped[str] = mapped_column(String(16), server_default="offered", nullable=False)
    reason: Mapped[str | None] = mapped_column(String(300))
    score: Mapped[float | None] = mapped_column(Numeric(5, 3))
    score_parts: Mapped[dict | None] = mapped_column(JSONB)
    runner_up_chef_id: Mapped[int | None] = mapped_column(ForeignKey("chefs.id"))
    suggestions: Mapped[list | None] = mapped_column(JSONB)
    assigned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("status in ('offered','accepted','declined','expired','superseded')", name="status"),
        Index("ix_assignments_chef_created", "chef_id", "created_at"),  # chef job list + jobs-this-week count
    )
