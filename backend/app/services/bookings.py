"""Parts B & C: service requests, trials, suggestions, assignment, the admin board, trial decisions."""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.core.security import encrypt, numeric_code
from app.domain import IST, ist_datetime, ist_today, parse_hhmm
from app.domain import board
from app.domain.geo import bounding_box
from app.domain.ranking import BookingSlot, ChefCandidate, Weights, rank
from app.models import (Address, Assignment, BoardMove, Chef, ChefOffDay, CustomerProfile, ServiceRequest, Trial, User,
                        Visit)
from app.services import settings as settings_svc
from app.services.events import SYSTEM, Actor, audit, notify, notify_admins
from app.services.settings import Settings

BOOKABLE = ("monthly_subscription", "custom_time")
PLACEHOLDER = ("home_food", "party_mode")
LIVE_VISIT = ("pending_assignment", "needs_manual_assignment", "scheduled", "chef_travelling", "checked_in")


def now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_bookable(service: str) -> None:
    if service in PLACEHOLDER:
        raise AppError("SERVICE_NOT_AVAILABLE", "This service is coming soon. Trials, bookings and payments are not available for it.", 422)
    if service not in BOOKABLE:
        raise AppError("SERVICE_UNKNOWN", "Unknown service.", 422)


# ---------------- Board ----------------
def move(db: Session, r: ServiceRequest, to: board.Stage, actor_kind: str, actor: Actor, note: str | None = None) -> None:
    frm = board.Stage(r.stage)
    try:
        board.check(frm, to, actor_kind)
    except board.InvalidMove as e:
        raise AppError(e.code, str(e), 409) from None
    r.stage = to.value
    t = now()
    if to == board.Stage.CLOSED:
        r.closed_at = t
    db.add(BoardMove(request_id=r.id, from_stage=frm.value, to_stage=to.value, actor_id=actor.id, actor_kind=actor_kind, note=note))


# ---------------- Trial accounting (C1) ----------------
def trials_used(db: Session, customer_id: int, service: str) -> int:
    """Trials that are live or consumed. Cancelled-in-time trials don't count."""
    return db.scalar(select(func.count()).select_from(Trial).where(
        Trial.customer_id == customer_id, Trial.service == service,
        or_(Trial.status != "cancelled", Trial.counted.is_(True)))) or 0


def completed_trials(db: Session, customer_id: int, service: str) -> int:
    return db.scalar(select(func.count()).select_from(Trial).where(
        Trial.customer_id == customer_id, Trial.service == service, Trial.status == "completed")) or 0


def open_request(db: Session, customer_id: int, service: str) -> ServiceRequest | None:
    return db.scalar(select(ServiceRequest).where(ServiceRequest.customer_id == customer_id, ServiceRequest.service == service,
                                                  ServiceRequest.stage.not_in(("closed", "payment_done"))))


def eligibility(db: Session, customer_id: int, service: str) -> dict:
    s = settings_svc.load(db)
    max_trials = s.int("max_free_trials")
    open_r = open_request(db, customer_id, service)
    used = trials_used(db, customer_id, service)
    if open_r and open_r.stage in ("request", "trial1_scheduled", "trial2_requested", "trial2_scheduled"):
        trial_status = "trial_in_progress"
    elif used >= max_trials:
        trial_status = "trials_used"
    elif used:
        trial_status = "trial_completed"
    else:
        trial_status = "not_started"
    reason = None
    if open_r:
        reason = "You already have an open request for this service."
    return {"service": service, "openRequestId": str(open_r.id) if open_r else None, "trialsUsed": used, "maxTrials": max_trials,
            "completedTrials": completed_trials(db, customer_id, service), "trialStatus": trial_status,
            "canRequest": open_r is None, "canRequestTrial": open_r is None and used < max_trials,
            "canSubscribe": open_r is None and completed_trials(db, customer_id, service) > 0, "reason": reason}


# ---------------- Create request (A7, B1, C1) ----------------
def _slot_times(s: Settings, slot: str) -> list[tuple]:
    keys = {"morning": ["slot_morning"], "evening": ["slot_evening"], "both": ["slot_morning", "slot_evening"]}[slot]
    return [parse_hhmm(s.raw(k)) for k in keys]


