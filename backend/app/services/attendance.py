"""Part D: check-in / check-out with geofence, window, GPS quality, single-use code, selfie, idempotency."""
import math
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.core.security import decrypt
from app.domain.geo import haversine_km
from app.models import AttendanceEvent, AttendanceRecord, Chef, Photo, Trial, Visit
from app.services import bookings
from app.services import settings as settings_svc
from app.services.events import Actor, audit, notify, notify_admins
from app.services.storage import storage, validate_image


def _visit_for_chef(db: Session, chef: Chef, visit_id: int, lock: bool = True) -> Visit:
    q = select(Visit).where(Visit.id == visit_id)
    v = db.scalar(q.with_for_update() if lock else q)
    if not v or v.chef_id != chef.id:
        raise not_found("Visit")  # never reveal other chefs' visits
    return v


def _event(db: Session, v: Visit, chef: Chef, kind: str, result: str, pos: dict, dist_m: float | None = None) -> None:
    db.add(AttendanceEvent(visit_id=v.id, chef_id=chef.id, kind=kind, result=result, lat=pos.get("lat"), lng=pos.get("lng"),
                           accuracy_m=pos.get("accuracy"), distance_m=dist_m, device_id=(pos.get("deviceId") or "")[:120] or None,
                           at=clock.now()))


def _fail(db: Session, v: Visit, chef: Chef, kind: str, pos: dict, err: AppError, dist: float | None = None) -> AppError:
    _event(db, v, chef, kind, err.code, pos, dist)
    db.commit()  # the audit event (and attempt counter) persist even though the call is refused
    return err


def upload_photo(db: Session, chef: Chef, visit_id: int, kind: str, data: bytes, content_type: str | None) -> Photo:
    if kind not in ("check_in_selfie", "check_out_selfie", "food"):
        raise AppError("PHOTO_INVALID_KIND", "Unknown photo kind.", 422)
    v = _visit_for_chef(db, chef, visit_id, lock=False)
    ctype, sha = validate_image(data, content_type)
    reused = db.scalar(select(Photo.id).where(Photo.sha256 == sha, Photo.chef_id == chef.id))
    if reused:
        raise AppError("PHOTO_REUSED", "This photo was already used. Take a new photo.", 422)
    key = storage.put(f"visits/{v.id}", data, "png" if ctype == "image/png" else "jpg")
    p = Photo(visit_id=v.id, chef_id=chef.id, kind=kind, storage_key=key, content_type=ctype, size_bytes=len(data), sha256=sha)
    db.add(p)
    db.commit()
    return p


def _number(value) -> float | None:
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None  # "nan" / "inf" would slip past every comparison below


def _check_position(db: Session, v: Visit, chef: Chef, kind: str, pos: dict, s) -> float:
    lat, lng = _number(pos.get("lat")), _number(pos.get("lng"))
    if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180) or (lat == 0 and lng == 0):
        raise _fail(db, v, chef, kind, pos, AppError("LOCATION_REQUIRED", "Location is required. Turn on location and retry.", 422))
    acc = _number(pos.get("accuracy"))
    if acc is None or acc < 0:  # a reading without a reported accuracy can't be trusted: ask for a fresh fix
        raise _fail(db, v, chef, kind, pos, AppError("GPS_ACCURACY_POOR", "Your phone did not report GPS accuracy. Wait for a GPS fix and retry.",
                                                     422, extra={"retry": True}))
    if acc > s.float("max_gps_accuracy_m"):
        raise _fail(db, v, chef, kind, pos, AppError("GPS_ACCURACY_POOR", f"GPS signal is weak (±{acc:.0f} m). Move to an open spot and retry.", 422,
                                                     extra={"retry": True}))
    dist = haversine_km(lat, lng, v.lat, v.lng) * 1000
    if dist > s.float("checkin_radius_m"):
        raise _fail(db, v, chef, kind, pos, AppError("CHECKIN_TOO_FAR", f"You are {dist:.0f} m from the customer's address. "
                                                     f"Check-in works within {s.int('checkin_radius_m')} m.", 422, extra={"distanceM": round(dist)}), dist)
    return dist


def _check_window(db: Session, v: Visit, chef: Chef, kind: str, pos: dict, s) -> None:
    t, w = clock.now(), timedelta(minutes=s.int("checkin_window_min"))
    if t < v.starts_at - w:
        raise _fail(db, v, chef, kind, pos, AppError("CHECKIN_TOO_EARLY", f"Check-in opens {s.int('checkin_window_min')} minutes before the visit.", 422))
    if t > v.starts_at + w:
        raise _fail(db, v, chef, kind, pos, AppError("CHECKIN_TOO_LATE", "The check-in window has closed. Contact the Delco team.", 422))


