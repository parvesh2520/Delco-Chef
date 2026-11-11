"""Part E: live tracking.

Ingest is cheap: ownership is cached for 30 s, points go to an in-memory buffer, and a background flusher writes them
to location_points in batches (E5) and upserts chef_last_locations. Customers poll every 5 s (E4) — at 1,000 chefs
× 1 update / 5 s that is 200 writes/s absorbed by the buffer and ~1 batched INSERT per flush.
Limit: the buffer is per process. With several instances, put it in Redis (same interface) — see design note.
"""
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.domain.geo import eta_minutes, haversine_km
from app.models import ChefLastLocation, LocationPoint, Visit
from app.services import settings as settings_svc


@dataclass
class Point:
    visit_id: int
    chef_id: int
    lat: float
    lng: float
    accuracy: float | None
    recorded_at: datetime


_lock = threading.Lock()
_buffer: list[Point] = []
_last: dict[int, Point] = {}  # visit_id -> latest point (live view)
_owner: dict[int, tuple[int, str, float]] = {}  # visit_id -> (chef_id, status, cached_until)


def forget_visit(visit_id: int) -> None:
    with _lock:
        _owner.pop(visit_id, None)
        _last.pop(visit_id, None)


def start_travel(db: Session, chef_id: int, visit_id: int) -> Visit:
    v = db.scalar(select(Visit).where(Visit.id == visit_id).with_for_update())
    if not v or v.chef_id != chef_id:
        raise not_found("Visit")
    if v.status == "chef_travelling":
        return v
    if v.status != "scheduled":
        raise AppError("TRAVEL_NOT_ALLOWED", "Travel can only start for a scheduled visit.", 409)
    if v.starts_at - clock.now() > timedelta(hours=3):
        raise AppError("TRAVEL_TOO_EARLY", "You can start travel up to 3 hours before the visit.", 409)
    v.status, v.travel_started_at, v.travel_stopped_at = "chef_travelling", clock.now(), None
    db.commit()
    forget_visit(v.id)
    return v


def stop_travel(db: Session, chef_id: int, visit_id: int) -> Visit:
    v = db.scalar(select(Visit).where(Visit.id == visit_id).with_for_update())
    if not v or v.chef_id != chef_id:
        raise not_found("Visit")
    if v.status == "chef_travelling":
        v.status, v.travel_stopped_at = "scheduled", clock.now()
        db.commit()
    forget_visit(v.id)
    return v


