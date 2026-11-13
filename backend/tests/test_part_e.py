"""Part E: ingest validation, dedupe, concurrency, visibility rules, ETA and staleness. Local test database only."""
import math
import threading
from datetime import UTC, timedelta

from conftest import (
    PIN,
    H,
    admin,
    at,
    customer_with_address,
    login,
    make_chef,
    tomorrow,
    trial_body,
)
from sqlalchemy import func, select, text

from app.core import clock
from app.core.database import SessionLocal
from app.domain.geo import eta_minutes, haversine_km
from app.models import ChefLastLocation, LocationPoint, Visit
from app.services import tracking
from app.services.settings import save_section

V = "/api/v1"
START = (19, 0)  # evening slot


def _trip(client, otp, db, i=0, ops=None):
    """One customer with a visit tomorrow 19:00 assigned to one chef. Returns (customer, chef headers, visit id, chef)."""
    ops = ops or admin(client, otp, db)
    ch = make_chef(db, f"91111001{i:02d}", f"Chef{i}", 12.9716, 77.6412, 4.6)
    c = customer_with_address(client, otp, f"98765910{i:02d}")
    rid = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()["id"]
    assert client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(ch.id)}, headers=ops["h"]).status_code == 200
    vid = client.get(f"{V}/visits", headers=c["h"]).json()[0]["id"]
    c["rid"] = rid
    return c, H(login(client, otp, f"91111001{i:02d}", "chef")), vid, ch


def _travel(client, ch_h, vid, minutes_before=20):
    clock.frozen = at(tomorrow(), *START) - timedelta(minutes=minutes_before)
    assert client.post(f"{V}/visits/{vid}/travel/start", headers=ch_h).status_code == 200


def _post(client, ch_h, vid, *points):
    return client.post(f"{V}/visits/{vid}/location", json={"points": list(points)}, headers=ch_h)


def _iso(dt):
    return dt.isoformat()


# ---------------- E2: ingest validation ----------------
def test_valid_point_is_accepted_and_flushed(client, otp, db):
    _c, ch_h, vid, ch = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    r = _post(client, ch_h, vid, {"lat": 12.95, "lng": 77.62, "accuracy": 8, "recordedAt": _iso(clock.now())})
    assert r.status_code == 200 and r.json() == {"accepted": 1, "rejected": 0}
    assert tracking.flush(db) == 1
    row = db.scalar(select(LocationPoint))
    assert (row.visit_id, row.chef_id, row.lat, row.accuracy_m) == (int(vid), ch.id, 12.95, 8)
    last = db.get(ChefLastLocation, ch.id)
    assert (last.visit_id, last.lat) == (int(vid), 12.95)


def test_invalid_points_are_rejected(client, otp, db):
    _c, ch_h, vid, _ = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    now = clock.now()
    bad = [
        {"lat": 91, "lng": 77.6}, {"lat": -90.5, "lng": 77.6},          # latitude out of range
        {"lat": 12.9, "lng": 180.5}, {"lat": 12.9, "lng": -181},        # longitude out of range
        {"lat": 0, "lng": 0},                                           # "no fix" placeholder
        {"lat": 12.9, "lng": 77.6, "accuracy": -1},                     # impossible accuracy
        {"lat": 12.9, "lng": 77.6, "accuracy": 5000},                   # not a usable fix
        {"lat": 12.9, "lng": 77.6, "recordedAt": "yesterday"},          # unparseable timestamp
        {"lat": 12.9, "lng": 77.6, "recordedAt": "2026-11-14T18:40:00"},  # no time zone
        {"lat": 12.9, "lng": 77.6, "recordedAt": _iso(now + timedelta(minutes=5))},  # future
        {"lat": 12.9, "lng": 77.6, "recordedAt": _iso(now - timedelta(minutes=30))},  # before travel / too old
    ]
    r = _post(client, ch_h, vid, *bad)
    assert r.status_code == 200 and r.json() == {"accepted": 0, "rejected": len(bad)}
    assert tracking.flush(db) == 0 and not tracking._last


def test_nan_and_infinity_are_rejected(client, otp, db):
    _c, ch_h, vid, _ = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    # Python's JSON parser accepts NaN/Infinity tokens, so they reach validation and must be refused there.
    body = '{"points": [{"lat": NaN, "lng": 77.6}, {"lat": 12.9, "lng": Infinity}, {"lat": 12.9, "lng": 77.6, "accuracy": NaN}]}'
    r = client.post(f"{V}/visits/{vid}/location", content=body, headers={**ch_h, "content-type": "application/json"})
    assert r.status_code == 200 and r.json() == {"accepted": 0, "rejected": 3}
    # Malformed structure is refused outright.
    assert _post(client, ch_h, vid, {"lat": "north", "lng": 77.6}).status_code == 422
    assert client.post(f"{V}/visits/{vid}/location", json={"points": []}, headers=ch_h).status_code == 422


