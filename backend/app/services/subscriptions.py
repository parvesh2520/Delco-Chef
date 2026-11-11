"""C6–C8: subscription creation (price snapshot), activation on payment, schedule, off-days, missed days."""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.domain import IST, ist_today
from app.domain import pricing, schedule as sched_rules
from app.models import Chef, ServiceRequest, Subscription, SubscriptionDay, User, Visit
from app.services import settings as settings_svc
from app.services.events import SYSTEM, notify
from app.services.settings import Settings


def now() -> datetime:
    return datetime.now(timezone.utc)


def _dates(service: str, start: date, end: date | None, weekdays: list[int]) -> tuple[date, date]:
    if service == "monthly_subscription":
        return start, start + timedelta(days=pricing.MONTHLY_CYCLE_DAYS - 1)
    return start, end


def create_for_request(db: Session, r: ServiceRequest, s: Settings) -> Subscription:
    """Price is computed here, on the server, from settings at this moment, and frozen on the order."""
    from app.services import payments
    tomorrow = ist_today() + timedelta(days=1)
    start = max(r.start_date, tomorrow)
    span = (r.end_date - r.start_date) if r.end_date else None
    start, end = _dates(r.service, start, (start + span) if span is not None else None, r.weekdays)
    rate, minutes = s.int("rate_paise_per_person_hour"), s.int("visit_minutes")
    per_visit = pricing.per_visit_paise(rate, r.members, minutes)
    if r.service == "monthly_subscription":
        visits = pricing.MONTHLY_GUARANTEED_DAYS * pricing.visits_per_day(r.slot)
    else:
        visits = len(pricing.custom_visit_dates(start, end, set(r.weekdays))) * pricing.visits_per_day(r.slot)
        if visits == 0:
            raise AppError("NO_SERVICE_DAYS", "The chosen weekdays have no dates in this period.", 422)
    sub = Subscription(request_id=r.id, customer_id=r.customer_id, service=r.service, slot=r.slot, members=r.members,
                       meals=r.meals, start_date=start, end_date=end, weekdays=r.weekdays, rate_paise=rate,
                       per_visit_paise=per_visit, planned_visits=visits, amount_paise=per_visit * visits, chef_id=r.chef_id)
    db.add(sub)
    db.flush()
    payments.create_order_and_link(db, sub, s)
    return sub


def schedule_for(db: Session, sub: Subscription) -> sched_rules.Schedule:
    days = db.scalars(select(SubscriptionDay).where(SubscriptionDay.subscription_id == sub.id)).all()
    off = {d.day for d in days if d.kind == "off"}
    missed = {d.day for d in days if d.kind == "missed"}
    if sub.service == "monthly_subscription":
        return sched_rules.monthly(sub.start_date, sub.slot, off, missed)
    return sched_rules.custom(sub.start_date, sub.end_date, set(sub.weekdays), sub.slot, off, missed)


def schedule_json(db: Session, sub: Subscription) -> dict:
    sc = schedule_for(db, sub)
    return {"subscriptionId": str(sub.id), "serviceDates": [d.isoformat() for d in sc.service_dates], "visits": sc.visits,
            "endDate": sc.end_date.isoformat(), "forfeitedGuaranteedDays": sc.forfeited_guaranteed_days,
            "extensionDays": [d.isoformat() for d in sc.extension_days], "offDays": [d.isoformat() for d in sc.off_days],
            "missedDays": [d.isoformat() for d in sc.missed_days], "freeOffDaysLeft": sc.free_off_days_left}


def activate(db: Session, sub: Subscription, paid_at: datetime) -> None:
    """Runs once, inside the payment-confirmation transaction. Late payment moves the whole cycle (price unchanged)."""
    if sub.status != "pending_payment":
        return
    paid_day = paid_at.astimezone(IST).date()
    if paid_day >= sub.start_date:
        shift = (paid_day + timedelta(days=1)) - sub.start_date
        sub.start_date += shift
        sub.end_date += shift
    sub.status, sub.activated_at = "active", paid_at
    # Building the visit schedule (up to 180 visits + chef checks) runs in the background worker, so payment
    # confirmation returns in about a second instead of blocking the customer's redirect.
    from app.models import OutboxEvent
    db.add(OutboxEvent(event="schedule_subscription", payload={"subscription_id": sub.id}))
    notify(db, "subscription_active", sub.customer_id, "Subscription active",
           f"Your service starts on {sub.start_date:%d %b %Y}.", f"/customer/subscriptions/{sub.id}")


