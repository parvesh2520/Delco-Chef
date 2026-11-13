"""Part E: live tracking.

Ingest is cheap: ownership is cached for a few seconds, points go to an in-memory buffer, and a background flusher
writes them to location_points in one batched INSERT and upserts chef_last_locations in one statement (E5). Customers
poll every 5 s (E4) — at 1,000 chefs × 1 update / 5 s that is 200 requests/s absorbed by the buffer and one batched
INSERT per 2 s flush.

Invariants:
- The live position is kept per chef (one chef can never overwrite another chef's position) and remembers the visit
  it was sent for; a customer only sees it when that visit is theirs and the chef is still the assigned one.
- A point is accepted only from the assigned chef, while the visit is chef_travelling, with finite in-range
  coordinates, a timestamp not in the future (beyond small clock skew) and not before travel started. Points that were
  already accepted (retried batch) are dropped, so retries never duplicate rows.
- A stale position (older than `stale_after_s`) is never presented as live and gets no ETA.

Limit: the buffer and caches are per process. With several API instances, move them to Redis (same interface).
"""
import logging
import math
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

log = logging.getLogger(__name__)

OWNER_TTL_S = 30          # reuse an ownership/status lookup; travel start/stop and check-in invalidate it at once.
                          # Customer visibility never relies on it: snapshot re-reads the visit on every poll.
FUTURE_SKEW_S = 30        # device clocks drift a little; later than this is rejected, never clamped
MAX_BACKLOG_S = 600       # an offline queue holds 10 minutes of points; older ones are dropped
MAX_ACCURACY_M = 1000     # a "fix" worse than 1 km is not a position
MAX_BUFFER = 100_000      # ~8 minutes at 200 points/s if the database is unreachable; oldest dropped beyond that
LIVE_KEEP_S = 3600        # in-memory last positions older than this are pruned (the DB row stays)


@dataclass
class Point:
    visit_id: int
    chef_id: int
    lat: float
    lng: float
    accuracy: float | None
    recorded_at: datetime


@dataclass
class _Owner:
    chef_id: int
    status: str
    travel_started_at: datetime | None
    until: float


_lock = threading.Lock()
_buffer: list[Point] = []
_last: dict[int, Point] = {}    # chef_id -> latest point (live view)
_dirty: set[int] = set()        # chef ids whose live point changed since the last flush
_owner: dict[int, _Owner] = {}  # visit_id -> cached ownership/status


def forget_visit(visit_id: int) -> None:
    """Drop cached ownership so the next ingest re-reads the visit (travel start/stop, check-in)."""
    with _lock:
        _owner.pop(visit_id, None)


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


def _owner_of(db: Session, visit_id: int) -> _Owner:
    t = time.monotonic()
    with _lock:
        o = _owner.get(visit_id)
    if o and o.until >= t:
        return o
    row = db.execute(select(Visit.chef_id, Visit.status, Visit.travel_started_at).where(Visit.id == visit_id)).first()
    o = _Owner(row[0] or 0, row[1], row[2], t + OWNER_TTL_S) if row else _Owner(0, "missing", None, t + OWNER_TTL_S)
    with _lock:
        _owner[visit_id] = o
    return o


def _finite(x) -> float | None:
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _parse_point(p: dict, visit_id: int, chef_id: int, now: datetime, travel_started_at: datetime | None) -> Point | None:
    lat, lng = _finite(p.get("lat")), _finite(p.get("lng"))
    if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180) or (lat == 0 and lng == 0):
        return None  # (0, 0) is the classic "no fix" placeholder, never a real position here
    acc = p.get("accuracy")
    if acc is not None:
        acc = _finite(acc)
        if acc is None or acc < 0 or acc > MAX_ACCURACY_M:
            return None
    rec = p.get("recordedAt")
    if rec:
        try:
            at = datetime.fromisoformat(str(rec).replace("Z", "+00:00"))
        except ValueError:
            return None
        if at.tzinfo is None:
            return None  # a timestamp without a zone is ambiguous
        if (at - now).total_seconds() > FUTURE_SKEW_S:
            return None
        at = min(at, now)  # small skew only
    else:
        at = now  # server receive time when the client sends none
    if (now - at).total_seconds() > MAX_BACKLOG_S:
        return None
    if travel_started_at and at < travel_started_at - timedelta(seconds=FUTURE_SKEW_S):
        return None  # recorded before this trip started
    return Point(visit_id, chef_id, lat, lng, acc, at)


def ingest(db: Session, chef_id: int, visit_id: int, points: list[dict]) -> dict:
    """E2: validates the sender is the chef assigned to an active (travelling) booking, then buffers.
    Returns accepted/rejected counts; a rejected point is invalid or a duplicate and must not be retried."""
    o = _owner_of(db, visit_id)
    if o.chef_id != chef_id:
        raise not_found("Visit")
    if o.status != "chef_travelling":
        raise AppError("TRACKING_NOT_ACTIVE", "Start travel before sharing location.", 409)
    now = clock.now()
    parsed = [x for x in (_parse_point(p, visit_id, chef_id, now, o.travel_started_at) for p in points[-120:]) if x]
    parsed.sort(key=lambda x: x.recorded_at)
    accepted: list[Point] = []
    with _lock:
        cur = _last.get(chef_id)
        floor = cur.recorded_at if cur and cur.visit_id == visit_id else None
        for x in parsed:
            if floor is not None and x.recorded_at <= floor:
                continue  # already accepted (retry) or out of order
            accepted.append(x)
            floor = x.recorded_at
        if accepted:
            _buffer.extend(accepted)
            if len(_buffer) > MAX_BUFFER:
                log.warning("Location buffer full; dropping %d oldest points", len(_buffer) - MAX_BUFFER)
                del _buffer[: len(_buffer) - MAX_BUFFER]
            _last[chef_id] = accepted[-1]
            _dirty.add(chef_id)
    return {"accepted": len(accepted), "rejected": len(points) - len(accepted)}