def test_missing_accuracy_and_timestamp_are_allowed(client, otp, db):
    _c, ch_h, vid, _ = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    assert _post(client, ch_h, vid, {"lat": 12.95, "lng": 77.62}).json() == {"accepted": 1, "rejected": 0}
    tracking.flush(db)
    row = db.scalar(select(LocationPoint))
    assert row.accuracy_m is None and row.recorded_at == clock.now()  # server receive time, not invented accuracy


def test_only_the_assigned_travelling_chef_can_send(client, otp, db):
    ops = admin(client, otp, db)
    c, ch_h, vid, _ = _trip(client, otp, db, 0, ops)
    _c2, ch2_h, _vid2, _ = _trip(client, otp, db, 1, ops)
    pt = {"lat": 12.95, "lng": 77.62}
    clock.frozen = at(tomorrow(), *START) - timedelta(minutes=20)
    r = _post(client, ch_h, vid, pt)  # assigned but not travelling
    assert r.status_code == 409 and r.json()["error"]["code"] == "TRACKING_NOT_ACTIVE"
    _travel(client, ch_h, vid)
    assert _post(client, ch2_h, vid, pt).status_code == 404       # another chef
    assert _post(client, c["h"], vid, pt).status_code == 403       # a customer cannot submit chef coordinates
    assert _post(client, ch_h, 999999, pt).status_code == 404      # unknown visit
    assert client.post(f"{V}/visits/{vid}/location", json={"points": [pt]}).status_code == 401
    assert tracking.flush(db) == 0


def test_duplicate_and_out_of_order_points_are_dropped(client, otp, db):
    _c, ch_h, vid, _ = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    t0 = clock.now()
    batch = [{"lat": 12.95 + i * 1e-4, "lng": 77.62, "recordedAt": _iso(t0 - timedelta(seconds=15 - 5 * i))} for i in range(3)]
    assert _post(client, ch_h, vid, *batch).json() == {"accepted": 3, "rejected": 0}
    assert _post(client, ch_h, vid, *batch).json() == {"accepted": 0, "rejected": 3}  # retried after a lost response
    assert _post(client, ch_h, vid, batch[0]).json()["accepted"] == 0  # older than what we already have
    tracking.flush(db)
    assert db.scalar(select(func.count()).select_from(LocationPoint)) == 3


def test_concurrent_updates_never_cross_chefs(client, otp, db):
    ops = admin(client, otp, db)
    trips = [_trip(client, otp, db, i, ops) for i in range(4)]
    for _, ch_h, vid, _ in trips:
        _travel(client, ch_h, vid)
    clock.frozen = clock.now() + timedelta(minutes=5)
    base = clock.now() - timedelta(seconds=60)

    def send(k, vid, chef_id):
        s = SessionLocal()
        try:
            for step in range(50):
                p = {"lat": 12.90 + k * 0.01, "lng": 77.60 + step * 1e-4, "recordedAt": _iso(base + timedelta(seconds=step))}
                tracking.ingest(s, chef_id, int(vid), [p])
        finally:
            s.close()

    th = [threading.Thread(target=send, args=(k, vid, ch.id)) for k, (_, _, vid, ch) in enumerate(trips)]
    [t.start() for t in th]
    [t.join() for t in th]
    assert tracking.flush(db) == 200
    for k, (_, _, vid, ch) in enumerate(trips):
        last = db.get(ChefLastLocation, ch.id)
        assert (last.visit_id, round(last.lat, 4), round(last.lng, 4)) == (int(vid), round(12.90 + k * 0.01, 4), round(77.60 + 49e-4, 4))
        assert db.scalar(select(func.count()).select_from(LocationPoint).where(LocationPoint.chef_id == ch.id,
                                                                               LocationPoint.visit_id == int(vid))) == 50


class _BrokenDb:
    def execute(self, *a, **k):
        raise RuntimeError("database unavailable")

    def rollback(self):
        pass


def test_flush_failure_keeps_points(client, otp, db):
    _c, ch_h, vid, ch = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    _post(client, ch_h, vid, {"lat": 12.95, "lng": 77.62})
    try:
        tracking.flush(_BrokenDb())
        raise AssertionError("flush should raise")
    except RuntimeError:
        pass
    assert tracking.flush(db) == 1 and db.get(ChefLastLocation, ch.id) is not None


