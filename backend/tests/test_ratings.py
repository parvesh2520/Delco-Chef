"""Visit ratings, the customer's chef card, dish photo and chef photo access."""
from app.core import clock
from app.models import Chef
from conftest import H, at, customer_with_address, login, make_chef, tomorrow
from test_attendance import NEAR, V, photo, png, setup


def complete(client, otp, db):
    vid, code, h, cust, ops = setup(client, otp, db)
    d = tomorrow()
    clock.frozen = at(d, 18, 50)
    selfie = photo(client, h, vid, "check_in_selfie").json()["id"]
    assert client.post(f"{V}/visits/{vid}/check-in", json={**NEAR, "code": code, "selfiePhotoId": selfie}, headers=h).status_code == 200
    clock.frozen = at(d, 19, 50)
    s2 = photo(client, h, vid, "check_out_selfie").json()["id"]
    food = photo(client, h, vid, "food").json()["id"]
    r = client.post(f"{V}/visits/{vid}/check-out", json={**NEAR, "selfiePhotoId": s2, "foodPhotoId": food}, headers=h)
    assert r.status_code == 200, r.text
    return vid, h, cust, ops, selfie, food


def test_customer_sees_chef_card_and_cannot_rate_before_completion(client, otp, db):
    vid, _code, _h, cust, _ops = setup(client, otp, db)
    v = client.get(f"{V}/visits/{vid}", headers=cust["h"]).json()
    assert v["chef"]["name"] == "Asha" and v["chef"]["verified"] is True and v["chef"]["cuisines"] == ["North Indian"]
    assert v["rating"] is None and v["canRate"] is False and v["foodPhotoUrl"] is None
    r = client.post(f"{V}/visits/{vid}/rating", json={"stars": 5}, headers=cust["h"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "RATING_NOT_ALLOWED"


def test_rating_once_updates_chef_average(client, otp, db):
    vid, _h, cust, _ops, _selfie, food = complete(client, otp, db)
    v = client.get(f"{V}/visits/{vid}", headers=cust["h"]).json()
    assert v["canRate"] is True and v["foodPhotoUrl"] == f"/media/photos/{food}"
    assert client.post(f"{V}/visits/{vid}/rating", json={"stars": 6}, headers=cust["h"]).status_code == 422
    r = client.post(f"{V}/visits/{vid}/rating", json={"stars": 4, "comment": "  Lovely dal  "}, headers=cust["h"])
    assert r.status_code == 201, r.text
    assert r.json()["rating"]["stars"] == 4 and r.json()["rating"]["comment"] == "Lovely dal"
    assert r.json()["chef"]["rating"] == 4.0 and r.json()["chef"]["ratingCount"] == 1
    db.expire_all()
    assert float(db.query(Chef).filter(Chef.id == int(v["chef"]["id"])).one().rating) == 4.0
    again = client.post(f"{V}/visits/{vid}/rating", json={"stars": 1}, headers=cust["h"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "ALREADY_RATED"


def test_other_customer_cannot_rate_or_see_photos(client, otp, db):
    vid, _h, cust, _ops, selfie, food = complete(client, otp, db)
    other = customer_with_address(client, otp, "9876570099")
    assert client.post(f"{V}/visits/{vid}/rating", json={"stars": 5}, headers=other["h"]).status_code == 404
    assert client.get(f"{V}/media/photos/{food}", headers=other["h"]).status_code == 404
    # The owner sees the dish photo but never the chef's selfies.
    assert client.get(f"{V}/media/photos/{food}", headers=cust["h"]).status_code == 200
    assert client.get(f"{V}/media/photos/{selfie}", headers=cust["h"]).status_code == 404


def test_chef_photo_only_for_customers_they_serve(client, otp, db):
    vid, _code, _h, cust, _ops = setup(client, otp, db)
    chef_id = client.get(f"{V}/visits/{vid}", headers=cust["h"]).json()["chef"]["id"]
    # No photo on file yet → 404 for everyone.
    assert client.get(f"{V}/media/chefs/{chef_id}/photo", headers=cust["h"]).status_code == 404
    chef = H(login(client, otp, "9111100001", "chef"))
    up = client.post(f"{V}/chefs/me/documents/photo", files={"file": ("p.png", png(), "image/png")}, headers=chef)
    assert up.status_code in (200, 201), up.text
    assert client.get(f"{V}/visits/{vid}", headers=cust["h"]).json()["chef"]["photoUrl"] == f"/media/chefs/{chef_id}/photo"
    assert client.get(f"{V}/media/chefs/{chef_id}/photo", headers=cust["h"]).status_code == 200
    stranger = customer_with_address(client, otp, "9876570098")
    assert client.get(f"{V}/media/chefs/{chef_id}/photo", headers=stranger["h"]).status_code == 404
    make_chef(db, "9111100002", "Ravi", 12.9716, 77.6412, 4.0)
    other_chef = H(login(client, otp, "9111100002", "chef"))
    assert client.get(f"{V}/media/chefs/{chef_id}/photo", headers=other_chef).status_code == 404


def test_subscription_and_profile_extras(client, otp, db):
    cust = customer_with_address(client, otp, "9876570097")
    me = client.get(f"{V}/customers/me", headers=cust["h"]).json()
    assert me["memberSince"]