def make_visit(db: Session, r: ServiceRequest, s: Settings, day: date, start_time, *, kind: str, trial_id: int | None = None,
               subscription_id: int | None = None, price_paise: int = 0) -> Visit:
    addr = db.get(Address, r.address_id)
    starts = ist_datetime(day, start_time)
    v = Visit(kind=kind, request_id=r.id, trial_id=trial_id, subscription_id=subscription_id, customer_id=r.customer_id,
              address_id=r.address_id, lat=addr.lat, lng=addr.lng, service_date=day, starts_at=starts,
              ends_at=starts + timedelta(minutes=s.int("visit_minutes")), status="pending_assignment", price_paise=price_paise)
    db.add(v)
    db.flush()
    return v


def validate_requirements(db: Session, customer_id: int, service: str, body: dict, s: Settings) -> dict:
    errors: dict[str, str] = {}
    tomorrow = ist_today() + timedelta(days=1)
    try:
        start = date.fromisoformat(str(body.get("startDate"))[:10])
    except ValueError:
        start = None
    if start is None:
        errors["startDate"] = "Choose a start date."
    elif start < tomorrow:
        errors["startDate"] = "Bookings can start tomorrow or later (IST), never in the past."
    members = body.get("members")
    if not isinstance(members, int) or not 1 <= members <= 7:
        errors["members"] = "Number of people must be between 1 and 7."
    slot = body.get("slot")
    if slot not in ("morning", "evening", "both"):
        errors["slot"] = "Choose Morning, Evening or Both."
    end = None
    weekdays = sorted(set(body.get("weekdays") or []))
    if service == "custom_time" and start:
        if body.get("endDate"):
            end = date.fromisoformat(str(body["endDate"])[:10])
        elif body.get("durationDays"):
            end = start + timedelta(days=int(body["durationDays"]) - 1)
        if end is None:
            errors["endDate"] = "Choose an end date."
        else:
            span = (end - start).days + 1
            if span < 7:
                errors["endDate"] = "The minimum is 7 days (both days count)."
            elif span > 90:
                errors["endDate"] = "The maximum is 90 days."
        if not weekdays or any(not isinstance(d, int) or not 0 <= d <= 6 for d in weekdays):
            errors["weekdays"] = "Choose at least one weekday."
    allergies = [a.strip() for a in body.get("allergies") or [] if a and a.strip()]
    has_allergies = bool(body.get("hasAllergies")) or bool(allergies)
    notes = (body.get("allergyNotes") or "").strip()
    if has_allergies and not notes:
        errors["allergyNotes"] = "Describe the allergy: this detail is required when allergies is Yes."
    if len(body.get("instructions") or "") > 300:
        errors["instructions"] = "Special instructions can be at most 300 characters."
    if body.get("diet") not in ("veg", "non_veg", "eggetarian", "vegan", "jain"):
        errors["diet"] = "Choose a dietary preference."
    addr = None
    try:
        addr = db.scalar(select(Address).where(Address.id == int(body.get("addressId")), Address.user_id == customer_id,
                                               Address.deleted_at.is_(None)))
    except (TypeError, ValueError):
        pass
    if addr is None:
        errors["addressId"] = "Choose one of your saved addresses."
    if errors:
        raise AppError("VALIDATION_ERROR", next(iter(errors.values())), 422, fields=errors)
    return {"members": members, "slot": slot, "start_date": start, "end_date": end,
            "weekdays": weekdays if service == "custom_time" else [], "meals": body.get("meals") or [],
            "cuisines": body.get("cuisines") or [], "diet": body["diet"], "dietary_notes": body.get("dietaryNotes"),
            "allergies": allergies, "allergy_notes": notes or None, "instructions": body.get("instructions"), "address_id": addr.id}