# ---------------- Visibility window and ownership ----------------
def test_window_boundary_and_refusals(client, otp, db):
    c, ch_h, vid, _ = _trip(client, otp, db)
    other = customer_with_address(client, otp, "9876591999", "Other")
    _travel(client, ch_h, vid, minutes_before=30)
    opens = at(tomorrow(), *START) - timedelta(minutes=15)
    clock.frozen = opens - timedelta(seconds=1)
    r = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "TRACKING_NOT_AVAILABLE_YET"
    clock.frozen = opens
    _post(client, ch_h, vid, {"lat": 12.95, "lng": 77.62})
    snap = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()
    assert snap["available"] and snap["chefLocation"] == {"lat": 12.95, "lng": 77.62}
    assert "history" not in snap and "points" not in snap  # live position only, never the trail
    assert client.get(f"{V}/visits/{vid}/tracking", headers=other["h"]).status_code == 404
    assert client.get(f"{V}/visits/{vid}/tracking", headers=ch_h).status_code == 403  # customers only


def test_tracking_ends_on_check_in_and_cancellation(client, otp, db):
    for status in ("checked_in", "completed", "cancelled", "missed"):
        tracking._last.clear(), tracking._owner.clear()
        db.execute(text("TRUNCATE users, chefs RESTART IDENTITY CASCADE"))
        db.commit()
        c, ch_h, vid, _ = _trip(client, otp, db)
        _travel(client, ch_h, vid)
        clock.frozen = at(tomorrow(), *START) - timedelta(minutes=5)
        _post(client, ch_h, vid, {"lat": 12.95, "lng": 77.62})
        v = db.get(Visit, int(vid))
        v.status = status
        db.commit()
        r = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"])
        assert r.json()["error"]["code"] == "TRACKING_ENDED", status
        tracking.forget_visit(int(vid))
        assert _post(client, ch_h, vid, {"lat": 12.951, "lng": 77.62}).status_code == 409  # sharing stops too


def test_reassignment_hides_the_previous_chef(client, otp, db):
    ops = admin(client, otp, db)
    c, a_h, vid, _a = _trip(client, otp, db, 0, ops)
    _travel(client, a_h, vid)
    clock.frozen = at(tomorrow(), *START) - timedelta(minutes=10)
    _post(client, a_h, vid, {"lat": 12.95, "lng": 77.62})
    tracking.flush(db)
    assert client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()["chefLocation"]
    b = make_chef(db, "9111100299", "Bina", 12.9750, 77.6420, 4.5)
    body = {"chefId": str(b.id), "visitId": str(vid), "reason": "Chef A vehicle broke down"}
    r = client.post(f"{V}/admin/requests/{c['rid']}/assign", json=body, headers=ops["h"])
    assert r.json()["error"]["code"] == "VISIT_NOT_ASSIGNABLE"  # Part B: a travelling visit is not reassigned under the chef
    assert client.post(f"{V}/visits/{vid}/travel/stop", headers=a_h).status_code == 200
    r = client.post(f"{V}/admin/requests/{c['rid']}/assign", json=body, headers=ops["h"])
    assert r.status_code == 200, r.text
    assert client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()["error"]["code"] == "TRACKING_NOT_STARTED"
    assert _post(client, a_h, vid, {"lat": 12.96, "lng": 77.62}).status_code == 404  # old chef can no longer send
    b_h = H(login(client, otp, "9111100299", "chef"))
    assert client.post(f"{V}/visits/{vid}/travel/start", headers=b_h).status_code == 200
    snap = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()
    assert "chefLocation" not in snap and snap["stale"] is True  # chef A's last position is never shown for chef B
    _post(client, b_h, vid, {"lat": 12.97, "lng": 77.63})
    assert client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()["chefLocation"] == {"lat": 12.97, "lng": 77.63}


def test_booking_time_change_moves_the_window(client, otp, db):
    c, ch_h, vid, _ = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    clock.frozen = at(tomorrow(), *START) - timedelta(minutes=10)
    assert client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).status_code == 200
    v = db.get(Visit, int(vid))
    v.starts_at, v.ends_at = v.starts_at + timedelta(hours=1), v.ends_at + timedelta(hours=1)
    db.commit()
    assert client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()["error"]["code"] == "TRACKING_NOT_AVAILABLE_YET"


# ---------------- ETA ----------------
def test_eta_formula_known_distance():
    d = haversine_km(12.0, 77.0, 12.1, 77.0)
    assert abs(d - 11.12) < 0.01  # 0.1° of latitude
    assert eta_minutes(d, 20) == math.ceil(d / 20 * 60) == 34
    assert eta_minutes(10.0, 20) == 30 and eta_minutes(0.001, 20) == 1  # never 0 or negative while still away


def test_eta_in_snapshot_uses_configured_speed(client, otp, db):
    c, ch_h, vid, _ = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    clock.frozen = at(tomorrow(), *START) - timedelta(minutes=10)
    chef_at = (PIN[0] + 0.05, PIN[1])
    _post(client, ch_h, vid, {"lat": chef_at[0], "lng": chef_at[1]})
    d = haversine_km(*chef_at, *PIN)
    snap = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()
    assert snap["etaMinutes"] == math.ceil(d / 20 * 60) and snap["distanceKm"] == round(d, 2) and snap["stale"] is False
    save_section(db, "tracking", {"avg_speed_kmh": "40"}, None)  # admin-configurable average speed
    db.commit()
    assert client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()["etaMinutes"] == math.ceil(d / 40 * 60)


