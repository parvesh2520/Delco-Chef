"""Part E load test: 1,000 chefs sending one location every 5 s (≈200 requests/s) while 50 customers poll the live view.

Local benchmark database only (refuses Neon / production). Run from backend/ with DATABASE_URL and DIRECT_URL set:
    python ../loadtest/location_ingest.py seed  > ../loadtest/part_e_tokens.json   # 1,000 travelling chefs + customers
    uvicorn app.main:app --port 8001                                                # one process, as on Render
    python ../loadtest/location_ingest.py run http://localhost:8001/api/v1 ../loadtest/part_e_tokens.json 60
    python ../loadtest/location_ingest.py flushbench                                # batched write cost, direct to DB

Open loop: every chef has a fixed 5 s schedule with a random phase, so the offered rate stays at 200/s even if the server
slows down. Latency is measured from the scheduled send time (no coordinated omission).
"""
import asyncio
import json
import random
import statistics
import sys
import time
import uuid
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, ".")
CHEFS, CUSTOMERS_POLLING, INTERVAL = 1000, 50, 5.0


def _guard():
    from app.core.config import settings
    if "neon.tech" in settings.sqlalchemy_url or "neon.tech" in settings.migration_url or settings.is_production:
        sys.exit("Load tests run against a local benchmark database only.")


def seed():
    _guard()
    from sqlalchemy import text

    from app.core import clock
    from app.core.database import SessionLocal
    from app.core.security import encrypt, lookup_hash
    from app.models import Address, Chef, ServiceRequest, User, Visit
    from app.services import auth
    db = SessionLocal()
    db.execute(text("TRUNCATE location_points, chef_last_locations"))
    now = clock.now()
    out = {"chefs": [], "customers": []}
    for i in range(CHEFS):
        cu = User(role="customer", full_name=f"Load Customer {i}", phone_enc=encrypt(f"97{i:08d}"), phone_hmac=lookup_hash(f"97{i:08d}"))
        cu_chef = User(role="chef", full_name=f"Load Chef {i}", phone_enc=encrypt(f"96{i:08d}"), phone_hmac=lookup_hash(f"96{i:08d}"))
        db.add_all([cu, cu_chef])
        db.flush()
        lat, lng = 12.90 + random.random() * 0.15, 77.55 + random.random() * 0.15
        ch = Chef(user_id=cu_chef.id, status="approved", active=True, home_lat=lat, home_lng=lng, rating=4.5, city="Bengaluru", area="Load")
        a = Address(user_id=cu.id, label="Home", line1_enc=encrypt("1 Load Road"), city="Bengaluru", pincode="560001", lat=lat, lng=lng)
        db.add_all([ch, a])
        db.flush()
        r = ServiceRequest(customer_id=cu.id, service="monthly_subscription", members=2, slot="evening", start_date=date.today(),
                           diet="veg", address_id=a.id, stage="trial1_scheduled")
        db.add(r)
        db.flush()
        v = Visit(kind="trial", request_id=r.id, customer_id=cu.id, address_id=a.id, lat=lat, lng=lng, chef_id=ch.id,
                  service_date=date.today(), starts_at=now + timedelta(minutes=10), ends_at=now + timedelta(minutes=130),
                  status="chef_travelling", travel_started_at=now - timedelta(minutes=5))
        db.add(v)
        db.flush()
        out["chefs"].append({"token": auth._issue(db, cu_chef, uuid.uuid4().hex, "loadtest")["token"], "visitId": v.id,
                             "lat": lat + 0.02, "lng": lng})
        if i < CUSTOMERS_POLLING:
            out["customers"].append({"token": auth._issue(db, cu, uuid.uuid4().hex, "loadtest")["token"], "visitId": v.id})
    db.commit()
    print(json.dumps(out))


def _stats(lat: list[float], errors: int, secs: float) -> dict:
    q = statistics.quantiles(lat, n=100) if len(lat) > 1 else [0] * 99
    return {"requests": len(lat), "rps": round(len(lat) / secs, 1), "p50_ms": round(q[49], 1), "p95_ms": round(q[94], 1),
            "p99_ms": round(q[98], 1), "max_ms": round(max(lat, default=0), 1), "error_rate": round(errors / max(len(lat), 1), 4)}