def create_request(db: Session, customer: User, service: str, body: dict) -> ServiceRequest:
    """intent=trial (default): free trial request. intent=subscribe: subscribe directly (needs a completed trial)."""
    ensure_bookable(service)
    s = settings_svc.load(db)
    intent = body.get("intent", "trial")
    if open_request(db, customer.id, service):
        raise AppError("OPEN_REQUEST_EXISTS", "You already have an open request for this service.", 409)
    if intent == "trial" and trials_used(db, customer.id, service) >= s.int("max_free_trials"):
        raise AppError("TRIAL_LIMIT_REACHED", "You have used all free trials for this service.", 409)
    if intent == "subscribe" and completed_trials(db, customer.id, service) == 0:
        raise AppError("NO_COMPLETED_TRIAL", "Complete a free trial of this service before subscribing.", 409)
    if intent not in ("trial", "subscribe"):
        raise AppError("VALIDATION_ERROR", "Unknown intent.", 422)
    fields = validate_requirements(db, customer.id, service, body, s)
    r = ServiceRequest(customer_id=customer.id, service=service, stage="request", **fields)
    db.add(r)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise AppError("OPEN_REQUEST_EXISTS", "You already have an open request for this service.", 409) from None
    db.add(BoardMove(request_id=r.id, from_stage=None, to_stage="request", actor_id=customer.id, actor_kind="customer"))
    if intent == "trial":
        number = trials_used(db, customer.id, service) + 1
        t = Trial(request_id=r.id, customer_id=customer.id, service=service, number=number, status="pending_assignment")
        db.add(t)
        db.flush()
        make_visit(db, r, s, r.start_date, _slot_times(s, r.slot)[0], kind="trial", trial_id=t.id)
        notify_admins(db, "trial_requested", "New trial request",
                      f"{customer.full_name or 'A customer'} requested a {service.replace('_', ' ')} trial.", f"/admin/request/{r.id}")
    else:
        from app.services import subscriptions
        r.stage = "subscription_requested"
        r.subscription_requested_at = now()
        db.add(BoardMove(request_id=r.id, from_stage="request", to_stage="subscription_requested", actor_id=customer.id,
                         actor_kind="customer", note="Direct subscription after earlier trial"))
        subscriptions.create_for_request(db, r, s)
    # Keep the profile's food needs in step with the latest request.
    prof = db.get(CustomerProfile, customer.id)
    if prof:
        prof.diet, prof.cuisines, prof.allergies, prof.allergy_notes = r.diet, r.cuisines, r.allergies, r.allergy_notes
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        if "uq_trials_customer_service_number" in str(e.orig):
            raise AppError("TRIAL_LIMIT_REACHED", "You have used all free trials for this service.", 409) from None
        raise AppError("OPEN_REQUEST_EXISTS", "You already have an open request for this service.", 409) from None
    return r


# ---------------- Suggestions (B2, B7) ----------------
def _week_bounds(d: date) -> tuple[date, date]:
    start = d - timedelta(days=d.weekday())
    return start, start + timedelta(days=6)


def candidates(db: Session, v: Visit, s: Settings) -> list[ChefCandidate]:
    radius = s.float("radius_km")
    # Bounding box at 1.5× radius: index-assisted, also surfaces nearby excluded chefs with their reasons.
    la0, la1, ln0, ln1 = bounding_box(v.lat, v.lng, radius * 1.5)
    chefs = db.execute(select(Chef, User.full_name).join(User, User.id == Chef.user_id)
                       .where(Chef.home_lat.between(la0, la1), Chef.home_lng.between(ln0, ln1),
                              Chef.status != "draft", User.status == "active")).all()
    if not chefs:
        return []
    ids = [c.id for c, _ in chefs]
    off = {(cid, d) for cid, d in db.execute(select(ChefOffDay.chef_id, ChefOffDay.day).where(
        ChefOffDay.chef_id.in_(ids), ChefOffDay.day == v.service_date))}
    busy: dict[int, list] = {}
    for cid, st, en in db.execute(select(Visit.chef_id, Visit.starts_at, Visit.ends_at).where(
            Visit.chef_id.in_(ids), Visit.id != v.id, Visit.status.in_(LIVE_VISIT + ("completed",)),
            Visit.starts_at < v.ends_at + timedelta(hours=6), Visit.ends_at > v.starts_at - timedelta(hours=6))):
        busy.setdefault(cid, []).append((st, en))
    w0, w1 = _week_bounds(v.service_date)
    jobs = dict(db.execute(select(Visit.chef_id, func.count()).where(
        Visit.chef_id.in_(ids), Visit.service_date.between(w0, w1), Visit.status != "cancelled", Visit.id != v.id)
        .group_by(Visit.chef_id)).all())
    return [ChefCandidate(c.id, name or f"Chef {c.id}", float(c.rating), c.home_lat, c.home_lng, c.active,
                          c.status == "approved", {sk.cuisine for sk in c.skills}, {d for cid, d in off if cid == c.id},
                          busy.get(c.id, []), jobs.get(c.id, 0), c.experience_years) for c, name in chefs]


