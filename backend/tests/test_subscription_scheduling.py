"""Regression tests: BUG-1 (subscription assignments expired as offers), BUG-2 (subscription day 1 on the trial's
date/slot), BUG-3 (dev completion helper vs expired trial offers)."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import Assignment, OutboxEvent, ServiceRequest, Subscription, Trial, User, Visit
from app.services import bookings
from conftest import trial_body
from scripts.dev_complete_visit import NotCompletable, complete_trial
from test_payments import paid_event, subscribe, webhook
from test_trials import new_trial, setup
from app.services.worker import deliver_outbox

V = "/api/v1"
LIVE = ("pending_assignment", "needs_manual_assignment", "scheduled", "chef_travelling", "checked_in")


def pay_and_schedule(client, db, link) -> None:
    """Pay through the signed webhook, then run the background schedule build (sync_visits)."""
    assert webhook(client, paid_event(link.gateway_link_id, link.amount_paise)).json()["status"] == "paid"
    while deliver_outbox():
        pass
    db.expire_all()


def age_assignments(db, minutes=11, **where) -> None:
    """Pretend the assignments were created `minutes` ago (the response timeout is 10 minutes)."""
    q = db.query(Assignment)
    for k, v in where.items():
        q = q.filter(getattr(Assignment, k) == v)
    q.update({"created_at": datetime.now(timezone.utc) - timedelta(minutes=minutes)}, synchronize_session=False)
    db.commit()


def sub_visits(db, sub_id) -> list[Visit]:
    return db.scalars(select(Visit).where(Visit.subscription_id == int(sub_id)).order_by(Visit.starts_at)).all()


def trial_visit(db, request_id) -> Visit:
    return db.scalar(select(Visit).where(Visit.request_id == int(request_id), Visit.kind == "trial").order_by(Visit.id))


def assert_no_customer_overlap(db, customer_id) -> None:
    vs = db.scalars(select(Visit).where(Visit.customer_id == customer_id, Visit.status.in_(LIVE + ("completed",)),
                                        Visit.chef_id.is_not(None)).order_by(Visit.starts_at)).all()
    for a, b in zip(vs, vs[1:]):
        assert a.ends_at <= b.starts_at, f"visits {a.id} and {b.id} overlap"


# ---------------- BUG-1 ----------------
def test_subscription_visits_stay_assigned_after_offer_timeout(client, otp, db):
    _, _, _, link, sub_id = subscribe(client, otp, db)
    pay_and_schedule(client, db, link)
    visits = sub_visits(db, sub_id)
    assert visits and all(v.status == "scheduled" and v.chef_id for v in visits)
    rows = db.scalars(select(Assignment).where(Assignment.visit_id.in_([v.id for v in visits]))).all()
    assert rows and {a.status for a in rows} == {"accepted"}  # confirmed, not offers awaiting the chef

    age_assignments(db, 11)
    for _ in range(3):  # several worker runs
        bookings.expire_unanswered(db)
    db.expire_all()
    after = sub_visits(db, sub_id)
    assert [(v.id, v.chef_id, v.status) for v in after] == [(v.id, v.chef_id, "scheduled") for v in visits]
    assert not db.scalar(select(OutboxEvent).where(OutboxEvent.event == "assignment_expired"))


def test_unanswered_trial_offer_still_expires(client, otp, db):
    chef, _, ops, c = setup(client, otp, db)
    rid, _ = new_trial(client, c, ops, chef)
    v = trial_visit(db, rid)
    assert v.status == "scheduled"
    age_assignments(db, 11, visit_id=v.id)
    assert bookings.expire_unanswered(db) == 1
    db.expire_all()
    v = trial_visit(db, rid)
    assert v.chef_id is None and v.status == "pending_assignment"
    assert db.scalar(select(Assignment.status).where(Assignment.visit_id == v.id)) == "expired"


def test_expiring_trial_offers_leaves_subscriptions_alone(client, otp, db):
    _, ops, _, link, sub_id = subscribe(client, otp, db)
    pay_and_schedule(client, db, link)
    # A second customer's trial offer goes unanswered at the same time.
    from conftest import customer_with_address, make_chef
    other_chef = make_chef(db, "9111100009", "Ira", 12.9790, 77.6420, 4.1)
    c2 = customer_with_address(client, otp, "9876560099")
    rid2, _ = new_trial(client, c2, ops, other_chef)
    # A legacy row written before the fix: a system-scheduled subscription assignment stored as an offer.
    first = sub_visits(db, sub_id)[0]
    db.query(Assignment).filter(Assignment.visit_id == first.id).update({"status": "offered"}, synchronize_session=False)
    db.commit()
    age_assignments(db, 30)

    bookings.expire_unanswered(db)
    db.expire_all()
    expired_visits = db.scalars(select(Visit).join(Assignment, Assignment.visit_id == Visit.id)
                                .where(Assignment.status == "expired")).all()
    assert expired_visits and {v.kind for v in expired_visits} == {"trial"}  # only trial offers ever expire
    assert trial_visit(db, rid2).status == "pending_assignment"
    assert all(v.status == "scheduled" and v.chef_id for v in sub_visits(db, sub_id))
    assert db.scalar(select(Assignment.status).where(Assignment.visit_id == first.id)) == "accepted"


def test_admin_reassignment_of_subscription_visit_still_works(client, otp, db):
    _, ops, _, link, sub_id = subscribe(client, otp, db)
    pay_and_schedule(client, db, link)
    sub = db.get(Subscription, int(sub_id))
    from conftest import make_chef
    chef3 = make_chef(db, "9111100003", "Mira", 12.9800, 77.6450, 4.0)
    no_reason = client.post(f"{V}/admin/requests/{sub.request_id}/assign", json={"chefId": str(chef3.id)}, headers=ops["h"])
    assert no_reason.json()["error"]["code"] == "REASSIGN_REASON_REQUIRED"
    r = client.post(f"{V}/admin/requests/{sub.request_id}/assign", json={"chefId": str(chef3.id), "reason": "Original chef on leave"},
                    headers=ops["h"])
    assert r.status_code == 200, r.text
    db.expire_all()
    moved = [v for v in sub_visits(db, sub_id) if v.chef_id == chef3.id]
    assert len(moved) == 1
    rows = db.scalars(select(Assignment).where(Assignment.visit_id == moved[0].id).order_by(Assignment.id)).all()
    assert [a.status for a in rows] == ["superseded", "offered"] and rows[-1].action == "reassigned"
    # An admin's assignment is a genuine offer: the chef must answer it, so it still times out (B9).
    age_assignments(db, 11, id=rows[-1].id)
    assert bookings.expire_unanswered(db) == 1


# ---------------- BUG-2 ----------------
def test_subscription_right_after_completed_trial_starts_next_day(client, otp, db):
    c, _, _, link, sub_id = subscribe(client, otp, db)
    sub = db.get(Subscription, int(sub_id))
    tv = trial_visit(db, sub.request_id)
    assert tv.status == "completed" and sub.start_date == tv.service_date + timedelta(days=1)
    pay_and_schedule(client, db, link)
    visits = sub_visits(db, sub_id)
    assert all(v.service_date > tv.service_date for v in visits)
    assert all(v.status == "scheduled" for v in visits)  # no needs_manual_assignment from a self-collision
    assert_no_customer_overlap(db, tv.customer_id)


def test_subscription_requested_on_the_trial_date_is_moved(client, otp, db):
    chef, _, ops, c = setup(client, otp, db)
    req = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"], slot="morning"), headers=c["h"])
    rid, t1 = req.json()["id"], req.json()["trials"][0]["id"]
    client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef.id)}, headers=ops["h"])
    from test_trials import finish
    finish(db, t1)
    tv = trial_visit(db, rid)
    d = client.post(f"{V}/trials/{t1}/decision", json={"decision": "subscribe", "startDate": tv.service_date.isoformat()},
                    headers=c["h"]).json()
    sub = db.get(Subscription, int(d["subscriptionId"]))
    assert sub.start_date == tv.service_date + timedelta(days=1)
    assert tv.status == "completed" and tv.service_date == trial_visit(db, rid).service_date  # trial untouched


def test_custom_time_with_other_weekdays_keeps_its_rules(client, otp, db):
    from app.domain import ist_today
    today = ist_today()
    monday = today + timedelta(days=(7 - today.weekday()) % 7 or 7)
    _, _, _, link, sub_id = subscribe(client, otp, db, "custom_time", startDate=monday.isoformat(), durationDays=21,
                                      weekdays=[0, 2, 4])  # Mon/Wed/Fri; the trial is on the Monday
    sub = db.get(Subscription, int(sub_id))
    tv = trial_visit(db, sub.request_id)
    assert sub.start_date == monday + timedelta(days=1) and (sub.end_date - sub.start_date).days == 20  # length kept
    pay_and_schedule(client, db, link)
    visits = sub_visits(db, sub_id)
    assert len(visits) == sub.planned_visits > 0
    assert {v.service_date.weekday() for v in visits} <= {0, 2, 4}
    assert all(v.service_date > tv.service_date and v.status == "scheduled" for v in visits)


def test_overlap_with_customers_other_booking_is_held_for_admin(client, otp, db):
    c, ops, _, link, sub_id = subscribe(client, otp, db)
    sub = db.get(Subscription, int(sub_id))
    clash_day = sub.start_date + timedelta(days=2)
    other = client.post(f"{V}/requests", json=trial_body("custom_time", c["addressId"], slot="morning", day=clash_day), headers=c["h"])
    assert other.status_code == 201, other.text
    other_visit = trial_visit(db, other.json()["id"])
    pay_and_schedule(client, db, link)
    visits = sub_visits(db, sub_id)
    held = [v for v in visits if v.service_date == clash_day]
    assert len(held) == 1 and held[0].status == "needs_manual_assignment" and held[0].chef_id is None
    assert all(v.status == "scheduled" for v in visits if v.service_date != clash_day)
    db.refresh(other_visit)
    assert other_visit.status == "pending_assignment" and other_visit.service_date == clash_day  # never modified
    assert db.scalar(select(OutboxEvent).where(OutboxEvent.event == "schedule_conflict"))
    assert_no_customer_overlap(db, sub.customer_id)
    # Re-running the schedule build is idempotent: no second copy of the held visit.
    from app.services.subscriptions import sync_visits
    sync_visits(db, db.get(Subscription, int(sub_id)))
    db.commit()
    assert len([v for v in sub_visits(db, sub_id) if v.service_date == clash_day]) == 1


def test_monthly_without_conflict_schedules_every_guaranteed_day(client, otp, db):
    _, _, _, link, sub_id = subscribe(client, otp, db)
    pay_and_schedule(client, db, link)
    sub = db.get(Subscription, int(sub_id))
    visits = sub_visits(db, sub_id)
    from app.services.subscriptions import schedule_for
    # Monthly: every day of the 28-day cycle is served (26 are guaranteed and priced; 2 are flexible off-days).
    assert len(visits) == schedule_for(db, sub).visits == 28 and sub.planned_visits == 26
    assert [v.service_date for v in visits] == [sub.start_date + timedelta(days=i) for i in range(28)]
    assert all(v.chef_id == sub.chef_id and v.status == "scheduled" for v in visits)
    assert not db.scalar(select(OutboxEvent).where(OutboxEvent.event == "schedule_conflict"))


# ---------------- BUG-3 ----------------
def _customer_and_trial(client, otp, db):
    chef, _, ops, c = setup(client, otp, db)
    rid, tid = new_trial(client, c, ops, chef)
    v = trial_visit(db, rid)
    return db.get(User, v.customer_id), v, int(tid)


def test_dev_helper_completes_an_active_assignment(client, otp, db):
    user, v, tid = _customer_and_trial(client, otp, db)
    assert complete_trial(db, user).id == v.id
    db.expire_all()
    assert db.get(Trial, tid).status == "completed" and db.get(Visit, v.id).status == "completed"


def test_dev_helper_accepts_an_accepted_assignment_past_the_window(client, otp, db):
    user, v, tid = _customer_and_trial(client, otp, db)
    db.query(Assignment).filter(Assignment.visit_id == v.id).update({"status": "accepted"}, synchronize_session=False)
    db.commit()
    age_assignments(db, 60, visit_id=v.id)
    assert complete_trial(db, user).id == v.id


def test_dev_helper_reports_expired_assignment(client, otp, db):
    user, v, tid = _customer_and_trial(client, otp, db)
    age_assignments(db, 11, visit_id=v.id)
    bookings.expire_unanswered(db)
    with pytest.raises(NotCompletable, match="expired unanswered"):
        complete_trial(db, user)
    db.expire_all()
    assert db.get(Visit, v.id).status == "pending_assignment" and db.get(Trial, tid).status != "completed"


def test_dev_helper_refuses_offer_past_window_before_worker_runs(client, otp, db):
    user, v, tid = _customer_and_trial(client, otp, db)
    age_assignments(db, 11, visit_id=v.id)  # the worker hasn't run yet
    with pytest.raises(NotCompletable, match="response window"):
        complete_trial(db, user)
    db.expire_all()
    assert db.get(Visit, v.id).status == "scheduled" and db.get(Trial, tid).status != "completed"
    assert db.scalar(select(ServiceRequest.stage).where(ServiceRequest.id == v.request_id)) == "trial1_scheduled"


# ---------------- Orphaned open requests (trial rows deleted outside the app) ----------------
def test_repair_restores_trial_deleted_outside_the_app(client, otp, db):
    from scripts.repair_orphan_trials import find_orphans, repair
    _, _, ops, c = setup(client, otp, db)
    req = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"])
    rid = int(req.json()["id"])
    # Simulate the manual deletion seen in the dev database: visit and trial gone, request left at stage "request".
    db.query(Visit).filter(Visit.request_id == rid).delete(synchronize_session=False)
    db.query(Trial).filter(Trial.request_id == rid).delete(synchronize_session=False)
    db.commit()
    assert client.get(f"{V}/trials", headers=c["h"]).json() == []  # the "no trial" screen
    elig = client.get(f"{V}/customers/me/eligibility/monthly_subscription", headers=c["h"]).json()
    assert elig["trialStatus"] == "trial_in_progress"  # ...while other screens say one is ongoing

    orphans = find_orphans(db)
    assert [r.id for r in orphans] == [rid]
    repair(db, orphans[0])
    db.commit()
    assert find_orphans(db) == []  # idempotent: nothing left to repair

    trials = client.get(f"{V}/trials", headers=c["h"]).json()
    assert len(trials) == 1 and trials[0]["number"] == 1 and trials[0]["status"] == "pending_assignment"
    chef = make_chef_for_repair(db)
    assert client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef.id)}, headers=ops["h"]).status_code == 200


def make_chef_for_repair(db):
    from conftest import make_chef
    return make_chef(db, "9111100077", "Rhea", 12.9770, 77.6400, 4.2)


def test_profile_meals_cooked_counts_completed_trial_without_visit_row(client, otp, db):
    _, _, _, c = setup(client, otp, db)
    rid = int(client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()["id"])
    assert client.get(f"{V}/customers/me", headers=c["h"]).json()["mealsCooked"] == 0
    # The production case: the trial was completed, but its visit row is gone.
    db.query(Trial).filter(Trial.request_id == rid).update({"status": "completed"}, synchronize_session=False)
    db.query(Visit).filter(Visit.request_id == rid).delete(synchronize_session=False)
    db.commit()
    assert client.get(f"{V}/customers/me", headers=c["h"]).json()["mealsCooked"] == 1


def test_admin_lists_visits_without_chef_and_assigns_all_remaining(client, otp, db):
    c, ops, _, link, sub_id = subscribe(client, otp, db)
    pay_and_schedule(client, db, link)
    visits = sub_visits(db, sub_id)
    chef_id = visits[0].chef_id
    rid = str(visits[0].request_id)
    # The customer's subscription visits have lost their chef (the state seen in production).
    db.query(Assignment).filter(Assignment.visit_id.in_([v.id for v in visits])).update({"status": "expired"},
                                                                                        synchronize_session=False)
    for v in visits:
        v.chef_id, v.status = None, "pending_assignment"
    db.commit()

    rows = client.get(f"{V}/admin/unassigned", headers=ops["h"]).json()
    assert [(r["requestId"], r["visits"], r["subscription"]) for r in rows] == [(rid, len(visits), True)]
    assert client.get(f"{V}/admin/dashboard", headers=ops["h"]).json()["visitsNeedingChef"] == len(visits)
    assert client.get(f"{V}/admin/unassigned", headers=c["h"]).status_code == 403

    r = client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef_id), "allRemaining": True}, headers=ops["h"])
    assert r.status_code == 200, r.text
    assert r.json()["assignedVisits"] == len(visits) and r.json()["skippedVisits"] == []
    bookings.expire_unanswered(db)  # confirmed: the offer timeout never takes them back
    db.expire_all()
    assert all(v.status == "scheduled" and v.chef_id == chef_id for v in sub_visits(db, sub_id))
    assert client.get(f"{V}/admin/unassigned", headers=ops["h"]).json() == []
    again = client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef_id), "allRemaining": True}, headers=ops["h"])
    assert again.json()["error"]["code"] == "NOTHING_TO_ASSIGN"