def sync_visits(db: Session, sub: Subscription) -> None:
    """Make future visit rows match the computed schedule: create missing days, cancel days no longer served."""
    from app.services import bookings
    s = settings_svc.load(db)
    r = db.get(ServiceRequest, sub.request_id)
    sc = schedule_for(db, sub)
    wanted = set(sc.service_dates)
    today = ist_today()
    existing = db.scalars(select(Visit).where(Visit.subscription_id == sub.id)).all()
    have: dict[date, list[Visit]] = {}
    for v in existing:
        have.setdefault(v.service_date, []).append(v)
    times = bookings._slot_times(s, sub.slot)
    changed_for_chef: list[str] = []
    created = 0
    for d, vs in have.items():
        if d not in wanted and d > today:
            for v in vs:
                if v.status in ("pending_assignment", "needs_manual_assignment", "scheduled"):
                    v.status, v.cancelled_at = "cancelled", now()
                    changed_for_chef.append(f"{d:%d %b} off")
    for d in sorted(wanted):
        live = [v for v in have.get(d, []) if v.status != "cancelled"]
        if live or d <= today:
            continue
        cancelled = [v for v in have.get(d, []) if v.status == "cancelled"]
        for i, t in enumerate(times):
            if i < len(cancelled):  # an off-day was removed again: revive the existing row
                v = cancelled[i]
                v.status, v.cancelled_at, v.chef_id = "pending_assignment", None, None
            else:
                v = bookings.make_visit(db, r, s, d, t, kind="subscription", subscription_id=sub.id, price_paise=sub.per_visit_paise)
            if sub.chef_id:
                try:
                    with db.begin_nested():
                        bookings.assign(db, SYSTEM, v.id, sub.chef_id, commit=False, quiet=True)
                    created += 1
                except AppError:
                    v.status = "needs_manual_assignment"  # admin queue shows it
    if created and sub.chef_id:
        chef = db.get(Chef, sub.chef_id)
        notify(db, "chef_assigned", chef.user_id, "Subscription visits assigned",
               f"{created} visit(s) added to your schedule from {min(wanted):%d %b}.", "/chef/jobs")
    if changed_for_chef and sub.chef_id:
        chef = db.get(Chef, sub.chef_id)
        notify(db, "off_days_changed", chef.user_id, "Schedule changed", "Customer off-days: " + ", ".join(changed_for_chef[:5]), "/chef/jobs")


def save_off_days(db: Session, customer: User, sub_id: int, days: list[str]) -> Subscription:
    sub = db.scalar(select(Subscription).where(Subscription.id == sub_id, Subscription.customer_id == customer.id).with_for_update())
    if not sub:
        raise not_found("Subscription")
    if sub.status not in ("active", "pending_payment"):
        raise AppError("SUBSCRIPTION_NOT_ACTIVE", "Off-days can only be changed on an active subscription.", 409)
    tomorrow = ist_today() + timedelta(days=1)
    wanted = set()
    for x in days:
        try:
            wanted.add(date.fromisoformat(x[:10]))
        except ValueError:
            raise AppError("VALIDATION_ERROR", f"Invalid date {x}.", 422) from None
    current = {d.day: d for d in db.scalars(select(SubscriptionDay).where(SubscriptionDay.subscription_id == sub.id, SubscriptionDay.kind == "off"))}
    for d, row in current.items():  # past off-days are history and can't be changed
        if d not in wanted and d >= tomorrow:
            db.delete(row)
    sc = schedule_for(db, sub)
    serviceable = set(sc.service_dates) | set(sc.off_days)
    for d in wanted - set(current):
        if d < tomorrow:
            raise AppError("OFF_DAY_TOO_LATE", "Off-days can be marked from tomorrow onwards.", 422)
        if d not in serviceable:
            raise AppError("OFF_DAY_NOT_IN_SCHEDULE", f"{d:%d %b} is not one of your service days.", 422)
        db.add(SubscriptionDay(subscription_id=sub.id, day=d, kind="off"))
    db.flush()
    if sub.status == "active":
        sync_visits(db, sub)
    db.commit()
    return sub


def mark_missed(db: Session, v: Visit, reason: str) -> None:
    """Company failed to serve (chef no-show / cancel): extend the cycle (C rules)."""
    if v.kind != "subscription" or not v.subscription_id:
        return
    v.status = "missed"
    if not db.get(SubscriptionDay, (v.subscription_id, v.service_date)):
        db.add(SubscriptionDay(subscription_id=v.subscription_id, day=v.service_date, kind="missed"))
        db.flush()
        sync_visits(db, db.get(Subscription, v.subscription_id))
    notify(db, "visit_missed", v.customer_id, "Visit missed", f"Sorry — we missed your visit on {v.service_date:%d %b}. "
           "Your plan has been extended.", f"/customer/subscriptions/{v.subscription_id}")