def _check_code(db: Session, v: Visit, chef: Chef, kind: str, pos: dict, code: str, s) -> None:
    max_attempts = s.int("max_code_attempts")
    if v.code_attempts >= max_attempts:
        raise _fail(db, v, chef, kind, pos, AppError("CHECKIN_LOCKED", "Check-in is locked after too many wrong codes. The Delco team has been alerted.", 423))
    if v.code_used_at:
        raise _fail(db, v, chef, kind, pos, AppError("CHECKIN_CODE_USED", "This code has already been used.", 409))
    if not code or decrypt(v.check_in_code_enc) != code.strip():
        v.code_attempts += 1
        left = max_attempts - v.code_attempts
        if left <= 0:
            # The Admin must see the lock in the review list, not only as a notification: record it as an exception.
            rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == v.id))
            if rec is None:
                rec = AttendanceRecord(visit_id=v.id, chef_id=chef.id)
                db.add(rec)
            rec.status, rec.exception = "exception", "code_locked"
            db.flush()
            notify_admins(db, "attendance_exception", "Check-in locked", f"Visit {v.id}: too many wrong check-in codes.",
                          f"/admin/attendance/{rec.id}")
        raise _fail(db, v, chef, kind, pos, AppError("CHECKIN_CODE_INVALID", f"Code does not match. {max(left, 0)} tries left.", 422,
                                                     extra={"attemptsRemaining": max(left, 0)}))


def verify_code(db: Session, chef: Chef, visit_id: int, code: str) -> dict:
    """Optional pre-check used by the code screen. Counts wrong attempts; does not consume the code."""
    s = settings_svc.load(db)
    v = _visit_for_chef(db, chef, visit_id)
    _check_window(db, v, chef, "verify_code", {}, s)
    _check_code(db, v, chef, "verify_code", {}, code, s)
    _event(db, v, chef, "verify_code", "OK", {})
    db.commit()
    return {"valid": True}


def _record_json(r: AttendanceRecord) -> dict:
    return {"id": str(r.id), "visitId": str(r.visit_id), "checkInAt": r.check_in_at.isoformat() if r.check_in_at else None,
            "checkOutAt": r.check_out_at.isoformat() if r.check_out_at else None, "workedMinutes": r.worked_minutes,
            "status": r.status, "exception": r.exception, "checkInDistanceM": r.check_in_distance_m}


def check_in(db: Session, chef: Chef, visit_id: int, body: dict) -> dict:
    s = settings_svc.load(db)
    v = _visit_for_chef(db, chef, visit_id)
    existing = db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == v.id))
    if existing and existing.check_in_at:
        return _record_json(existing)  # network retry: same record, no duplicate row
    if v.status not in ("scheduled", "chef_travelling"):
        raise AppError("VISIT_NOT_CHECKINABLE", "This visit is not open for check-in.", 409)
    pos = body
    _check_window(db, v, chef, "check_in", pos, s)
    if v.code_attempts >= s.int("max_code_attempts"):
        raise _fail(db, v, chef, "check_in", pos, AppError("CHECKIN_LOCKED", "Check-in is locked after too many wrong codes.", 423))
    dist = _check_position(db, v, chef, "check_in", pos, s)
    _check_code(db, v, chef, "check_in", pos, str(body.get("code") or ""), s)
    selfie = None
    if body.get("selfiePhotoId"):
        selfie = db.scalar(select(Photo).where(Photo.id == int(body["selfiePhotoId"]), Photo.visit_id == v.id,
                                               Photo.chef_id == chef.id, Photo.kind == "check_in_selfie"))
    if selfie is None:
        raise _fail(db, v, chef, "check_in", pos, AppError("SELFIE_REQUIRED", "A selfie is required to check in.", 422), dist)
    t = clock.now()
    rec = existing or AttendanceRecord(visit_id=v.id, chef_id=chef.id)
    rec.check_in_at, rec.check_in_distance_m, rec.check_in_selfie_id, rec.status = t, round(dist, 1), selfie.id, "open"
    db.add(rec)
    v.status, v.code_used_at, v.travel_stopped_at = "checked_in", t, v.travel_stopped_at or t
    if v.kind == "trial":
        tr = db.get(Trial, v.trial_id)
        tr.status, tr.counted = "in_progress", True  # a trial counts as used at check-in
    _event(db, v, chef, "check_in", "OK", pos, dist)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError("CHEF_ALREADY_CHECKED_IN", "You are still checked in to another visit. Check out first.", 409) from None
    from app.services import tracking
    tracking.forget_visit(v.id)
    return _record_json(rec)