def suggest(db: Session, v: Visit, s: Settings | None = None) -> list:
    s = s or settings_svc.load(db)
    r = db.get(ServiceRequest, v.request_id)
    w = Weights(s.float("w_rating"), s.float("w_distance"), s.float("w_workload"))
    return rank(candidates(db, v, s), BookingSlot(v.lat, v.lng, v.starts_at, v.ends_at, v.service_date, r.cuisines),
                weights=w, radius_km=s.float("radius_km"), buffer_minutes=s.int("travel_buffer_min"))


MAX_EXCLUDED_SHOWN = 30


def trim(ranked: list) -> list:
    eligible = [x for x in ranked if x.eligible]
    excluded = [x for x in ranked if not x.eligible][:MAX_EXCLUDED_SHOWN]  # already sorted by distance
    return eligible + excluded


def suggestion_json(x) -> dict:
    return {"chefId": str(x.chef_id), "chefName": x.name, "rating": x.rating, "experienceYears": x.experience_years,
            "cuisines": x.cuisines, "distanceKm": x.distance_km, "activeJobs": x.jobs_this_week, "jobsThisWeek": x.jobs_this_week,
            "score": x.score, "eligible": x.eligible, "reasons": x.reasons,
            "breakdown": {"rating": x.parts["rating"], "distance": x.parts["distance"], "workload": x.parts["workload"], "cuisine": 0}}


def proposed_visit(db: Session, r: ServiceRequest, day: date) -> Visit:
    """Unsaved visit used to rank chefs for a date that has no visit yet (admin pushing trial 2)."""
    s = settings_svc.load(db)
    addr = db.get(Address, r.address_id)
    first = db.scalar(select(Visit).where(Visit.request_id == r.id).order_by(Visit.id).limit(1))
    t = first.starts_at.astimezone(IST).time() if first else _slot_times(s, r.slot)[0]
    starts = ist_datetime(day, t)
    return Visit(id=0, request_id=r.id, lat=addr.lat, lng=addr.lng, service_date=day, starts_at=starts,
                 ends_at=starts + timedelta(minutes=s.int("visit_minutes")))


def target_visit(db: Session, r: ServiceRequest) -> Visit | None:
    """The visit an admin assigns for a card: the pending trial visit, else the next unassigned subscription visit."""
    return db.scalar(select(Visit).where(Visit.request_id == r.id, Visit.status.in_(("pending_assignment", "needs_manual_assignment",
                                                                                      "scheduled")), Visit.starts_at > now())
                     .order_by(Visit.chef_id.is_not(None), Visit.starts_at).limit(1))


