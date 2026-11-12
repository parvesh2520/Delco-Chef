"""Customer app: profile, addresses, catalogue, requests, trials, subscriptions, privacy."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import Principal, customer_only
from app.api.schemas import (AddressIn, ConsentIn, DaysIn, DecisionIn, ProfileIn, ReasonIn, RequestIn)
from app.core.database import get_db
from app.core.errors import AppError, not_found
from app.models import DataExport, ServiceRequest, Subscription, Trial
from app.services import accounts, bookings, payments, privacy, subscriptions
from app.services import settings as settings_svc
from app.services.presenters import Prefetch, address_json, request_json, subscription_json, trial_json
from app.services.storage import storage

router = APIRouter(tags=["Customer"])
SERVICES = [
    {"type": "monthly_subscription", "name": "Monthly Subscription", "group": "subscription", "tagline": "The Delco favourite",
     "description": "A 28-day cycle with 26 guaranteed service days. A verified chef cooks in your kitchen at your chosen slot.",
     "available": True, "priceUnit": "per cycle",
     "highlights": ["28-day cycle, 26 guaranteed service days", "Morning, Evening or Both", "Up to 2 free trials", "2 flexible off-days per cycle"]},
    {"type": "custom_time", "name": "Custom Time", "group": "subscription", "tagline": "Flexible, shorter stints",
     "description": "Choose your start and end dates (7 to 90 days), the weekdays and the slot. Priced per visit.",
     "available": True, "priceUnit": "per visit",
     "highlights": ["7 to 90 days", "Pick your weekdays", "Up to 2 free trials"]},
    {"type": "home_food", "name": "Home Food", "group": "one_time", "tagline": "Coming soon",
     "description": "A single one-hour visit for 1 to 7 people.", "available": False, "highlights": []},
    {"type": "party_mode", "name": "Party Mode", "group": "one_time", "tagline": "Coming soon",
     "description": "An event-style visit for more than 7 people.", "available": False, "highlights": []},
]


def _catalogue(db: Session, user_id: int | None) -> list[dict]:
    s = settings_svc.load(db)
    rate = s.int("rate_paise_per_person_hour")
    out = []
    interested = accounts.interested_services(db, user_id) if user_id else set()
    for svc in SERVICES:
        item = dict(svc)
        if not svc["available"]:
            item["interested"] = svc["type"] in interested
        else:
            item["priceFrom"] = rate / 100  # one person, one visit
            item["priceUnit"] = "per person per visit"
            if user_id:
                item["eligibility"] = bookings.eligibility(db, user_id, svc["type"])
        out.append(item)
    return out


@router.get("/services", summary="Service catalogue with this customer's trial status per service")
def list_services(p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return _catalogue(db, p.user.id)


@router.get("/services/{service}")
def get_service(service: str, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    item = next((x for x in _catalogue(db, p.user.id) if x["type"] == service), None)
    if not item:
        raise not_found("Service")
    return item


@router.post("/services/{service}/interest", summary="'Notify me' for a coming-soon service")
def interest(service: str, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return accounts.register_interest(db, p.user, service)


@router.get("/config", summary="Public, non-secret settings the app needs (slots, limits)")
def config(db: Session = Depends(get_db)):
    s = settings_svc.load(db)
    return {"slots": settings_svc.slot_options(s), "maxFreeTrials": s.int("max_free_trials"), "trialMaxPeople": s.int("trial_max_people"),
            "ratePerPersonPerVisit": s.int("rate_paise_per_person_hour") * s.int("visit_minutes") // 60 / 100,
            "trackingPollSec": s.int("ping_interval_s"), "staleAfterSec": s.int("stale_after_s"),
            "trackingWindowMin": s.int("tracking_window_min"), "customDays": {"min": 7, "max": 90}, "maxAddresses": accounts.MAX_ADDRESSES,
            "languages": [{"value": k, "label": v} for k, v in accounts.LANGUAGES.items()]}


# ---------------- Profile ----------------
@router.get("/customers/me")
def get_me(p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return accounts.profile_json(db, p.user)


@router.patch("/customers/me")
def patch_me(body: ProfileIn, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return accounts.update_profile(db, p.user, body.model_dump(exclude_unset=True))


@router.post("/customers/me/consent", summary="Record terms + location consent with version and timestamp")
def consent(body: ConsentIn, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return accounts.accept_consent(db, p.user, list(body.kinds))


@router.post("/customers/me/onboarding/complete")
def onboarding_complete(p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return accounts.complete_onboarding(db, p.user)


@router.delete("/customers/me", status_code=204, summary="Delete my account (anonymises personal data)")
def delete_me(body: ReasonIn, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    privacy.delete_account(db, p.user, body.reason)


# ---------------- Addresses ----------------
@router.get("/customers/me/addresses")
def list_addresses(p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return [address_json(a) for a in accounts.list_addresses(db, p.user)]


@router.get("/customers/me/addresses/{address_id}")
def get_address(address_id: int, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return address_json(accounts.get_address(db, p.user, address_id))


@router.post("/customers/me/addresses", status_code=201)
def create_address(body: AddressIn, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return address_json(accounts.save_address(db, p.user, body.model_dump()))


@router.put("/customers/me/addresses/{address_id}")
def update_address(address_id: int, body: AddressIn, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return address_json(accounts.save_address(db, p.user, body.model_dump(), address_id))


@router.delete("/customers/me/addresses/{address_id}", status_code=204)
def delete_address(address_id: int, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    accounts.delete_address(db, p.user, address_id)


# ---------------- Requests & trials ----------------
@router.get("/customers/me/eligibility/{service}")
def eligibility(service: str, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    bookings.ensure_bookable(service)
    return bookings.eligibility(db, p.user.id, service)


@router.post("/requests", status_code=201, summary="Create a trial request (or subscribe directly after a completed trial)")
def create_request(body: RequestIn, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    data = body.model_dump()
    data.pop("amount", None)  # never trust a client amount
    r = bookings.create_request(db, p.user, body.service, data)
    s = settings_svc.load(db)
    return request_json(db, r, s, "customer", max_trials=s.int("max_free_trials"))


@router.get("/requests")
def my_requests(p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    s = settings_svc.load(db)
    rows = db.scalars(select(ServiceRequest).where(ServiceRequest.customer_id == p.user.id).order_by(ServiceRequest.created_at.desc())).all()
    pf = Prefetch(db, rows, customer=p.user)
    return [request_json(db, r, s, "customer", max_trials=s.int("max_free_trials"), pf=pf) for r in rows]


@router.get("/requests/{request_id}")
def get_request(request_id: int, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    r = db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id, ServiceRequest.customer_id == p.user.id))
    if not r:
        raise not_found("Request")
    s = settings_svc.load(db)
    return request_json(db, r, s, "customer", max_trials=s.int("max_free_trials"))


@router.get("/customers/me/history", summary="Booking history, keyset-paginated (20 per page)")
def history(limit: int = Query(20, ge=1, le=50), cursor: str | None = None, p: Principal = Depends(customer_only),
            db: Session = Depends(get_db)):
    q = select(ServiceRequest).where(ServiceRequest.customer_id == p.user.id)
    if cursor:
        ts, rid = cursor.split("_")
        q = q.where((ServiceRequest.created_at, ServiceRequest.id) < (datetime.fromisoformat(ts), int(rid)))
    rows = db.scalars(q.order_by(ServiceRequest.created_at.desc(), ServiceRequest.id.desc()).limit(limit + 1)).all()
    from app.services.presenters import request_status
    page = rows[:limit]
    subs = {x.request_id: x for x in db.scalars(select(Subscription).where(Subscription.request_id.in_([r.id for r in page])))}
    items = []
    for r in page:
        sub = subs.get(r.id)
        title = ("Monthly Subscription" if r.service == "monthly_subscription" else "Custom Time")
        if sub:
            items.append({"id": str(sub.id), "kind": "subscription", "requestId": str(r.id), "service": r.service,
                          "title": f"{title} subscription", "status": sub.status, "date": sub.start_date.isoformat(),
                          "amount": sub.amount_paise / 100})
        else:
            items.append({"id": str(r.id), "kind": "request", "service": r.service, "title": f"{title} request",
                          "status": request_status(r), "date": r.created_at.isoformat()})
    nxt = f"{rows[limit - 1].created_at.isoformat()}_{rows[limit - 1].id}" if len(rows) > limit else None
    return {"items": items, "nextCursor": nxt}


@router.get("/trials")
def my_trials(p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    s = settings_svc.load(db)
    rows = db.scalars(select(Trial).where(Trial.customer_id == p.user.id).order_by(Trial.created_at.desc())).all()
    pf = Prefetch.for_trials(db, rows)
    return [trial_json(db, t, s, s.int("max_free_trials"), pf) for t in rows]


@router.get("/trials/{trial_id}")
def get_trial(trial_id: int, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    t = db.scalar(select(Trial).where(Trial.id == trial_id, Trial.customer_id == p.user.id))
    if not t:
        raise not_found("Trial")
    s = settings_svc.load(db)
    r = db.get(ServiceRequest, t.request_id)
    return {"trial": trial_json(db, t, s, s.int("max_free_trials")), "request": request_json(db, r, s, "customer", max_trials=s.int("max_free_trials"))}


@router.post("/trials/{trial_id}/decision", summary="Subscribe / another trial / reject — only the allowed choices")
def decide(trial_id: int, body: DecisionIn, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return bookings.decide(db, p.user, trial_id, body.decision, body.model_dump())


@router.post("/trials/{trial_id}/cancel", summary="Cancel a trial (≥2h before start: not counted as used)")
def cancel_trial(trial_id: int, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    t = bookings.cancel_trial(db, p.user, trial_id)
    s = settings_svc.load(db)
    return trial_json(db, t, s, s.int("max_free_trials"))


# ---------------- Subscriptions ----------------
def _own_sub(db: Session, p: Principal, sub_id: int) -> Subscription:
    sub = db.scalar(select(Subscription).where(Subscription.id == sub_id, Subscription.customer_id == p.user.id))
    if not sub:
        raise not_found("Subscription")
    return sub


@router.get("/subscriptions")
def my_subscriptions(p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    s = settings_svc.load(db)
    return [subscription_json(db, x, s) for x in db.scalars(select(Subscription).where(Subscription.customer_id == p.user.id)
                                                             .order_by(Subscription.created_at.desc()))]


@router.get("/subscriptions/{sub_id}")
def get_subscription(sub_id: int, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return subscription_json(db, _own_sub(db, p, sub_id), settings_svc.load(db))


@router.get("/subscriptions/{sub_id}/schedule", summary="Service dates, visits, forfeited days, extensions, end date (C7)")
def schedule(sub_id: int, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return subscriptions.schedule_json(db, _own_sub(db, p, sub_id))


@router.put("/subscriptions/{sub_id}/off-days")
def off_days(sub_id: int, body: DaysIn, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    sub = subscriptions.save_off_days(db, p.user, sub_id, body.days)
    return subscription_json(db, sub, settings_svc.load(db))


@router.get("/subscriptions/{sub_id}/cancel-preview", summary="Refund the customer would get if they cancelled now (F5)")
def cancel_preview(sub_id: int, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return payments.cancellation_preview(db, p.user, sub_id)


@router.post("/subscriptions/{sub_id}/cancel", summary="Cancel; refund per the 2-hour rule (F5)")
def cancel_subscription(sub_id: int, body: ReasonIn, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return payments.cancel_subscription(db, p.user, sub_id, body.reason)


# ---------------- Privacy ----------------
@router.get("/privacy/export")
def get_export(p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    e = db.scalar(select(DataExport).where(DataExport.user_id == p.user.id).order_by(DataExport.id.desc()).limit(1))
    return privacy.export_json(e)


@router.post("/privacy/export", status_code=202, summary="Request 'Download my data' (built in the background)")
def request_export(p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return privacy.export_json(privacy.request_export(db, p.user))


@router.get("/privacy/exports/{export_id}/download", summary="Download via the signed, 10-minute URL from GET /privacy/export")
def download_export(export_id: int, expires: int, sig: str, db: Session = Depends(get_db)):
    from app.core.security import constant_eq
    if expires < int(datetime.now().timestamp()) or not constant_eq(sig, privacy.download_token(export_id, expires)):
        raise AppError("EXPORT_LINK_INVALID", "This download link has expired. Open Download my data again.", 403)
    e = db.get(DataExport, export_id)
    if not e or e.status != "ready" or not e.storage_key or (e.expires_at and e.expires_at < datetime.now(e.expires_at.tzinfo)):
        raise AppError("EXPORT_NOT_READY", "Your export is not ready yet.", 409)
    return Response(storage.get(e.storage_key), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="delco-my-data-{e.id}.json"'})