async def _run(base: str, tokens: dict, secs: float) -> dict:
    import httpx
    ingest, snap = {"lat": [], "err": 0, "codes": {}}, {"lat": [], "err": 0, "codes": {}}
    limits = httpx.Limits(max_connections=1100, max_keepalive_connections=1100)
    async with httpx.AsyncClient(base_url=base, timeout=30, limits=limits) as client:
        t_start = time.perf_counter()
        end = t_start + secs

        async def chef(c):
            h = {"Authorization": f"Bearer {c['token']}"}
            due = t_start + random.random() * INTERVAL
            step = 0
            while due < end:
                await asyncio.sleep(max(0, due - time.perf_counter()))
                body = {"points": [{"lat": c["lat"] - step * 1e-4, "lng": c["lng"], "accuracy": 8,
                                    "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{step % 1000:03d}Z"}]}
                await _call(client, "POST", f"/visits/{c['visitId']}/location", h, body, due, ingest)
                step += 1
                due += INTERVAL

        async def customer(c):
            h = {"Authorization": f"Bearer {c['token']}"}
            due = t_start + random.random() * INTERVAL
            while due < end:
                await asyncio.sleep(max(0, due - time.perf_counter()))
                await _call(client, "GET", f"/visits/{c['visitId']}/tracking", h, None, due, snap)
                due += INTERVAL

        await asyncio.gather(*[chef(c) for c in tokens["chefs"]], *[customer(c) for c in tokens["customers"]])
        elapsed = time.perf_counter() - t_start
    return {"ingest": {**_stats(ingest["lat"], ingest["err"], elapsed), "status_codes": ingest["codes"]},
            "live_view": {**_stats(snap["lat"], snap["err"], elapsed), "status_codes": snap["codes"]},
            "offered_ingest_rps": len(tokens["chefs"]) / INTERVAL, "duration_s": round(elapsed, 1),
            "_raw": {"ingest": ingest, "live_view": snap}}


async def _call(client, method, path, headers, body, due, acc):
    try:
        r = await client.request(method, path, headers=headers, json=body)
        code = r.status_code
        if method == "POST" and code == 200 and r.json().get("accepted") != 1:
            code = "200-rejected"
    except Exception as e:  # noqa: BLE001
        code = type(e).__name__
    acc["lat"].append((time.perf_counter() - due) * 1000)
    acc["codes"][str(code)] = acc["codes"].get(str(code), 0) + 1
    if code != 200:
        acc["err"] += 1


def flushbench():
    """Cost of one flush at the target rate: 2 s of data = 400 points from 400 chefs (one INSERT + one upsert)."""
    _guard()
    from sqlalchemy import func, select

    from app.core import clock
    from app.core.database import SessionLocal
    from app.models import Chef, ChefLastLocation
    from app.services import tracking
    db = SessionLocal()
    chef_ids = db.scalars(select(Chef.id).order_by(Chef.id).limit(400)).all()
    times = []
    for rnd in range(20):
        now = clock.now()
        with tracking._lock:
            for k, cid in enumerate(chef_ids):
                p = tracking.Point(0, cid, 12.9 + k * 1e-4, 77.6, 8.0, now + timedelta(milliseconds=rnd))
                tracking._buffer.append(p)
                tracking._last[cid] = p
                tracking._dirty.add(cid)
        t = time.perf_counter()
        tracking.flush(db)
        times.append((time.perf_counter() - t) * 1000)
    t = time.perf_counter()
    for cid in chef_ids[:200]:
        db.get(ChefLastLocation, cid)
        db.expunge_all()
    lookup = (time.perf_counter() - t) * 1000 / 200
    n = db.scalar(select(func.count()).select_from(ChefLastLocation))
    print(json.dumps({"flush_400_points_ms": {"p50": round(statistics.median(times), 1), "max": round(max(times), 1)},
                      "flush_capacity_points_per_s": round(400 / (statistics.median(times) / 1000)),
                      "current_location_lookup_ms_avg": round(lookup, 2), "chef_last_locations_rows": n}))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "seed":
        seed()
    elif cmd == "run":
        res = asyncio.run(_run(sys.argv[2], json.loads(Path(sys.argv[3]).read_text()), float(sys.argv[4]) if len(sys.argv) > 4 else 60))
        out = sys.argv[5] if len(sys.argv) > 5 else f"../loadtest/results-part-e-{int(time.time())}.json"
        Path(out).write_text(json.dumps(res))
        print(json.dumps({k: v for k, v in res.items() if k != "_raw"}, indent=2))
    elif cmd == "merge":  # merge raw results of several driver processes run in parallel
        parts = [json.loads(Path(f).read_text()) for f in sys.argv[2:]]
        secs = max(x["duration_s"] for x in parts)
        merged = {"processes": len(parts), "duration_s": secs, "offered_ingest_rps": sum(x["offered_ingest_rps"] for x in parts)}
        for key in ("ingest", "live_view"):
            lat = [v for x in parts for v in x["_raw"][key]["lat"]]
            codes: dict = {}
            for x in parts:
                for c, n in x["_raw"][key]["codes"].items():
                    codes[c] = codes.get(c, 0) + n
            merged[key] = {**_stats(lat, sum(x["_raw"][key]["err"] for x in parts), secs), "status_codes": codes}
        print(json.dumps(merged, indent=2))
        Path(f"../loadtest/results-part-e-{int(time.time())}.json").write_text(json.dumps(merged, indent=2))
    elif cmd == "flushbench":
        flushbench()