# ---------------- Assignment (B3, B4) ----------------
def assign(db: Session, actor: Actor, visit_id: int, chef_id: int, reason: str | None = None, *, commit: bool = True,
           quiet: bool = False) -> Visit:
    """Concurrency: lock the chef row FOR UPDATE, so all assignments of one chef are serialised; re-check the buffer
    inside that lock; the exclusion constraint on visits is the final backstop."""
    s = settings_svc.load(db)
    chef = db.scalar(select(Chef).where(Chef.id == chef_id).with_for_update())
    if not chef:
        raise not_found("Chef")
    v = db.scalar(select(Visit).where(Visit.id == visit_id).with_for_update())
    if not v:
        raise not_found("Visit")
    r = db.scalar(select(ServiceRequest).where(ServiceRequest.id == v.request_id).with_for_update())
    if v.status not in ("pending_assignment", "needs_manual_assignment", "scheduled"):
        raise AppError("VISIT_NOT_ASSIGNABLE", "This visit can no longer be assigned.", 409)
    if v.starts_at <= now():
        raise AppError("VISIT_IN_PAST", "This visit has already started.", 409)
    if v.kind == "trial":
        t = db.get(Trial, v.trial_id)
        if t.number > s.int("max_free_trials"):
            raise AppError("TRIAL_LIMIT_REACHED", "This customer has used all free trials for this service.", 409)
    previous = v.chef_id
    if previous == chef_id:
        return v
    if previous and not (reason or "").strip():
        raise AppError("REASSIGN_REASON_REQUIRED", "A reason is required to change the assigned chef.", 422)
    ranked = suggest(db, v, s)
    pick = next((x for x in ranked if x.chef_id == chef_id), None)
    if pick is None or not pick.eligible:
        why = pick.reasons if pick else ["Chef is not within the search area"]
        code = "ASSIGN_CONFLICT" if pick and any("buffer" in x for x in pick.reasons) else "CHEF_NOT_ELIGIBLE"
        if pick and any("buffer" in x for x in pick.reasons):
            raise AppError(code, "This chef already has an overlapping booking.", 409, extra={"reasons": why})
        raise AppError(code, f"Chef is not eligible: {'; '.join(why)}.", 409, extra={"reasons": why})
    runner = next((x for x in ranked if x.eligible and x.chef_id != chef_id), None)
    db.query(Assignment).filter(Assignment.visit_id == v.id, Assignment.status.in_(("offered", "accepted"))).update(
        {"status": "superseded"}, synchronize_session=False)
    v.chef_id, v.status, v.assigned_at, v.score = chef_id, "scheduled", now(), pick.score
    v.runner_up_chef_id = runner.chef_id if runner else None
    if not v.check_in_code_enc:
        v.check_in_code_enc = encrypt(numeric_code(4))
    db.add(Assignment(visit_id=v.id, request_id=r.id, chef_id=chef_id, previous_chef_id=previous,
                      action="reassigned" if previous else "assigned", reason=reason, score=pick.score,
                      score_parts=pick.parts, runner_up_chef_id=v.runner_up_chef_id,
                      suggestions=[suggestion_json(x) for x in ranked[:10]], assigned_by=actor.id))
    r.chef_id = chef_id
    r.assigned_at = r.assigned_at or now()
    if r.stage == "request":
        move(db, r, board.Stage.TRIAL1_SCHEDULED, "admin_assign", actor)
    elif r.stage == "trial2_requested":
        move(db, r, board.Stage.TRIAL2_SCHEDULED, "admin_assign", actor)
    if v.kind == "trial":
        db.get(Trial, v.trial_id).status = "scheduled"
    if quiet:  # bulk subscription scheduling: the caller sends one summary notification instead
        if commit:
            db.commit()
        return v
    when = v.starts_at.astimezone(IST).strftime("%d %b, %H:%M")
    cname = db.scalar(select(User.full_name).where(User.id == chef.user_id)) or "your chef"
    notify(db, "chef_assigned", r.customer_id, "Chef assigned", f"{cname} will cook for you on {when}.", f"/customer/visit/{v.id}")
    allergy = f" Allergy: {r.allergy_notes}." if r.allergy_notes else ""
    notify(db, "chef_assigned", chef.user_id, "New assignment" if not previous else "Assignment changed",
           f"{v.kind.title()} visit on {when}.{allergy}", "/chef/jobs")
    if previous:
        old = db.get(Chef, previous)
        notify(db, "assignment_changed", old.user_id, "Assignment removed", f"The visit on {when} was reassigned. Reason: {reason}", "/chef/jobs")
        notify(db, "assignment_changed", r.customer_id, "Chef changed", f"{cname} will now cook for you on {when}.", f"/customer/visit/{v.id}")
    audit(db, actor, "Reassigned chef" if previous else "Assigned chef", f"Visit {v.id} → chef {chef_id}", reason=reason,
          meta={"score": pick.score, "previous_chef_id": previous, "runner_up": v.runner_up_chef_id})
    if commit:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise AppError("ASSIGN_CONFLICT", "This chef already has an overlapping booking.", 409) from None
    return v


