"""Part B acceptance tests through the HTTP API and a real PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from fastapi.testclient import TestClient

from app.core.security import encrypt
from app.main import app
from app.models import Address, ServiceRequest, Visit
from conftest import (H, PIN, admin, at, customer_with_address, login, make_chef, make_user, tomorrow, trial_body)

V = "/api/v1"


def busy(db, chef, hours, day=None):
    """Directly insert assigned visits (other customers) to give chefs jobs this week / a clashing booking."""
    u = make_user(db, "customer", f"98{chef.id:03d}{hours[0]:02d}{len(hours):03d}", "Other Customer")
    a = Address(user_id=u.id, label="Home", line1_enc=encrypt("x"), city="Bengaluru", pincode="560001", lat=12.97, lng=77.64, is_default=True)
    db.add(a)
    db.flush()
    d = day or tomorrow()
    r = ServiceRequest(customer_id=u.id, service="custom_time", stage="payment_done", members=2, slot="morning", start_date=d,
                       diet="veg", address_id=a.id, end_date=d + timedelta(days=7), weekdays=[0])
    db.add(r)
    db.flush()
    for h in hours:
        db.add(Visit(kind="subscription", request_id=r.id, customer_id=u.id, address_id=a.id, lat=a.lat, lng=a.lng, chef_id=chef.id,
                     service_date=d, starts_at=at(d, h), ends_at=at(d, h + 1), status="scheduled"))
    db.commit()


def part_b_seed(db):
    c = {}
    c["Asha"] = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    c["Esha"] = make_chef(db, "9111100002", "Esha", 12.9988, 77.6590, 4.4)
    c["Bala"] = make_chef(db, "9111100003", "Bala", 12.9352, 77.6245, 4.9)
    c["Dev"] = make_chef(db, "9111100004", "Dev", 12.9609, 77.6387, 4.5)
    c["Chitra"] = make_chef(db, "9111100005", "Chitra", 13.0827, 77.5877, 4.7)
    c["Farah"] = make_chef(db, "9111100006", "Farah", 12.9800, 77.6400, 4.8, active=False)
    c["Gopal"] = make_chef(db, "9111100007", "Gopal", 12.9750, 77.6350, 4.6, cuisines=("South Indian",))
    c["Hema"] = make_chef(db, "9111100008", "Hema", 12.9700, 77.6300, 4.9)
    c["Isha"] = make_chef(db, "9111100009", "Isha", 12.9790, 77.6420, 4.8, status="submitted")
    busy(db, c["Asha"], [7, 9, 11, 13, 15, 16])
    busy(db, c["Esha"], [7, 9])
    busy(db, c["Dev"], [7, 9, 18])
    from app.models import ChefOffDay
    db.add(ChefOffDay(chef_id=c["Hema"].id, day=tomorrow()))
    db.commit()
    return c


def test_suggestions_match_part_b_table(client, otp, db):
    part_b_seed(db)
    cust = customer_with_address(client, otp, "9876511111")
    req = client.post(f"{V}/requests", json=trial_body("monthly_subscription", cust["addressId"]), headers=cust["h"]).json()
    ops = admin(client, otp, db)
    sug = {s["chefName"]: s for s in client.get(f"{V}/admin/requests/{req['id']}/suggestions", headers=ops["h"]).json()}
    eligible = [n for n, s in sug.items() if s["eligible"]]
    assert eligible == ["Asha", "Esha", "Bala"]
    assert abs(sug["Asha"]["score"] - 0.810) <= 0.005 and abs(sug["Esha"]["score"] - 0.762) <= 0.005
    assert abs(sug["Bala"]["score"] - 0.736) <= 0.005
    assert set(sug["Asha"]["breakdown"]) >= {"rating", "distance", "workload"}
    assert "buffer" in sug["Dev"]["reasons"][0] and abs(sug["Dev"]["score"] - 0.802) <= 0.005
    assert "Beyond 8 km" in sug["Chitra"]["reasons"][0]
    assert sug["Farah"]["reasons"] == ["Inactive"]
    assert "Cuisine" in sug["Gopal"]["reasons"][0] and "Off-day" in sug["Hema"]["reasons"][0]
    assert "Not approved" in sug["Isha"]["reasons"][0]
    r = client.post(f"{V}/admin/requests/{req['id']}/assign", json={"chefId": sug["Asha"]["chefId"]}, headers=ops["h"])
    assert r.status_code == 200 and r.json()["assignedChefName"] == "Asha" and r.json()["status"] == "trial_scheduled"
    v = db.scalar(__import__("sqlalchemy").select(Visit).where(Visit.request_id == int(req["id"])))
    assert float(v.score) == 0.81 and v.runner_up_chef_id == int(sug["Esha"]["chefId"])


def test_twenty_parallel_assignments_exactly_one_succeeds(client, otp, db):
    asha = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    ops = admin(client, otp, db)
    req_ids = []
    for i in range(20):
        c = customer_with_address(client, otp, f"98765{i:05d}")
        req_ids.append(client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()["id"])

    def fire(rid):
        with TestClient(app) as tc:
            return tc.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(asha.id)}, headers=ops["h"])
    with ThreadPoolExecutor(max_workers=20) as ex:
        results = list(ex.map(fire, req_ids))
    ok = [r for r in results if r.status_code == 200]
    conflicts = [r for r in results if r.status_code == 409]
    assert len(ok) == 1 and len(conflicts) == 19
    assert all(r.json()["error"]["code"] == "ASSIGN_CONFLICT" for r in conflicts)
    stages = [db.get(ServiceRequest, int(x)).stage for x in req_ids]
    db.expire_all()
    stages = [db.get(ServiceRequest, int(x)).stage for x in req_ids]
    assert stages.count("trial1_scheduled") == 1 and stages.count("request") == 19


def test_off_day_after_assignment_flags_conflict_and_blocks(client, otp, db):
    asha = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    ops = admin(client, otp, db)
    c1 = customer_with_address(client, otp, "9876522221")
    c2 = customer_with_address(client, otp, "9876522222")
    r1 = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c1["addressId"]), headers=c1["h"]).json()
    r2 = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c2["addressId"], slot="morning"), headers=c2["h"]).json()
    assert client.post(f"{V}/admin/requests/{r1['id']}/assign", json={"chefId": str(asha.id)}, headers=ops["h"]).status_code == 200
    chef = login(client, otp, "9111100001", "chef")
    r = client.put(f"{V}/chefs/me/off-days", json={"days": [tomorrow().isoformat()]}, headers=H(chef))
    assert r.status_code == 200 and r.json()["conflicts"]
    assert client.get(f"{V}/admin/requests/{r1['id']}", headers=ops["h"]).json()["conflict"] is True
    sug = client.get(f"{V}/admin/requests/{r2['id']}/suggestions", headers=ops["h"]).json()
    assert not sug[0]["eligible"] and "Off-day" in sug[0]["reasons"][0]


def test_reassignment_requires_reason_and_notifies(client, otp, db):
    a = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    b = make_chef(db, "9111100002", "Esha", 12.9988, 77.6590, 4.4)
    ops = admin(client, otp, db)
    c = customer_with_address(client, otp, "9876533331")
    rid = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()["id"]
    client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(a.id)}, headers=ops["h"])
    r = client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(b.id)}, headers=ops["h"])
    assert r.json()["error"]["code"] == "REASSIGN_REASON_REQUIRED"
    r = client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(b.id), "reason": "Customer asked"}, headers=ops["h"])
    assert r.status_code == 200 and r.json()["assignedChefName"] == "Esha"
    hist = client.get(f"{V}/admin/requests/{rid}/assignments", headers=ops["h"]).json()
    assert hist[0]["action"] == "reassigned" and hist[0]["previousChefName"] == "Asha" and hist[0]["reason"] == "Customer asked"
    from conftest import deliver_outbox
    deliver_outbox()
    titles = [n["title"] for n in client.get(f"{V}/notifications", headers=c["h"]).json()]
    assert "Chef assigned" in titles and "Chef changed" in titles


def test_booking_validation(client, otp):
    c = customer_with_address(client, otp, "9876544441")
    past = trial_body("monthly_subscription", c["addressId"], day=tomorrow() - timedelta(days=6))
    assert client.post(f"{V}/requests", json=past, headers=c["h"]).json()["error"]["fields"]["startDate"]
    allergy = trial_body("monthly_subscription", c["addressId"], hasAllergies=True, allergyNotes="")
    assert "allergyNotes" in client.post(f"{V}/requests", json=allergy, headers=c["h"]).json()["error"]["fields"]
    short = trial_body("custom_time", c["addressId"], durationDays=5)
    assert client.post(f"{V}/requests", json=short, headers=c["h"]).json()["error"]["fields"]["endDate"].startswith("The minimum is 7")
    no_days = trial_body("custom_time", c["addressId"], weekdays=[])
    assert "weekdays" in client.post(f"{V}/requests", json=no_days, headers=c["h"]).json()["error"]["fields"]
    for svc in ("home_food", "party_mode"):
        r = client.post(f"{V}/requests", json=trial_body(svc, c["addressId"]), headers=c["h"])
        assert r.status_code == 422 and r.json()["error"]["code"] == "SERVICE_NOT_AVAILABLE"
    assert client.post(f"{V}/services/home_food/interest", headers=c["h"]).json()["interested"] is True


def test_allergy_change_notifies_assigned_chef(client, otp, db):
    a = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    ops = admin(client, otp, db)
    c = customer_with_address(client, otp, "9876555551")
    rid = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()["id"]
    client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(a.id)}, headers=ops["h"])
    client.patch(f"{V}/customers/me", json={"allergies": ["Peanuts"], "allergyNotes": "Severe peanut allergy"}, headers=c["h"])
    from conftest import deliver_outbox
    deliver_outbox()
    chef = login(client, otp, "9111100001", "chef")
    assert any("Allergy" in n["title"] for n in client.get(f"{V}/notifications", headers=H(chef)).json())
    jobs = client.get(f"{V}/visits", headers=H(chef)).json()
    assert jobs[0]["allergyNotes"] == "Severe peanut allergy"
    assert PIN  # pin unchanged
