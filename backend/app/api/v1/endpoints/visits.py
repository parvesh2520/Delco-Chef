"""Visits for customers and chefs, chef visit actions (travel, location, check-in/out), tracking, photos."""
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import ADMIN_ROLES, Principal, approved_chef, approved_chef_id, current
from app.api.schemas import CheckInIn, CheckOutIn, CodeIn, PointsIn, UnavailableIn
from app.core.database import SessionLocal, get_db
from app.core.errors import AppError, not_found
from app.models import Chef, Photo, Visit
from app.services import attendance, tracking
from app.services.presenters import visit_json

router = APIRouter(tags=["Visits"])


@router.get("/visits", summary="Customer: my visits. Chef: my assigned visits.")
def list_visits(scope: str = "upcoming", p: Principal = Depends(current), db: Session = Depends(get_db)):
    q = select(Visit).where(Visit.status != "cancelled")
    if p.user.role == "customer":
        q = q.where(Visit.customer_id == p.user.id)
    elif p.user.role == "chef":
        chef = db.scalar(select(Chef).where(Chef.user_id == p.user.id))
        q = q.where(Visit.chef_id == (chef.id if chef else -1))
    else:
        return []
    order = Visit.starts_at.desc() if scope == "past" else Visit.starts_at
    if scope == "upcoming":
        q = q.where(Visit.status.in_(("pending_assignment", "needs_manual_assignment", "scheduled", "chef_travelling", "checked_in")))
    elif scope == "past":
        q = q.where(Visit.status.in_(("completed", "customer_unavailable", "missed")))
    return [visit_json(db, v, p.user.role) for v in db.scalars(q.order_by(order).limit(100))]


@router.get("/visits/{visit_id}")
def get_visit(visit_id: int, p: Principal = Depends(current), db: Session = Depends(get_db)):
    v = db.get(Visit, visit_id)
    if not v:
        raise not_found("Visit")
    if p.user.role == "customer" and v.customer_id != p.user.id:
        raise not_found("Visit")
    if p.user.role == "chef":
        chef = db.scalar(select(Chef).where(Chef.user_id == p.user.id))
        if not chef or v.chef_id != chef.id:
            raise not_found("Visit")
    return visit_json(db, v, p.user.role)


# The two Part E hot paths (customer poll, chef ingest) authenticate, work and release the database connection inside ONE
# threadpool call. With sync `Depends(get_db)` dependencies FastAPI runs the dependency and the endpoint as separate
# threadpool tasks, so under a burst a request can hold a pooled connection while waiting for a free thread that is
# itself waiting for a connection; measured at 200 req/s this stalled the server until the 30 s pool timeout.
@router.get("/visits/{visit_id}/tracking", summary="Live chef location (own booking, inside the window only)")
def track(visit_id: int, request: Request):
    with SessionLocal() as db:
        p = current(request, db)
        if p.user.role != "customer":
            raise AppError("FORBIDDEN", "You do not have access to this.", 403)
        return tracking.snapshot(db, p.user.id, visit_id)


@router.get("/visits/{visit_id}/customer", summary="Chef: customer's full address & phone, only 2h before start → 2h after end")
def customer_contact(visit_id: int, chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    from app.core import clock
    from app.models import Address, User
    from app.services.presenters import address_json, chef_contact_open, phone_of
    v = db.get(Visit, visit_id)
    if not v or v.chef_id != chef.id or v.status in ("cancelled", "missed"):
        raise not_found("Visit")
    if not chef_contact_open(v, clock.now()):
        raise AppError("CONTACT_NOT_AVAILABLE", "Customer address and phone are shown from 2 hours before the visit.", 403)
    u = db.get(User, v.customer_id)
    return {"name": u.full_name, "phone": phone_of(u), "address": address_json(db.get(Address, v.address_id))}


# ---------------- Chef actions ----------------
@router.post("/visits/{visit_id}/travel/start")
def start_travel(visit_id: int, chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    return visit_json(db, tracking.start_travel(db, chef.id, visit_id), "chef")


@router.post("/visits/{visit_id}/travel/stop")
def stop_travel(visit_id: int, chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    return visit_json(db, tracking.stop_travel(db, chef.id, visit_id), "chef")


@router.post("/visits/{visit_id}/location", summary="Ingest location points (batched, buffered). Invalid or duplicate points are counted as rejected.")
def ingest(visit_id: int, body: PointsIn, request: Request):
    with SessionLocal() as db:  # one threadpool call; see the note above track()
        return tracking.ingest(db, approved_chef_id(request, db), visit_id, [x.model_dump() for x in body.points])


@router.post("/visits/{visit_id}/photos", status_code=201, summary="Upload a JPEG/PNG ≤5 MB (stored outside the database)")
async def upload_photo(visit_id: int, kind: str = Form(...), file: UploadFile = File(...), chef: Chef = Depends(approved_chef),
                       db: Session = Depends(get_db)):
    data = await file.read(5 * 1024 * 1024 + 1)
    ph = attendance.upload_photo(db, chef, visit_id, kind, data, file.content_type)
    return {"id": str(ph.id), "kind": ph.kind}


@router.post("/visits/{visit_id}/check-in/verify-code")
def verify_code(visit_id: int, body: CodeIn, chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    return attendance.verify_code(db, chef, visit_id, body.code)


@router.post("/visits/{visit_id}/check-in", summary="Check in: window, GPS accuracy, 200 m geofence, code, selfie. Idempotent.")
def check_in(visit_id: int, body: CheckInIn, chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    return attendance.check_in(db, chef, visit_id, body.model_dump())


@router.post("/visits/{visit_id}/check-out", summary="Check out with completion selfie + food photo. Idempotent.")
def check_out(visit_id: int, body: CheckOutIn, chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    return attendance.check_out(db, chef, visit_id, body.model_dump())


@router.post("/visits/{visit_id}/customer-unavailable")
def unavailable(visit_id: int, body: UnavailableIn, chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    return attendance.customer_unavailable(db, chef, visit_id, body.model_dump())


@router.get("/media/photos/{photo_id}", summary="Photo bytes: the chef who took it, or an admin")
def get_photo(photo_id: int, p: Principal = Depends(current), db: Session = Depends(get_db)):
    ph = db.get(Photo, photo_id)
    if not ph:
        raise not_found("Photo")
    allowed = p.user.role in ADMIN_ROLES
    if p.user.role == "chef":
        chef = db.scalar(select(Chef).where(Chef.user_id == p.user.id))
        allowed = bool(chef and ph.chef_id == chef.id)
    if not allowed:
        raise not_found("Photo")
    from app.services.storage import storage
    return Response(storage.get(ph.storage_key), media_type=ph.content_type, headers={"Cache-Control": "private, max-age=300"})