def respond(db: Session, chef: Chef, assignment_id: int, accept: bool, reason: str | None) -> Assignment:
    """B9: chef accepts or declines. A decline returns the visit to the admin queue (never auto-reassigned)."""
    a = db.scalar(select(Assignment).where(Assignment.id == assignment_id, Assignment.chef_id == chef.id).with_for_update())
    if not a:
        raise not_found("Assignment")
    if a.status != "offered":
        raise AppError("ASSIGNMENT_CLOSED", "This assignment is no longer open.", 409)
    a.status, a.responded_at = ("accepted" if accept else "declined"), now()
    if not accept:
        v = db.get(Visit, a.visit_id)
        v.chef_id, v.status = None, "pending_assignment"
        a.reason = reason
        db.add(Assignment(visit_id=v.id, request_id=a.request_id, chef_id=chef.id, action="declined_by_chef", status="declined",
                          reason=reason or "Declined by chef", assigned_by=chef.user_id))
        r = db.get(ServiceRequest, a.request_id)
        notify_admins(db, "assignment_declined", "Chef declined", f"A chef declined visit {v.id}. Pick the next ranked chef.",
                      f"/admin/request/{r.id}")
        audit(db, Actor(chef.user_id, "chef"), "Chef declined assignment", f"Visit {v.id}", reason=reason)
    db.commit()
    return a


def expire_unanswered(db: Session) -> int:
    """B9: offers older than the response timeout go back to the queue."""
    s = settings_svc.load(db)
    cutoff = now() - timedelta(minutes=s.int("chef_response_min"))
    stale = db.scalars(select(Assignment).where(Assignment.status == "offered", Assignment.created_at < cutoff)
                       .with_for_update(skip_locked=True)).all()
    for a in stale:
        a.status = "expired"
        v = db.get(Visit, a.visit_id)
        if v.chef_id == a.chef_id and v.status == "scheduled" and v.starts_at > now():
            v.chef_id, v.status = None, "pending_assignment"
            notify_admins(db, "assignment_expired", "Chef did not respond",
                          f"Visit {v.id} is back in the queue.", f"/admin/request/{a.request_id}")
    db.commit()
    return len(stale)


# ---------------- Trial lifecycle (C) ----------------
def on_visit_finished(db: Session, v: Visit) -> None:
    """Called inside the check-out / customer-unavailable transaction."""
    if v.kind != "trial":
        return
    t = db.get(Trial, v.trial_id)
    t.status, t.completed_at, t.counted = "completed", now(), True
    r = db.get(ServiceRequest, v.request_id)
    to = board.Stage.TRIAL1_AWAITING if r.stage == "trial1_scheduled" else board.Stage.TRIAL2_AWAITING
    if r.stage in ("trial1_scheduled", "trial2_scheduled"):
        move(db, r, to, "system", SYSTEM, "Visit completed")
    r.trial_done_at = now()
    s = settings_svc.load(db)
    choice = "Subscribe or request another trial" if t.number < s.int("max_free_trials") else "Subscribe or reject"
    notify(db, "trial_completed", r.customer_id, "Trial completed", f"How was it? {choice}.", f"/customer/trials/{t.id}/decision")