def test_arrival_missing_and_stale_have_no_invented_eta(client, otp, db):
    c, ch_h, vid, _ = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    clock.frozen = at(tomorrow(), *START) - timedelta(minutes=10)
    snap = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()
    assert snap["stale"] and snap["etaMinutes"] is None and "chefLocation" not in snap  # nothing received yet
    _post(client, ch_h, vid, {"lat": PIN[0] + 0.0005, "lng": PIN[1]})  # ~55 m away, inside the 200 m check-in radius
    snap = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()
    assert snap["arriving"] is True and snap["etaMinutes"] == 0


# ---------------- Stale detection ----------------
def test_stale_threshold_is_30_seconds(client, otp, db):
    c, ch_h, vid, _ = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    t0 = at(tomorrow(), *START) - timedelta(minutes=10)
    clock.frozen = t0
    _post(client, ch_h, vid, {"lat": PIN[0] + 0.05, "lng": PIN[1]})
    clock.frozen = t0 + timedelta(seconds=30)
    fresh = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()
    assert fresh["stale"] is False and fresh["ageSec"] == 30 and fresh["etaMinutes"] is not None
    clock.frozen = t0 + timedelta(seconds=35)  # acceptance test: simulator stopped for 35 s
    stale = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()
    assert stale["stale"] is True and stale["reason"] == "Reconnecting…" and stale["etaMinutes"] is None
    assert stale["chefLocation"] and stale["ageSec"] == 35  # last known position is returned, flagged, for a "last seen" marker
    _post(client, ch_h, vid, {"lat": PIN[0] + 0.04, "lng": PIN[1]})  # chef reconnects
    assert client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()["stale"] is False


# ---------------- E6: retention ----------------
def test_purge_deletes_points_older_than_30_days(db):
    from datetime import datetime
    now = datetime.now(UTC)
    db.add_all([LocationPoint(visit_id=1, chef_id=1, lat=12.9, lng=77.6, recorded_at=now - timedelta(days=d)) for d in (31, 45, 29, 1)])
    db.commit()
    assert tracking.purge_old(db) == 2
    assert db.scalar(select(func.count()).select_from(LocationPoint)) == 2


def test_acceptance_three_chefs_sixty_points(client, otp, db):
    """PDF acceptance: 3 chefs walk 60 points; a customer sees only their own chef."""
    ops = admin(client, otp, db)
    trips = [_trip(client, otp, db, i, ops) for i in range(3)]
    for _, ch_h, vid, _ in trips:
        _travel(client, ch_h, vid)
    t0 = at(tomorrow(), *START) - timedelta(minutes=14)
    for step in range(60):
        clock.frozen = t0 + timedelta(seconds=5 * step)
        for i, (_, ch_h, vid, _) in enumerate(trips):
            assert _post(client, ch_h, vid, {"lat": 12.95 + i * 0.01 + step * 1e-4, "lng": 77.62}).json()["accepted"] == 1
    for i, (c, _, vid, _) in enumerate(trips):
        snap = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()
        assert abs(snap["chefLocation"]["lat"] - (12.95 + i * 0.01 + 59 * 1e-4)) < 1e-9
        for j, (_, _, other_vid, _) in enumerate(trips):
            if j != i:
                assert client.get(f"{V}/visits/{other_vid}/tracking", headers=c["h"]).status_code == 404


def test_ingest_auth_matches_the_standard_checks(client, otp, db):
    from app.models import Chef, User
    _c, ch_h, vid, ch = _trip(client, otp, db)
    _travel(client, ch_h, vid)
    pt = {"lat": 12.95, "lng": 77.62}
    assert _post(client, ch_h, vid, pt).status_code == 200
    db.get(Chef, ch.id).status = "rejected"
    db.commit()
    r = _post(client, ch_h, vid, pt)
    assert r.status_code == 403 and r.json()["error"]["code"] == "CHEF_NOT_APPROVED"
    db.get(Chef, ch.id).status = "approved"
    db.get(User, ch.user_id).status = "disabled"
    db.commit()
    assert _post(client, ch_h, vid, pt).status_code == 401
    db.get(User, ch.user_id).status = "active"
    db.commit()
    db.execute(text("update refresh_tokens set revoked_at = now()"))
    db.commit()
    r = _post(client, ch_h, vid, pt)
    assert r.status_code == 401 and r.json()["error"]["code"] == "SESSION_REVOKED"
    bad = {"Authorization": ch_h["Authorization"][:-3] + "abc"}
    assert _post(client, bad, vid, pt).status_code == 401