def check_out(db: Session, chef: Chef, visit_id: int, body: dict) -> dict:
    s = settings_svc.load(db)
    v = _visit_for_chef(db, chef, visit_id)
    rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == v.id).with_for_update())
    if not rec or not rec.check_in_at:
        raise _fail(db, v, chef, "check_out", body, AppError("CHECKOUT_BEFORE_CHECKIN", "Check in before checking out.", 409))
    if rec.check_out_at:
        return _record_json(rec)

    def photo(field: str, kind: str):
        pid = body.get(field)
        return db.scalar(select(Photo).where(Photo.id == int(pid), Photo.visit_id == v.id, Photo.chef_id == chef.id,
                                             Photo.kind == kind)) if pid else None
    selfie, food = photo("selfiePhotoId", "check_out_selfie"), photo("foodPhotoId", "food")
    if selfie is None:
        raise _fail(db, v, chef, "check_out", body, AppError("SELFIE_REQUIRED", "A completion selfie is required to check out.", 422))
    if food is None:
        raise _fail(db, v, chef, "check_out", body, AppError("FOOD_PHOTO_REQUIRED", "A photo of the food cooked is required to check out.", 422))
    t = clock.now()
    dist = None  # check-out position is recorded for audit only; an unusable reading is simply not recorded
    lat, lng = _number(body.get("lat")), _number(body.get("lng"))
    if lat is not None and lng is not None and -90 <= lat <= 90 and -180 <= lng <= 180:
        dist = round(haversine_km(lat, lng, v.lat, v.lng) * 1000, 1)
    worked = int((t - rec.check_in_at).total_seconds() // 60)
    scheduled = int((v.ends_at - v.starts_at).total_seconds() // 60)
    rec.check_out_at, rec.check_out_selfie_id, rec.food_photo_id, rec.worked_minutes, rec.check_out_distance_m = t, selfie.id, food.id, worked, dist
    if worked * 2 < scheduled or worked * 2 > scheduled * 3:
        rec.status, rec.exception = "exception", "unusual_duration"
        notify_admins(db, "attendance_exception", "Unusual visit duration", f"Visit {v.id}: worked {worked} of {scheduled} minutes.",
                      f"/admin/attendance/{rec.id}")
    else:
        rec.status = "ok"
    v.status = "completed"
    bookings.on_visit_finished(db, v)
    _event(db, v, chef, "check_out", "OK", body, dist)
    db.commit()
    return _record_json(rec)


def customer_unavailable(db: Session, chef: Chef, visit_id: int, body: dict) -> dict:
    s = settings_svc.load(db)
    v = _visit_for_chef(db, chef, visit_id)
    if v.status not in ("scheduled", "chef_travelling"):
        raise AppError("VISIT_NOT_CHECKINABLE", "This visit is not open.", 409)
    if clock.now() < v.starts_at - timedelta(minutes=s.int("checkin_window_min")):
        raise _fail(db, v, chef, "customer_unavailable", body, AppError("CHECKIN_TOO_EARLY", "You can report this once the check-in window opens.", 422))
    rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == v.id)) or AttendanceRecord(visit_id=v.id, chef_id=chef.id)
    rec.status, rec.exception, rec.resolution = "exception", "customer_unavailable", (body.get("note") or "")[:300] or None
    db.add(rec)
    v.status = "customer_unavailable"
    bookings.on_visit_finished(db, v)  # a trial counts as used when the customer isn't there
    _event(db, v, chef, "customer_unavailable", "OK", body)
    notify_admins(db, "attendance_exception", "Customer unavailable", f"Chef reported the customer unavailable for visit {v.id}.", "/admin/attendance")
    notify(db, "customer_unavailable", v.customer_id, "We missed you", "Your chef arrived but couldn't reach you.", f"/customer/visit/{v.id}")
    db.commit()
    return _record_json(rec)