def decide(db: Session, customer: User, trial_id: int, decision: str, body: dict | None = None) -> dict:
    s = settings_svc.load(db)
    t = db.scalar(select(Trial).where(Trial.id == trial_id, Trial.customer_id == customer.id).with_for_update())
    if not t:
        raise not_found("Trial")
    r = db.scalar(select(ServiceRequest).where(ServiceRequest.id == t.request_id).with_for_update())
    if t.status != "completed":
        raise AppError("TRIAL_NOT_COMPLETED", "You can decide once the trial visit is completed.", 409)
    if t.decision is not None:
        raise AppError("DECISION_ALREADY_MADE", "A decision has already been recorded for this trial.", 409)
    expected = "trial1_awaiting_decision" if t.number == 1 else "trial2_awaiting_decision"
    if r.stage != expected:
        raise AppError("DECISION_NOT_ALLOWED", "This trial is not awaiting a decision.", 409)
    is_last = t.number >= s.int("max_free_trials")
    allowed = ("subscribe", "reject") if is_last else ("subscribe", "another_trial")
    if decision not in allowed:
        raise AppError("DECISION_NOT_ALLOWED", f"After trial {t.number} you can choose: {' or '.join(allowed).replace('_', ' ')}.",
                       409, extra={"allowed": list(allowed)})
    t.decision, t.decided_at = decision, now()
    me = Actor.of(customer)
    sub_id = None
    if decision == "another_trial":
        move(db, r, board.Stage.TRIAL2_REQUESTED, "customer", me)
        t2 = Trial(request_id=r.id, customer_id=customer.id, service=r.service, number=t.number + 1, status="requested")
        db.add(t2)
        db.flush()
        first = db.scalar(select(Visit).where(Visit.trial_id == t.id))
        day = max(ist_today() + timedelta(days=1), first.service_date + timedelta(days=1))
        make_visit(db, r, s, day, first.starts_at.astimezone(IST).time(), kind="trial", trial_id=t2.id)
        notify_admins(db, "trial_requested", "Second trial requested", "A customer asked for another trial.", f"/admin/request/{r.id}")
    elif decision == "reject":
        move(db, r, board.Stage.CLOSED, "customer", me, "Customer rejected after final trial")
        r.closed_reason = "Customer rejected after final trial"
    else:
        from app.services import subscriptions
        move(db, r, board.Stage.SUBSCRIPTION_REQUESTED, "customer", me)
        r.subscription_requested_at = now()
        if body and body.get("startDate"):
            r.start_date = date.fromisoformat(str(body["startDate"])[:10])
        sub_id = subscriptions.create_for_request(db, r, s).id
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError("TRIAL_LIMIT_REACHED", "You have used all free trials for this service.", 409) from None
    return {"decision": decision, "subscriptionId": str(sub_id) if sub_id else None, "requestId": str(r.id)}


def push_second_trial(db: Session, actor: Actor, request_id: int, chef_id: int, day: date) -> ServiceRequest:
    """C4: Admin creates trial 2 while trial 1 awaits the customer's decision. Each refusal has its own code."""
    s = settings_svc.load(db)
    r = db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id).with_for_update())
    if not r:
        raise not_found("Request")
    if trials_used(db, r.customer_id, r.service) >= s.int("max_free_trials"):
        raise AppError("TRIAL_LIMIT_REACHED", "This customer has used all free trials for this service.", 409)
    if r.stage in ("subscription_requested", "payment_done"):
        raise AppError("PUSH_ALREADY_SUBSCRIBING", "The customer has already moved to subscribing.", 409)
    if r.stage in ("request", "trial1_scheduled"):
        raise AppError("PUSH_TRIAL1_NOT_COMPLETED", "Trial 1 is not completed yet.", 409)
    if r.stage != "trial1_awaiting_decision":
        raise AppError("PUSH_NOT_ALLOWED", "A second trial can only be pushed while trial 1 awaits a decision.", 409)
    if day < ist_today() + timedelta(days=1):
        raise AppError("VALIDATION_ERROR", "The trial date must be tomorrow or later.", 422, fields={"date": "too early"})
    first = db.scalar(select(Trial).where(Trial.request_id == r.id, Trial.number == 1, Trial.status == "completed"))
    first_visit = db.scalar(select(Visit).where(Visit.trial_id == first.id))
    t2 = Trial(request_id=r.id, customer_id=r.customer_id, service=r.service, number=2, status="pending_assignment", pushed_by=actor.id)
    db.add(t2)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise AppError("TRIAL_LIMIT_REACHED", "This customer has used all free trials for this service.", 409) from None
    v = make_visit(db, r, s, day, first_visit.starts_at.astimezone(IST).time(), kind="trial", trial_id=t2.id)
    move(db, r, board.Stage.TRIAL2_SCHEDULED, "admin_push", actor, "Admin pushed second trial")
    assign(db, actor, v.id, chef_id, commit=False)
    notify(db, "second_trial_scheduled", r.customer_id, "Second trial scheduled",
           f"We've scheduled another free trial on {day:%d %b}. You can cancel it up to 2 hours before.", f"/customer/trials/{t2.id}")
    audit(db, actor, "Pushed second trial", f"Request {r.id}", meta={"chef_id": chef_id, "date": day.isoformat()})
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError("ASSIGN_CONFLICT", "This chef already has an overlapping booking.", 409) from None
    return r