def flush(db: Session) -> int:
    """Writes buffered points in one INSERT and the changed live positions in one upsert. On failure the batch is put
    back (bounded) so a database blip does not lose points."""
    with _lock:
        batch, _buffer[:] = list(_buffer), []
        dirty = [_last[c] for c in _dirty if c in _last]
        _dirty.clear()
        _prune()
    if not batch and not dirty:
        return 0
    try:
        if batch:
            db.execute(insert(LocationPoint), [{"visit_id": p.visit_id, "chef_id": p.chef_id, "lat": p.lat, "lng": p.lng,
                                                "accuracy_m": p.accuracy, "recorded_at": p.recorded_at} for p in batch])
        if dirty:
            stmt = insert(ChefLastLocation).values([{"chef_id": p.chef_id, "visit_id": p.visit_id, "lat": p.lat, "lng": p.lng,
                                                     "accuracy_m": p.accuracy, "recorded_at": p.recorded_at} for p in dirty])
            db.execute(stmt.on_conflict_do_update(index_elements=["chef_id"], set_={
                "visit_id": stmt.excluded.visit_id, "lat": stmt.excluded.lat, "lng": stmt.excluded.lng,
                "accuracy_m": stmt.excluded.accuracy_m, "recorded_at": stmt.excluded.recorded_at},
                where=ChefLastLocation.recorded_at < stmt.excluded.recorded_at))
        db.commit()
    except Exception:
        db.rollback()
        with _lock:
            _buffer[:0] = batch[-MAX_BUFFER:]
            del _buffer[MAX_BUFFER:]
            _dirty.update(p.chef_id for p in dirty)
        raise
    return len(batch)


def _prune() -> None:
    """Caller holds _lock. Keeps the in-memory maps bounded on a long-running process."""
    t, cutoff = time.monotonic(), clock.now() - timedelta(seconds=LIVE_KEEP_S)
    for k in [k for k, o in _owner.items() if o.until < t]:
        del _owner[k]
    for k in [k for k, p in _last.items() if p.recorded_at < cutoff and k not in _dirty]:
        del _last[k]


def snapshot(db: Session, customer_id: int, visit_id: int) -> dict:
    """E: visible only for the customer's own booking, from the window before start until check-in, while travelling,
    and only the currently assigned chef's position for this visit."""
    s = settings_svc.load(db)
    v = db.get(Visit, visit_id)
    if not v or v.customer_id != customer_id:
        raise not_found("Visit")
    now = clock.now()
    if v.status in ("checked_in", "completed", "customer_unavailable"):
        raise AppError("TRACKING_ENDED", "Tracking ended when your chef checked in.", 409)
    if v.status in ("cancelled", "missed"):
        raise AppError("TRACKING_ENDED", "This visit is no longer active.", 409)
    window_min = s.int("tracking_window_min")
    opens = v.starts_at - timedelta(minutes=window_min)
    if now < opens:
        raise AppError("TRACKING_NOT_AVAILABLE_YET", f"Tracking starts {window_min} minutes before your visit.", 409,
                       extra={"availableAt": opens.isoformat()})
    if v.status != "chef_travelling" or not v.chef_id:
        raise AppError("TRACKING_NOT_STARTED", "Your chef hasn't started travelling yet.", 409)
    with _lock:
        p = _last.get(v.chef_id)
    if p is None:
        row = db.get(ChefLastLocation, v.chef_id)
        if row:
            p = Point(row.visit_id or 0, row.chef_id, row.lat, row.lng, row.accuracy_m, row.recorded_at)
    if p is not None and (p.visit_id != v.id or p.chef_id != v.chef_id or
                          (v.travel_started_at and p.recorded_at < v.travel_started_at - timedelta(seconds=FUTURE_SKEW_S))):
        p = None  # a position from another trip is never shown for this one
    base = {"visitId": str(v.id), "available": True, "status": v.status, "destination": {"lat": v.lat, "lng": v.lng},
            "startsAt": v.starts_at.isoformat(), "staleAfterSec": s.int("stale_after_s"), "pollIntervalSec": s.int("ping_interval_s")}
    if p is None:
        return {**base, "stale": True, "reason": "Waiting for your chef's location…", "updatedAt": None, "ageSec": None,
                "etaMinutes": None}
    age = max(0, int((now - p.recorded_at).total_seconds()))
    stale = age > s.int("stale_after_s")
    dist = haversine_km(p.lat, p.lng, v.lat, v.lng)
    arriving = dist * 1000 <= s.int("checkin_radius_m")
    eta = None if stale else (0 if arriving else eta_minutes(dist, s.float("avg_speed_kmh")))
    return {**base, "stale": stale, "reason": "Reconnecting…" if stale else None, "chefLocation": {"lat": p.lat, "lng": p.lng},
            "accuracyM": p.accuracy, "distanceKm": round(dist, 2), "etaMinutes": eta, "arriving": arriving and not stale,
            "updatedAt": p.recorded_at.isoformat(), "ageSec": age}


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
