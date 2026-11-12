"""Part C: decision rules (C2), board moves + history + close (C5), schedule endpoint with real visit data (C7),
off-day counter / forfeits / chef notice and missed-day extension (C7/C8), stage summary (C9)."""
from datetime import date, timedelta

from sqlalchemy import select

from app.models import OutboxEvent, Subscription, Trial, Visit
from app.services import subscriptions
from conftest import trial_body
from test_subscription_scheduling import pay_and_schedule, sub_visits
from test_payments import subscribe
from test_trials import finish, new_trial, setup

V = "/api/v1"


# ---------------- C2 ----------------
def test_decision_endpoint_reports_and_enforces_allowed_choices(client, otp, db):
    chef, chef2, ops, c = setup(client, otp, db)
    rid, t1 = new_trial(client, c, ops, chef)
    assert client.get(f"{V}/trials/{t1}", headers=c["h"]).json()["trial"]["allowedDecisions"] == []  # not completed yet
    early = client.post(f"{V}/trials/{t1}/decision", json={"decision": "subscribe"}, headers=c["h"])
    assert early.status_code == 409 and early.json()["error"]["code"] == "TRIAL_NOT_COMPLETED"
    finish(db, t1)
    assert client.get(f"{V}/trials/{t1}", headers=c["h"]).json()["trial"]["allowedDecisions"] == ["subscribe", "another_trial"]
    bad = client.post(f"{V}/trials/{t1}/decision", json={"decision": "reject"}, headers=c["h"])
    assert bad.status_code == 409 and bad.json()["error"]["code"] == "DECISION_NOT_ALLOWED"
    assert set(bad.json()["error"]["allowed"]) == {"subscribe", "another_trial"}
    ok = client.post(f"{V}/trials/{t1}/decision", json={"decision": "another_trial"}, headers=c["h"])
    assert ok.status_code == 200
    again = client.post(f"{V}/trials/{t1}/decision", json={"decision": "another_trial"}, headers=c["h"])  # double tap
    assert again.status_code == 409 and again.json()["error"]["code"] == "DECISION_ALREADY_MADE"
    t = client.get(f"{V}/trials/{t1}", headers=c["h"]).json()["trial"]
    assert t["decision"] == "another_trial" and t["decidedAt"] and t["allowedDecisions"] == []


# ---------------- C5 ----------------
def test_board_close_records_history_and_refuses_invalid_moves(client, otp, db):
    _, _, ops, c = setup(client, otp, db)
    rid = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()["id"]
    board = client.get(f"{V}/admin/board", headers=ops["h"]).json()
    assert [x["stage"] for x in board if x["id"] == rid] == ["request"]

    to_sched = client.post(f"{V}/admin/requests/{rid}/move", json={"to": "trial1_scheduled"}, headers=ops["h"])
    assert to_sched.status_code == 409 and to_sched.json()["error"]["code"] == "BOARD_USE_ACTION"
    to_paid = client.post(f"{V}/admin/requests/{rid}/move", json={"to": "payment_done"}, headers=ops["h"])
    assert to_paid.status_code == 409 and to_paid.json()["error"]["code"] in ("BOARD_INVALID_TRANSITION", "BOARD_PAYMENT_ONLY")
    unknown = client.post(f"{V}/admin/requests/{rid}/move", json={"to": "nowhere"}, headers=ops["h"])
    assert unknown.status_code == 422 and unknown.json()["error"]["code"] == "BOARD_UNKNOWN_STAGE"
    assert client.post(f"{V}/admin/requests/{rid}/move", json={"to": "closed"}, headers=c["h"]).status_code == 403  # customer token

    closed = client.post(f"{V}/admin/requests/{rid}/move", json={"to": "closed", "note": "Duplicate request"}, headers=ops["h"])
    assert closed.status_code == 200 and closed.json()["stage"] == "closed" and closed.json()["closedReason"] == "Duplicate request"
    db.expire_all()
    assert db.scalar(select(Trial.status).where(Trial.request_id == int(rid))) == "cancelled"
    assert {v.status for v in db.scalars(select(Visit).where(Visit.request_id == int(rid)))} == {"cancelled"}
    twice = client.post(f"{V}/admin/requests/{rid}/move", json={"to": "closed"}, headers=ops["h"])
    assert twice.status_code == 409  # already closed: no duplicate move

    moves = client.get(f"{V}/admin/requests/{rid}/moves", headers=ops["h"]).json()
    assert [(m["from"], m["to"], m["actorKind"]) for m in moves] == [(None, "request", "customer"), ("request", "closed", "admin")]
    assert moves[1]["by"] == "Ops Person" and moves[1]["note"] == "Duplicate request" and moves[1]["at"]
    assert all(x["id"] != rid for x in client.get(f"{V}/admin/board", headers=ops["h"]).json())  # leaves the board
    assert client.get(f"{V}/admin/requests/{rid}/moves", headers=c["h"]).status_code == 403