def cancel_trial(db: Session, customer: User, trial_id: int) -> Trial:
    t = db.scalar(select(Trial).where(Trial.id == trial_id, Trial.customer_id == customer.id).with_for_update())
    if not t:
        raise not_found("Trial")
    if t.status not in ("requested", "pending_assignment", "scheduled"):
        raise AppError("TRIAL_NOT_CANCELLABLE", "This trial can no longer be cancelled.", 409)
    r = db.scalar(select(ServiceRequest).where(ServiceRequest.id == t.request_id).with_for_update())
    v = db.scalar(select(Visit).where(Visit.trial_id == t.id))
    t.status, t.cancelled_at = "cancelled", now()
    # Cancelled at least 2 hours before the start → not used.
    t.counted = bool(v and v.starts_at - now() < timedelta(hours=2))
    if v:
        v.status, v.cancelled_at = "cancelled", now()
        if v.chef_id:
            notify(db, "visit_cancelled", db.get(Chef, v.chef_id).user_id, "Visit cancelled",
                   f"The trial on {v.starts_at.astimezone(IST):%d %b %H:%M} was cancelled by the customer.", "/chef/jobs")
    me = Actor.of(customer)
    if t.number == 1:
        frm = r.stage
        r.closed_reason = "Customer cancelled trial"
        r.stage, r.closed_at = "closed", now()
        db.add(BoardMove(request_id=r.id, from_stage=frm, to_stage="closed", actor_id=customer.id, actor_kind="customer",
                         note="Customer cancelled trial 1"))
    else:
        move(db, r, board.Stage.TRIAL1_AWAITING, "customer_cancel", me, "Customer cancelled trial 2")
        first = db.scalar(select(Trial).where(Trial.request_id == r.id, Trial.number == 1))
        first.decision, first.decided_at = None, None  # back to deciding after trial 1
    notify_admins(db, "trial_cancelled", "Trial cancelled", f"Customer cancelled trial {t.number}.", f"/admin/request/{r.id}")
    db.commit()
    return t


def admin_move(db: Session, actor: Actor, request_id: int, to: str, note: str | None) -> ServiceRequest:
    """C5 board API: drags are validated against the transition table. Only closing moves are manual."""
    r = db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id).with_for_update())
    if not r:
        raise not_found("Request")
    try:
        target = board.Stage(to)
    except ValueError:
        raise AppError("BOARD_UNKNOWN_STAGE", "Unknown board column.", 422) from None
    if (board.Stage(r.stage), target) not in board.MANUAL_ADMIN_MOVES:
        try:
            board.check(board.Stage(r.stage), target, "admin")
        except board.InvalidMove as e:
            raise AppError(e.code, str(e), 409) from None
        raise AppError("BOARD_USE_ACTION", "Use the assign / push action for this move.", 409)
    move(db, r, target, "admin", actor, note)
    r.closed_reason = note or "Closed by admin"
    for v in db.scalars(select(Visit).where(Visit.request_id == r.id, Visit.status.in_(("pending_assignment", "needs_manual_assignment", "scheduled")))):
        v.status, v.cancelled_at = "cancelled", now()
    for t in db.scalars(select(Trial).where(Trial.request_id == r.id, Trial.status.in_(("requested", "pending_assignment", "scheduled")))):
        t.status, t.cancelled_at = "cancelled", now()
    audit(db, actor, "Board move", f"Request {r.id} → {to}", reason=note)
    db.commit()
    return r
