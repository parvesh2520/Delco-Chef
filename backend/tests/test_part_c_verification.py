"""Part C final verification: regression tests for defects found in the audit (docs/PART_C_FINAL_VERIFICATION.md)."""
from datetime import UTC, date, datetime, timedelta

from conftest import trial_body
from sqlalchemy import select
from test_payments import subscribe
from test_trials import finish, setup

from app.domain import schedule as sched
from app.models import PaymentLink, Subscription, Visit

V = "/api/v1"


def _late_cancel_first_trial(client, db, c, ops, chef) -> str:
    """Trial 1 cancelled inside the 2-hour window: counted as used, and its request is closed."""
    req = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()
    t1 = req["trials"][0]["id"]
    assert client.post(f"{V}/admin/requests/{req['id']}/assign", json={"chefId": str(chef.id)}, headers=ops["h"]).status_code == 200
    v = db.scalar(select(Visit).where(Visit.trial_id == int(t1)))
    v.starts_at = datetime.now(UTC) + timedelta(minutes=90)
    v.ends_at = v.starts_at + timedelta(hours=1)
    db.commit()
    assert client.post(f"{V}/trials/{t1}/cancel", headers=c["h"]).json()["counted"] is True
    return req["id"]


# ---------------- Defect 1: a new request whose trial is the customer's second ----------------
def test_second_counted_trial_on_a_new_request_reaches_the_final_decision(client, otp, db):
    chef, _, ops, c = setup(client, otp, db)
    _late_cancel_first_trial(client, db, c, ops, chef)
    req = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"])
    assert req.status_code == 201, req.text
    rid, t2 = req.json()["id"], req.json()["trials"][0]["id"]
    assert req.json()["trials"][0]["number"] == 2 and req.json()["stage"] == "trial2_requested"
    assert client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef.id)}, headers=ops["h"]).json()["stage"] == "trial2_scheduled"
    finish(db, t2)
    trial = client.get(f"{V}/trials/{t2}", headers=c["h"]).json()["trial"]
    assert trial["allowedDecisions"] == ["subscribe", "reject"]
    more = client.post(f"{V}/trials/{t2}/decision", json={"decision": "another_trial"}, headers=c["h"])
    assert more.status_code == 409 and more.json()["error"]["code"] == "DECISION_NOT_ALLOWED"
    ok = client.post(f"{V}/trials/{t2}/decision", json={"decision": "reject"}, headers=c["h"])
    assert ok.status_code == 200, ok.text
    moves = client.get(f"{V}/admin/requests/{rid}/moves", headers=ops["h"]).json()
    assert [m["to"] for m in moves] == ["trial2_requested", "trial2_scheduled", "trial2_awaiting_decision", "closed"]
    third = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"])
    assert third.json()["error"]["code"] == "TRIAL_LIMIT_REACHED"


def test_cancelling_the_only_trial_of_a_second_trial_request_closes_it(client, otp, db):
    chef, _, ops, c = setup(client, otp, db)
    _late_cancel_first_trial(client, db, c, ops, chef)
    req = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()
    r = client.post(f"{V}/trials/{req['trials'][0]['id']}/cancel", headers=c["h"])
    assert r.status_code == 200, r.text
    assert client.get(f"{V}/admin/requests/{req['id']}", headers=ops["h"]).json()["stage"] == "closed"
    # Cancelled in time, so not used: the customer can still ask for their second trial.
    assert client.get(f"{V}/customers/me/eligibility/monthly_subscription", headers=c["h"]).json()["canRequestTrial"] is True


# ---------------- Defect 2: allowedDecisions must match what the server accepts ----------------
def test_allowed_decisions_empty_once_the_card_has_moved_on(client, otp, db):
    chef, chef2, ops, c = setup(client, otp, db)
    req = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()
    rid, t1 = req["id"], req["trials"][0]["id"]
    client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef.id)}, headers=ops["h"])
    finish(db, t1)
    day = (date.today() + timedelta(days=3)).isoformat()
    assert client.post(f"{V}/admin/requests/{rid}/push-trial", json={"chefId": str(chef2.id), "date": day}, headers=ops["h"]).status_code == 200
    trial = client.get(f"{V}/trials/{t1}", headers=c["h"]).json()["trial"]
    assert trial["allowedDecisions"] == []  # trial 2 is scheduled; the server would refuse any trial-1 decision
    r = client.post(f"{V}/trials/{t1}/decision", json={"decision": "subscribe"}, headers=c["h"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "DECISION_NOT_ALLOWED"


# ---------------- Defect 3: manual close needs a reason and stops the pending payment ----------------
def test_manual_close_requires_a_reason(client, otp, db):
    _, _, ops, c = setup(client, otp, db)
    rid = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()["id"]
    for note in (None, "  "):
        r = client.post(f"{V}/admin/requests/{rid}/move", json={"to": "closed", "note": note}, headers=ops["h"])
        assert r.status_code == 422 and r.json()["error"]["code"] == "CLOSE_REASON_REQUIRED"
    assert client.get(f"{V}/admin/requests/{rid}", headers=ops["h"]).json()["stage"] == "request"


def test_closing_subscription_requested_cancels_the_order_and_link(client, otp, db):
    c, ops, pay, link, sub_id = subscribe(client, otp, db)
    rid = str(db.get(Subscription, int(sub_id)).request_id)
    r = client.post(f"{V}/admin/requests/{rid}/move", json={"to": "closed", "note": "Customer asked by phone"}, headers=ops["h"])
    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.get(Subscription, int(sub_id)).status == "cancelled"
    assert db.get(PaymentLink, link.id).status == "cancelled"
    regen = client.post(f"{V}/payments/{pay['id']}/regenerate", headers=c["h"])
    assert regen.status_code == 409


# ---------------- Defect 4: missed days / off-days that fall on extension days ----------------
def test_missed_extension_day_extends_again():
    start = date(2026, 11, 2)
    offs = {date(2026, 11, 5), date(2026, 11, 12), date(2026, 11, 19)}
    base = sched.monthly(start, "morning", offs, {date(2026, 11, 9), date(2026, 11, 10)})
    assert base.end_date == date(2026, 12, 1) and len(base.service_dates) == 25  # PDF numbers unchanged
    sc = sched.monthly(start, "morning", offs, {date(2026, 11, 9), date(2026, 11, 10), date(2026, 11, 30)})
    assert sc.missed_days == [date(2026, 11, 9), date(2026, 11, 10), date(2026, 11, 30)]
    assert date(2026, 11, 30) not in sc.service_dates
    assert sc.end_date == date(2026, 12, 2) and len(sc.service_dates) == 25


def test_off_day_on_extension_day_removes_it():
    sc = sched.monthly(date(2026, 11, 2), "morning", {date(2026, 11, 30)}, {date(2026, 11, 9)})
    assert date(2026, 11, 30) not in sc.service_dates and sc.off_days == [date(2026, 11, 30)]
    assert sc.end_date == date(2026, 11, 30) and sc.free_off_days_left == 1


def test_custom_missed_extension_day_moves_to_next_chosen_weekday():
    mon_sat = set(range(6))
    start, end = date(2026, 11, 2), date(2026, 11, 15)
    base = sched.custom(start, end, mon_sat, "morning", set(), {date(2026, 11, 3)})
    assert base.extension_days == [date(2026, 11, 16)]
    sc = sched.custom(start, end, mon_sat, "morning", set(), {date(2026, 11, 3), date(2026, 11, 16)})
    assert sc.extension_days == [date(2026, 11, 16), date(2026, 11, 17)] and sc.end_date == date(2026, 11, 17)
    assert len(sc.service_dates) == 12