def auto_close(db: Session) -> int:
    """D4: forgotten check-outs → NEEDS_REVIEW with worked time up to the scheduled end. Never-started visits → missed.
    SKIP LOCKED makes this safe on several instances at once."""
    s = settings_svc.load(db)
    cutoff = clock.now() - timedelta(minutes=s.int("auto_close_after_min"))
    n = 0
    for v in db.scalars(select(Visit).where(Visit.status == "checked_in", Visit.ends_at < cutoff).with_for_update(skip_locked=True)):
        rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == v.id))
        rec.check_out_at = v.ends_at
        rec.worked_minutes = max(0, int((v.ends_at - rec.check_in_at).total_seconds() // 60))
        rec.status, rec.exception = "needs_review", "missing_check_out"
        v.status = "completed"
        bookings.on_visit_finished(db, v)
        notify_admins(db, "attendance_exception", "Missing check-out", f"Visit {v.id} was closed automatically.", f"/admin/attendance/{rec.id}")
        n += 1
    from app.services import subscriptions
    for v in db.scalars(select(Visit).where(Visit.status.in_(("scheduled", "chef_travelling")), Visit.ends_at < cutoff)
                        .with_for_update(skip_locked=True)):
        rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == v.id))
        if rec is None and v.chef_id:
            db.add(AttendanceRecord(visit_id=v.id, chef_id=v.chef_id, status="exception", exception="missed_visit"))
        if v.kind == "subscription":
            subscriptions.mark_missed(db, v, "Chef did not check in")
        else:
            # Trial no-show by the chef: the trial isn't used; move it to the next day for the admin to reassign.
            db.get(Trial, v.trial_id).status = "pending_assignment"
            v.chef_id, v.status, v.check_in_code_enc, v.code_attempts = None, "needs_manual_assignment", None, 0
            v.starts_at += timedelta(days=1)
            v.ends_at += timedelta(days=1)
            v.service_date += timedelta(days=1)
        notify_admins(db, "attendance_exception", "Visit missed", f"No check-in for visit {v.id}.", "/admin/attendance")
        n += 1
    db.commit()
    return n


DECISION_PREFIX = {"approve": "Approved: ", "reject": "Rejected: "}


def decision_of(rec: AttendanceRecord) -> str | None:
    """The review decision, written as the prefix of the resolution note (older records have none)."""
    if rec.status != "resolved":
        return None
    for decision, prefix in DECISION_PREFIX.items():
        if (rec.resolution or "").startswith(prefix):
            return {"approve": "approved", "reject": "rejected"}[decision]
    return "approved"  # resolved before decisions existed: those were approvals


def resolve(db: Session, actor: Actor, record_id: int, resolution: str, worked_minutes: int | None,
            decision: str = "approve") -> AttendanceRecord:
    """D5: an Admin approves (optionally correcting worked minutes) or rejects (reason required; the visit then counts
    0 worked minutes, so it is not paid). Who, when, what changed and why are kept on the record and in the audit log.
    A decided record is final: a second decision is refused, so the history can't be overwritten silently."""
    rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.id == record_id).with_for_update())
    if not rec:
        raise not_found("Attendance record")
    if decision not in DECISION_PREFIX:
        raise AppError("VALIDATION_ERROR", "Decision must be approve or reject.", 422, fields={"decision": "invalid"})
    if rec.status == "resolved":
        raise AppError("ATTENDANCE_ALREADY_REVIEWED", "This record has already been reviewed.", 409)
    if rec.status not in ("needs_review", "exception"):
        raise AppError("ATTENDANCE_NOT_REVIEWABLE", "Only records that need review can be approved or rejected.", 409)
    note = (resolution or "").strip()
    if len(note) < (5 if decision == "reject" else 1):
        raise AppError("VALIDATION_ERROR", "A reason is required." if decision == "reject" else "A resolution note is required.", 422,
                       fields={"resolution": "required"})
    before = rec.worked_minutes
    if decision == "reject":
        worked_minutes = 0 if rec.check_in_at else None  # rejected: nothing worked counts towards pay
    if worked_minutes is not None:
        if not 0 <= worked_minutes <= 600:
            raise AppError("VALIDATION_ERROR", "Worked minutes must be between 0 and 600.", 422)
        rec.worked_minutes = worked_minutes
    rec.status, rec.resolved_by, rec.resolved_at = "resolved", actor.id, clock.now()
    rec.resolution = (DECISION_PREFIX[decision] + note)[:300]
    audit(db, actor, "Approved attendance" if decision == "approve" else "Rejected attendance", f"Attendance {rec.id}", reason=note,
          meta={"decision": decision, "exception": rec.exception, "worked_minutes_before": before, "worked_minutes_after": rec.worked_minutes})
    db.commit()
    return rec
