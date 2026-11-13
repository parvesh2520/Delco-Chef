from datetime import date

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import Principal, approved_chef, current, current_chef
from app.api.schemas import ChefApplicationIn, ChefPatchIn, DaysIn, RespondIn
from app.core.database import get_db
from app.core import clock
from app.core.errors import AppError, not_found
from app.core.security import constant_eq
from app.models import Assignment, AttendanceRecord, Chef, Notification, Visit
from app.services import accounts, bookings, payouts
from app.services import settings as settings_svc
from app.services.presenters import assignment_json, chef_json, iso

router = APIRouter(tags=["Chef"])


@router.get("/chefs/me")
def me(chef: Chef = Depends(current_chef), db: Session = Depends(get_db)):
    return chef_json(db, chef, "chef")


@router.patch("/chefs/me")
def patch_me(body: ChefPatchIn, chef: Chef = Depends(current_chef), db: Session = Depends(get_db)):
    return chef_json(db, accounts.chef_update(db, chef, body.model_dump(exclude_unset=True)), "chef")


@router.post("/chefs/me/documents/{doc_type}", status_code=201, summary="Upload a document image (JPEG/PNG ≤5 MB)")
async def upload_document(doc_type: str, file: UploadFile = File(...), chef: Chef = Depends(current_chef), db: Session = Depends(get_db)):
    data = await file.read(5 * 1024 * 1024 + 1)
    d = accounts.upload_document(db, chef, doc_type, data, file.content_type, file.filename)
    return {"id": str(d.id), "type": d.type, "fileName": d.file_name, "status": d.status}


@router.post("/chefs/me/application", summary="Submit the chef application for Super Admin approval")
def submit(body: ChefApplicationIn, chef: Chef = Depends(current_chef), db: Session = Depends(get_db)):
    data = body.model_dump()
    return chef_json(db, accounts.submit_application(db, chef, data), "chef")


@router.get("/chefs/me/off-days")
def get_off_days(chef: Chef = Depends(current_chef), db: Session = Depends(get_db)):
    return accounts.off_days(db, chef)


@router.put("/chefs/me/off-days")
def put_off_days(body: DaysIn, chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    return accounts.save_off_days(db, chef, body.days)


@router.get("/chefs/me/assignments")
def assignments(chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    s = settings_svc.load(db)
    rows = db.scalars(select(Assignment).where(Assignment.chef_id == chef.id, Assignment.action != "declined_by_chef",
                                               Assignment.status.in_(("offered", "accepted", "declined", "expired")))
                      .order_by(Assignment.created_at.desc()).limit(100)).all()
    return [assignment_json(db, a, chef.home_lat, chef.home_lng, s) for a in rows]


@router.get("/chefs/me/assignments/{assignment_id}")
def assignment(assignment_id: int, chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    a = db.scalar(select(Assignment).where(Assignment.id == assignment_id, Assignment.chef_id == chef.id))
    if not a:
        raise not_found("Assignment")
    return assignment_json(db, a, chef.home_lat, chef.home_lng, settings_svc.load(db))


@router.post("/assignments/{assignment_id}/respond", summary="Chef accepts or declines (decline → back to admin queue)")
def respond(assignment_id: int, body: RespondIn, chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    a = bookings.respond(db, chef, assignment_id, body.accept, body.reason)
    return assignment_json(db, a, chef.home_lat, chef.home_lng, settings_svc.load(db))


@router.get("/chefs/me/earnings", summary="Current week's earnings, every booking, and a signed statement link")
def earnings(chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    return payouts.chef_earnings(db, chef)


@router.get("/chefs/statements/{chef_id}", summary="G4: CSV statement via the signed, 10-minute link from /chefs/me/earnings")
def statement(chef_id: int, cycleStart: str, expires: int, sig: str, db: Session = Depends(get_db)):
    try:
        start = date.fromisoformat(cycleStart)
    except ValueError:
        raise AppError("VALIDATION_ERROR", "cycleStart must be a date.", 422) from None
    if expires < int(clock.now().timestamp()) or not constant_eq(sig, payouts.statement_token(chef_id, start, expires)):
        raise AppError("LINK_EXPIRED", "This link has expired. Open Earnings again to get a new one.", 403)
    chef = db.get(Chef, chef_id)
    if not chef:
        raise not_found("Chef")
    body = payouts.statement_csv(payouts.statement(db, chef, start))
    return Response(body, media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="earnings-{start.isoformat()}.csv"', "Cache-Control": "no-store"})


@router.get("/chefs/me/attendance")
def my_attendance(chef: Chef = Depends(approved_chef), db: Session = Depends(get_db)):
    rows = db.execute(select(AttendanceRecord, Visit).join(Visit, Visit.id == AttendanceRecord.visit_id)
                      .where(AttendanceRecord.chef_id == chef.id).order_by(Visit.starts_at.desc()).limit(100)).all()
    return [{"id": str(a.id), "visitId": str(v.id), "date": iso(v.starts_at), "checkInAt": iso(a.check_in_at),
             "checkOutAt": iso(a.check_out_at), "workedMinutes": a.worked_minutes, "status": a.status, "exception": a.exception}
            for a, v in rows]


# ---------------- Notifications (all roles) ----------------
notifications = APIRouter(prefix="/notifications", tags=["Notifications"])


@notifications.get("")
def list_notifications(p: Principal = Depends(current), db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).where(Notification.user_id == p.user.id).order_by(Notification.created_at.desc()).limit(100))
    return [{"id": str(n.id), "title": n.title, "body": n.body, "at": iso(n.created_at), "read": n.read_at is not None,
             "href": n.href, "event": n.event} for n in rows]


@notifications.post("/read-all", status_code=204)
def read_all(p: Principal = Depends(current), db: Session = Depends(get_db)):
    from datetime import datetime, timezone
    db.query(Notification).filter(Notification.user_id == p.user.id, Notification.read_at.is_(None)).update(
        {"read_at": datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()
