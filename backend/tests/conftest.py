"""Tests run against a disposable local PostgreSQL (never Neon). Default: docker container on port 55432.
Override with TEST_DATABASE_URL."""
import os

TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql://delco:delco@localhost:55432/delco_test")
os.environ.update(DATABASE_URL=TEST_DB, DIRECT_URL=TEST_DB, ENVIRONMENT="test", RUN_WORKERS="false",
                  RAZORPAY_KEY_ID="", RAZORPAY_KEY_SECRET="", MEDIA_ROOT=os.path.join(os.path.dirname(__file__), ".media"))

from datetime import date, datetime, time, timedelta  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core import clock  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import encrypt, lookup_hash  # noqa: E402
from app.domain import ist_datetime, ist_today  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (Address, Chef, ChefOffDay, ChefSkill, CustomerProfile, User)  # noqa: E402
from app.services import auth as auth_svc, tracking  # noqa: E402
from app.services import settings as settings_cache  # noqa: E402
from app.services.worker import deliver_outbox  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PIN = (12.9784, 77.6408)


@pytest.fixture(scope="session", autouse=True)
def _schema():
    assert "neon" not in TEST_DB, "Refusing to run tests against Neon"
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "migrations"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean():
    clock.frozen = None
    settings_cache.invalidate()  # tables are truncated below, outside save_section()
    tracking._buffer.clear(), tracking._last.clear(), tracking._owner.clear(), tracking._dirty.clear()
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as c:
        c.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    yield
    clock.frozen = None


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


class OtpCatcher:
    def __init__(self):
        self.codes: dict[str, str] = {}

    def send(self, phone, code):
        self.codes[phone] = code


@pytest.fixture(autouse=True)
def otp(monkeypatch):
    catcher = OtpCatcher()
    monkeypatch.setattr(auth_svc, "otp_provider", catcher)
    return catcher


def login(client, otp, phone: str, portal: str) -> dict:
    r = client.post("/api/v1/auth/otp/request", json={"phone": phone, "portal": portal})
    assert r.status_code == 200, r.text
    r = client.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": otp.codes[phone], "portal": portal})
    assert r.status_code == 200, r.text
    return r.json()


def H(session: dict) -> dict:
    return {"Authorization": f"Bearer {session['token']}"}


def make_user(db, role: str, phone: str, name: str) -> User:
    u = User(role=role, phone_enc=encrypt(phone), phone_hmac=lookup_hash(phone), full_name=name)
    db.add(u)
    db.flush()
    if role == "customer":
        db.add(CustomerProfile(user_id=u.id))
    db.commit()
    return u


def make_chef(db, phone: str, name: str, lat: float, lng: float, rating: float, *, cuisines=("North Indian",), status="approved",
              active=True) -> Chef:
    u = make_user(db, "chef", phone, name)
    c = Chef(user_id=u.id, status=status, active=active, home_lat=lat, home_lng=lng, rating=rating, city="Bengaluru", area="Indiranagar")
    db.add(c)
    db.flush()
    for cu in cuisines:
        db.add(ChefSkill(chef_id=c.id, cuisine=cu))
    db.commit()
    return c


def tomorrow() -> date:
    return ist_today() + timedelta(days=1)


def at(day: date, hh: int, mm: int = 0) -> datetime:
    return ist_datetime(day, time(hh, mm))


def customer_with_address(client, otp, phone: str, name: str = "Test Customer", pin=PIN) -> dict:
    s = login(client, otp, phone, "customer")
    h = H(s)
    assert client.patch("/api/v1/customers/me", json={"fullName": name}, headers=h).status_code == 200
    a = client.post("/api/v1/customers/me/addresses", json={"label": "Home", "line1": "12 Test Road", "city": "Bengaluru",
                                                             "pincode": "560038", "lat": pin[0], "lng": pin[1], "isDefault": True}, headers=h)
    assert a.status_code == 201, a.text
    s["addressId"] = a.json()["id"]
    s["h"] = h
    return s


def trial_body(service: str, address_id: str, *, slot="evening", day: date | None = None, members=4, **kw) -> dict:
    b = {"service": service, "members": members, "slot": slot, "startDate": (day or tomorrow()).isoformat(), "meals": ["dinner"],
         "cuisines": ["North Indian"], "diet": "veg", "allergies": [], "addressId": address_id}
    if service == "custom_time":
        b.update(durationDays=14, weekdays=[0, 1, 2, 3, 4, 5])
    b.update(kw)
    return b


def admin(client, otp, db, role="ops_admin", phone="9000000001") -> dict:
    make_user(db, role, phone, "Ops Person" if role == "ops_admin" else "Super Person")
    s = login(client, otp, phone, "admin")
    s["h"] = H(s)
    return s


def set_evening(db, hhmm: str = "19:00"):
    from app.services.settings import save_section
    save_section(db, "slots", {"slot_evening": hhmm}, None)
    db.commit()


__all__ = ["PNG", "PIN", "login", "H", "make_user", "make_chef", "tomorrow", "at", "customer_with_address", "trial_body", "admin",
           "deliver_outbox", "ChefOffDay", "Address", "set_evening"]
