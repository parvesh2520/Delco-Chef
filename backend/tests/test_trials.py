"""Part C acceptance tests."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import Trial, Visit
from app.services import bookings
from conftest import admin, customer_with_address, make_chef, tomorrow, trial_body

V = "/api/v1"


def setup(client, otp, db, phone="9876560001"):
    chef = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    chef2 = make_chef(db, "9111100002", "Esha", 12.9988, 77.6590, 4.4)
    ops = admin(client, otp, db)
    c = customer_with_address(client, otp, phone)
    return chef, chef2, ops, c


def finish(db, trial_id):
    """Simulate the trial visit being checked out (attendance has its own tests)."""
    db.expire_all()
    v = db.scalar(select(Visit).where(Visit.trial_id == int(trial_id)))
    v.status = "completed"
    bookings.on_visit_finished(db, v)
    db.commit()


def new_trial(client, c, ops, chef, service="monthly_subscription"):
    req = client.post(f"{V}/requests", json=trial_body(service, c["addressId"]), headers=c["h"])
    assert req.status_code == 201, req.text
    rid = req.json()["id"]
    assert client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef.id)}, headers=ops["h"]).status_code == 200
    return rid, req.json()["trials"][-1]["id"]


def test_open_request_blocks_same_service_but_not_other(client, otp, db):
    chef, _, ops, c = setup(client, otp, db)
    new_trial(client, c, ops, chef)
    again = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"])
    sub = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"], intent="subscribe"), headers=c["h"])
    assert again.json()["error"]["code"] == sub.json()["error"]["code"] == "OPEN_REQUEST_EXISTS"
    other = client.post(f"{V}/requests", json=trial_body("custom_time", c["addressId"], slot="morning"), headers=c["h"])
    assert other.status_code == 201
    elig = client.get(f"{V}/customers/me/eligibility/monthly_subscription", headers=c["h"]).json()
    assert elig["trialStatus"] == "trial_in_progress" and elig["canRequest"] is False and elig["reason"]


def test_decisions_after_each_trial(client, otp, db):
    chef, chef2, ops, c = setup(client, otp, db)
    rid, t1 = new_trial(client, c, ops, chef)
    early = client.post(f"{V}/trials/{t1}/decision", json={"decision": "subscribe"}, headers=c["h"])
    assert early.json()["error"]["code"] == "TRIAL_NOT_COMPLETED"
    finish(db, t1)
    assert client.get(f"{V}/trials/{t1}", headers=c["h"]).json()["trial"]["allowedDecisions"] == ["subscribe", "another_trial"]
    r = client.post(f"{V}/trials/{t1}/decision", json={"decision": "reject"}, headers=c["h"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "DECISION_NOT_ALLOWED"
    assert client.post(f"{V}/trials/{t1}/decision", json={"decision": "another_trial"}, headers=c["h"]).status_code == 200
    req = client.get(f"{V}/admin/requests/{rid}", headers=ops["h"]).json()
    assert req["stage"] == "trial2_requested"
    assert client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef2.id)}, headers=ops["h"]).status_code == 200
    t2 = req["trials"][-1]["id"]
    finish(db, t2)
    r = client.post(f"{V}/trials/{t2}/decision", json={"decision": "another_trial"}, headers=c["h"])
    assert r.json()["error"]["code"] == "DECISION_NOT_ALLOWED"
    assert client.post(f"{V}/trials/{t2}/decision", json={"decision": "reject"}, headers=c["h"]).status_code == 200
    # Closed, and no Monthly trial can ever be created again; Custom time still works.
    third = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"])
    assert third.json()["error"]["code"] == "TRIAL_LIMIT_REACHED"
    assert client.post(f"{V}/requests", json=trial_body("custom_time", c["addressId"]), headers=c["h"]).status_code == 201
    # The rejected service can still be subscribed later at the normal price.
    later = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"], intent="subscribe"), headers=c["h"])
    assert later.status_code == 201 and later.json()["status"] == "awaiting_payment"


def test_push_second_trial_rules(client, otp, db):
    chef, chef2, ops, c = setup(client, otp, db)
    rid, t1 = new_trial(client, c, ops, chef)
    day = (tomorrow() + timedelta(days=2)).isoformat()
    r = client.post(f"{V}/admin/requests/{rid}/push-trial", json={"chefId": str(chef2.id), "date": day}, headers=ops["h"])
    assert r.json()["error"]["code"] == "PUSH_TRIAL1_NOT_COMPLETED"
    finish(db, t1)
    r = client.post(f"{V}/admin/requests/{rid}/push-trial", json={"chefId": str(chef2.id), "date": day}, headers=ops["h"])
    assert r.status_code == 200 and r.json()["stage"] == "trial2_scheduled"
    t2 = r.json()["trials"][-1]["id"]
    # Customer cancels it more than 2 hours before: not counted, admin can push again.
    assert client.post(f"{V}/trials/{t2}/cancel", headers=c["h"]).json()["counted"] is False
    r = client.post(f"{V}/admin/requests/{rid}/push-trial", json={"chefId": str(chef2.id), "date": day}, headers=ops["h"])
    assert r.status_code == 200
    t2b = r.json()["trials"][-1]["id"]
    finish(db, t2b)
    r = client.post(f"{V}/admin/requests/{rid}/push-trial", json={"chefId": str(chef2.id), "date": day}, headers=ops["h"])
    assert r.json()["error"]["code"] == "TRIAL_LIMIT_REACHED"


def test_suggestions_for_a_proposed_push_date(client, otp, db):
    chef, chef2, ops, c = setup(client, otp, db)
    rid, t1 = new_trial(client, c, ops, chef)
    finish(db, t1)
    day = (tomorrow() + timedelta(days=3)).isoformat()
    sug = client.get(f"{V}/admin/requests/{rid}/suggestions", params={"date": day}, headers=ops["h"]).json()
    assert {s["chefName"] for s in sug if s["eligible"]} == {"Asha", "Esha"}


def test_push_refused_after_subscribing(client, otp, db):
    chef, chef2, ops, c = setup(client, otp, db)
    rid, t1 = new_trial(client, c, ops, chef)
    finish(db, t1)
    assert client.post(f"{V}/trials/{t1}/decision", json={"decision": "subscribe"}, headers=c["h"]).status_code == 200
    r = client.post(f"{V}/admin/requests/{rid}/push-trial", json={"chefId": str(chef2.id), "date": tomorrow().isoformat()}, headers=ops["h"])
    assert r.json()["error"]["code"] == "PUSH_ALREADY_SUBSCRIBING"


def test_cannot_subscribe_without_completed_trial(client, otp, db):
    _, _, _, c = setup(client, otp, db)
    r = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"], intent="subscribe"), headers=c["h"])
    assert r.json()["error"]["code"] == "NO_COMPLETED_TRIAL"


def test_third_trial_refused_on_every_path(client, otp, db):
    chef, chef2, ops, c = setup(client, otp, db)
    rid, t1 = new_trial(client, c, ops, chef)
    finish(db, t1)
    client.post(f"{V}/trials/{t1}/decision", json={"decision": "another_trial"}, headers=c["h"])
    client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef2.id)}, headers=ops["h"])
    t2 = client.get(f"{V}/requests/{rid}", headers=c["h"]).json()["trials"][-1]["id"]
    finish(db, t2)
    # Admin board/push path
    r = client.post(f"{V}/admin/requests/{rid}/push-trial", json={"chefId": str(chef2.id), "date": tomorrow().isoformat()}, headers=ops["h"])
    assert r.json()["error"]["code"] == "TRIAL_LIMIT_REACHED"
    client.post(f"{V}/trials/{t2}/decision", json={"decision": "reject"}, headers=c["h"])
    # Customer API path
    r = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"])
    assert r.json()["error"]["code"] == "TRIAL_LIMIT_REACHED"
    # Database guard: a third live trial row is structurally impossible.
    assert db.scalar(select(Trial).where(Trial.number > 2)) is None


def test_board_drag_request_to_payment_done_refused(client, otp, db):
    chef, _, ops, c = setup(client, otp, db)
    rid = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()["id"]
    r = client.post(f"{V}/admin/requests/{rid}/move", json={"to": "payment_done"}, headers=ops["h"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "BOARD_INVALID_TRANSITION"
    r = client.post(f"{V}/admin/requests/{rid}/move", json={"to": "closed", "note": "Duplicate"}, headers=ops["h"])
    assert r.status_code == 200 and r.json()["stage"] == "closed"
    moves = client.get(f"{V}/admin/requests/{rid}/moves", headers=ops["h"]).json()
    assert [m["to"] for m in moves] == ["request", "closed"] and moves[-1]["by"] == "Ops Person"


def test_trial_cancelled_within_two_hours_counts(client, otp, db):
    chef, _, ops, c = setup(client, otp, db)
    rid, t1 = new_trial(client, c, ops, chef)
    v = db.scalar(select(Visit).where(Visit.trial_id == int(t1)))
    v.starts_at = datetime.now(timezone.utc) + timedelta(minutes=90)
    v.ends_at = v.starts_at + timedelta(hours=1)
    db.commit()
    assert client.post(f"{V}/trials/{t1}/cancel", headers=c["h"]).json()["counted"] is True
    assert client.get(f"{V}/customers/me/eligibility/monthly_subscription", headers=c["h"]).json()["trialsUsed"] == 1