def ingest(db: Session, chef_id: int, visit_id: int, points: list[dict]) -> int:
    """E2: validates the sender is the chef assigned to an active (travelling) booking, then buffers."""
    t = time.monotonic()
    with _lock:
        cached = _owner.get(visit_id)
    if not cached or cached[2] < t:
        row = db.execute(select(Visit.chef_id, Visit.status).where(Visit.id == visit_id)).first()
        cached = (row[0], row[1], t + 30) if row else (0, "missing", t + 30)
        with _lock:
            _owner[visit_id] = cached
    if cached[0] != chef_id:
        raise not_found("Visit")
    if cached[1] != "chef_travelling":
        raise AppError("TRACKING_NOT_ACTIVE", "Start travel before sharing location.", 409)
    now = clock.now()
    accepted = []
    for p in points[-60:]:  # an offline queue sends its backlog; keep the newest 60 (5 minutes)
        try:
            lat, lng = float(p["lat"]), float(p["lng"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            continue
        rec = p.get("recordedAt")
        try:
            at = datetime.fromisoformat(rec.replace("Z", "+00:00")) if rec else now
        except (AttributeError, ValueError):
            at = now
        accepted.append(Point(visit_id, chef_id, lat, lng, p.get("accuracy"), min(at, now)))
    if accepted:
        latest = max(accepted, key=lambda x: x.recorded_at)
        with _lock:
            _buffer.extend(accepted)
            cur = _last.get(visit_id)
            if not cur or cur.recorded_at <= latest.recorded_at:
                _last[visit_id] = latest
    return len(accepted)


def flush(db: Session) -> int:
    with _lock:
        batch, _buffer[:] = list(_buffer), []
        latest = dict(_last)
    if not batch:
        return 0
    db.execute(insert(LocationPoint), [{"visit_id": p.visit_id, "chef_id": p.chef_id, "lat": p.lat, "lng": p.lng,
                                         "accuracy_m": p.accuracy, "recorded_at": p.recorded_at} for p in batch])
    by_chef: dict[int, Point] = {}
    for p in latest.values():
        if p.chef_id not in by_chef or by_chef[p.chef_id].recorded_at < p.recorded_at:
            by_chef[p.chef_id] = p
    for p in by_chef.values():
        stmt = insert(ChefLastLocation).values(chef_id=p.chef_id, visit_id=p.visit_id, lat=p.lat, lng=p.lng,
                                               accuracy_m=p.accuracy, recorded_at=p.recorded_at)
        db.execute(stmt.on_conflict_do_update(index_elements=["chef_id"], set_={
            "visit_id": stmt.excluded.visit_id, "lat": stmt.excluded.lat, "lng": stmt.excluded.lng,
            "accuracy_m": stmt.excluded.accuracy_m, "recorded_at": stmt.excluded.recorded_at},
            where=ChefLastLocation.recorded_at < stmt.excluded.recorded_at))
    db.commit()
    return len(batch)


def snapshot(db: Session, customer_id: int, visit_id: int) -> dict:
    """E: visible only for the customer's own booking, from 15 min before start until check-in, while travelling."""
    s = settings_svc.load(db)
    v = db.get(Visit, visit_id)
    if not v or v.customer_id != customer_id:
        raise not_found("Visit")
    now = clock.now()
    if v.status in ("checked_in", "completed", "customer_unavailable"):
        raise AppError("TRACKING_ENDED", "Tracking ended when your chef checked in.", 409)
    if v.status in ("cancelled", "missed"):
        raise AppError("TRACKING_ENDED", "This visit is no longer active.", 409)
    window = timedelta(minutes=s.int("tracking_window_min"))
    if now < v.starts_at - window:
        raise AppError("TRACKING_NOT_AVAILABLE_YET", f"Tracking starts {s.int('tracking_window_min')} minutes before your visit.", 409,
                       extra={"availableAt": (v.starts_at - window).isoformat()})
    if v.status != "chef_travelling":
        raise AppError("TRACKING_NOT_STARTED", "Your chef hasn't started travelling yet.", 409)
    with _lock:
        p = _last.get(v.id)
    if p is None:
        row = db.get(ChefLastLocation, v.chef_id)
        if row and row.visit_id == v.id:
            p = Point(v.id, v.chef_id, row.lat, row.lng, row.accuracy_m, row.recorded_at)
    dest = {"lat": v.lat, "lng": v.lng}
    if p is None:
        return {"visitId": str(v.id), "available": True, "stale": True, "reason": "Waiting for your chef's location…",
                "destination": dest, "updatedAt": now.isoformat()}
    dist = haversine_km(p.lat, p.lng, v.lat, v.lng)
    stale = (now - p.recorded_at).total_seconds() > s.int("stale_after_s")
    return {"visitId": str(v.id), "available": True, "stale": stale, "reason": "Reconnecting…" if stale else None,
            "chefLocation": {"lat": p.lat, "lng": p.lng}, "destination": dest, "distanceKm": round(dist, 2),
            "etaMinutes": eta_minutes(dist, s.float("avg_speed_kmh")), "updatedAt": p.recorded_at.isoformat(),
            "pollIntervalSec": s.int("ping_interval_s")}


def purge_old(db: Session, days: int = 30, batch: int = 50_000) -> int:
    """E6: retention. Deletes in batches so it never holds a long lock."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    total = 0
    while True:
        ids = select(LocationPoint.id).where(LocationPoint.recorded_at < cutoff).limit(batch).scalar_subquery()
        n = db.execute(delete(LocationPoint).where(LocationPoint.id.in_(ids))).rowcount
        db.commit()
        total += n
        if n < batch:
            return total