def test_board_refuses_admin_closing_a_scheduled_trial(client, otp, db):
    chef, _, ops, c = setup(client, otp, db)
    rid, _ = new_trial(client, c, ops, chef)
    r = client.post(f"{V}/admin/requests/{rid}/move", json={"to": "closed"}, headers=ops["h"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "BOARD_INVALID_TRANSITION"


# ---------------- C7 / C8 ----------------
def test_schedule_endpoint_lists_real_visits_and_never_invents_a_chef(client, otp, db):
    c, _, _, link, sub_id = subscribe(client, otp, db)
    pending = client.get(f"{V}/subscriptions/{sub_id}/schedule", headers=c["h"]).json()
    assert len(pending["days"]) == 28 and all(d["visits"] == [] for d in pending["days"])  # not paid: no visits yet
    pay_and_schedule(client, db, link)
    s = client.get(f"{V}/subscriptions/{sub_id}/schedule", headers=c["h"]).json()
    assert s["visits"] == 28 and len(s["days"]) == 28
    assert all(d["kind"] == "service" and len(d["visits"]) == 1 for d in s["days"])
    assert all(d["visits"][0]["status"] == "scheduled" and d["visits"][0]["chefName"] == "Asha" for d in s["days"])
    assert s["days"][0]["weekday"] == date.fromisoformat(s["days"][0]["date"]).strftime("%a")
    # A visit that lost its chef and waits for an admin shows no chef name.
    held = sub_visits(db, sub_id)[3]
    held.chef_id, held.status = None, "needs_manual_assignment"
    db.commit()
    day = next(d for d in client.get(f"{V}/subscriptions/{sub_id}/schedule", headers=c["h"]).json()["days"]
               if d["date"] == held.service_date.isoformat())
    assert day["visits"] == [{"id": str(held.id), "status": "needs_manual_assignment", "startsAt": held.starts_at.isoformat(),
                              "chefName": None}]
    # Another customer can't read this schedule.
    from conftest import customer_with_address
    other = customer_with_address(client, otp, "9876560077")
    assert client.get(f"{V}/subscriptions/{sub_id}/schedule", headers=other["h"]).status_code == 404


def test_off_days_counter_forfeit_chef_notice_and_missed_extension(client, otp, db):
    c, _, _, link, sub_id = subscribe(client, otp, db)
    pay_and_schedule(client, db, link)
    sub = db.get(Subscription, int(sub_id))
    offs = [(sub.start_date + timedelta(days=i)).isoformat() for i in (2, 3, 4)]
    r = client.put(f"{V}/subscriptions/{sub_id}/off-days", json={"days": offs[:2]}, headers=c["h"])
    assert r.status_code == 200 and r.json()["freeOffDaysLeft"] == 0
    s = client.get(f"{V}/subscriptions/{sub_id}/schedule", headers=c["h"]).json()
    assert s["forfeitedGuaranteedDays"] == 0 and s["visits"] == 26
    client.put(f"{V}/subscriptions/{sub_id}/off-days", json={"days": offs}, headers=c["h"])
    s = client.get(f"{V}/subscriptions/{sub_id}/schedule", headers=c["h"]).json()
    assert s["forfeitedGuaranteedDays"] == 1 and s["visits"] == 25 and s["extensionDays"] == []  # no extension, no refund
    off_days = [d for d in s["days"] if d["kind"] == "off"]
    assert [d["date"] for d in off_days] == offs and all(v["status"] == "cancelled" for d in off_days for v in d["visits"])
    while __import__("app.services.worker", fromlist=["deliver_outbox"]).deliver_outbox():
        pass
    assert db.scalar(select(OutboxEvent).where(OutboxEvent.event == "off_days_changed"))  # the chef is told

    # A missed day (company failure) extends the cycle by one day; rebuilding the schedule makes no duplicates.
    db.expire_all()
    first = sub_visits(db, sub_id)[0]
    subscriptions.mark_missed(db, first, "Chef did not arrive")
    db.commit()
    s = client.get(f"{V}/subscriptions/{sub_id}/schedule", headers=c["h"]).json()
    end = date.fromisoformat(s["endDate"])
    assert s["missedDays"] == [first.service_date.isoformat()] and s["extensionDays"] == [end.isoformat()]
    assert end == sub.start_date + timedelta(days=28)
    ext_day = next(d for d in s["days"] if d["date"] == end.isoformat())
    assert ext_day["kind"] == "extension" and len(ext_day["visits"]) == 1
    before = len(sub_visits(db, sub_id))
    subscriptions.sync_visits(db, db.get(Subscription, int(sub_id)))
    db.commit()
    assert len(sub_visits(db, sub_id)) == before


# ---------------- C9 ----------------
def test_stage_summary_counts_conversion_and_access(client, otp, db):
    c, ops, _, link, sub_id = subscribe(client, otp, db)
    pay_and_schedule(client, db, link)
    s = client.get(f"{V}/admin/stage-summary", headers=ops["h"]).json()
    assert s["stages"] == {"requested": 1, "assigned": 1, "trialDone": 1, "subscriptionRequested": 1, "paid": 1}
    assert s["conversionPercent"]["requested->assigned"] == 100.0 and s["byStage"] == {"payment_done": 1}
    assert s["avgMinutesToAssignment"] is not None
    assert client.get(f"{V}/admin/stage-summary", headers=c["h"]).status_code == 403
    assert client.get(f"{V}/admin/stage-summary").status_code == 401
