"""A5 preferred language, A6 Notify me / interest status, A7 explicit end date, A8 landmark round-trip."""
from datetime import timedelta

from conftest import customer_with_address, tomorrow, trial_body

V = "/api/v1"


def test_preferred_language_is_validated_and_persisted(client, otp):
    c = customer_with_address(client, otp, "9000000101")
    langs = client.get(f"{V}/config").json()["languages"]
    assert {"value": "hi", "label": "Hindi"} in langs
    r = client.patch(f"{V}/customers/me", json={"preferredLanguage": "xx"}, headers=c["h"])
    assert r.status_code == 422 and "preferredLanguage" in r.json()["error"]["fields"]
    assert client.patch(f"{V}/customers/me", json={"preferredLanguage": "hi"}, headers=c["h"]).status_code == 200
    assert client.get(f"{V}/customers/me", headers=c["h"]).json()["preferredLanguage"] == "hi"


def test_notify_me_is_idempotent_and_shown_on_catalogue(client, otp):
    c = customer_with_address(client, otp, "9000000102")
    other = customer_with_address(client, otp, "9000000103")
    first = client.post(f"{V}/services/party_mode/interest", headers=c["h"]).json()
    again = client.post(f"{V}/services/party_mode/interest", headers=c["h"]).json()
    assert first["alreadyRegistered"] is False and again["alreadyRegistered"] is True
    mine = {s["type"]: s for s in client.get(f"{V}/services", headers=c["h"]).json()}
    assert mine["party_mode"]["interested"] is True and mine["home_food"]["interested"] is False
    assert "interested" not in mine["custom_time"] and mine["custom_time"]["eligibility"]["trialStatus"] == "not_started"
    theirs = {s["type"]: s for s in client.get(f"{V}/services", headers=other["h"]).json()}
    assert theirs["party_mode"]["interested"] is False  # one customer's interest never leaks to another
    r = client.post(f"{V}/services/custom_time/interest", headers=c["h"])
    assert r.status_code == 422


def test_custom_time_accepts_explicit_end_date(client, otp):
    c = customer_with_address(client, otp, "9000000104")
    start = tomorrow()
    body = trial_body("custom_time", c["addressId"], durationDays=None, endDate=(start + timedelta(days=9)).isoformat())
    r = client.post(f"{V}/requests", json=body, headers=c["h"])
    assert r.status_code == 201, r.text
    too_long = trial_body("custom_time", c["addressId"], durationDays=None, endDate=(start + timedelta(days=90)).isoformat())
    c2 = customer_with_address(client, otp, "9000000105")
    too_long["addressId"] = c2["addressId"]
    assert client.post(f"{V}/requests", json=too_long, headers=c2["h"]).json()["error"]["fields"]["endDate"] == "The maximum is 90 days."


def test_address_landmark_round_trip_and_isolation(client, otp):
    c = customer_with_address(client, otp, "9000000106")
    other = customer_with_address(client, otp, "9000000107")
    body = {"label": "Office", "line1": "4th floor, Prestige Tower", "landmark": "Opp. metro gate 2", "city": "Bengaluru",
            "pincode": "560001", "lat": 12.97, "lng": 77.59}
    a = client.post(f"{V}/customers/me/addresses", json=body, headers=c["h"]).json()
    assert a["landmark"] == "Opp. metro gate 2"
    upd = client.put(f"{V}/customers/me/addresses/{a['id']}", json={**body, "landmark": "Near ATM"}, headers=c["h"]).json()
    assert upd["landmark"] == "Near ATM"
    assert client.get(f"{V}/customers/me/addresses/{a['id']}", headers=other["h"]).status_code in (403, 404)
    assert client.put(f"{V}/customers/me/addresses/{a['id']}", json=body, headers=other["h"]).status_code in (403, 404)
    assert client.delete(f"{V}/customers/me/addresses/{a['id']}", headers=other["h"]).status_code in (403, 404)
