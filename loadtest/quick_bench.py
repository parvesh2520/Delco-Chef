"""Dependency-light load driver (httpx + threads) for when k6 isn't available. k6.js is the reference run.
python loadtest/quick_bench.py http://localhost:8001/api/v1 loadtest/tokens.json [seconds] [workers]"""
import json
import statistics
import sys
import threading
import time

import httpx

base, tokens_file = sys.argv[1], sys.argv[2]
secs = int(sys.argv[3]) if len(sys.argv) > 3 else 20
workers = int(sys.argv[4]) if len(sys.argv) > 4 else 50
T = json.load(open(tokens_file))
H = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731
ENDPOINTS = {
    "history": ("GET", "/customers/me/history?limit=20", T["customer"], None),
    "suggestions": ("GET", f"/admin/requests/{T['requestId']}/suggestions?date=2026-12-01", T["admin"], None),
    "ingest": ("POST", f"/visits/{T['visitId']}/location", T["chef"], {"points": [{"lat": 12.97, "lng": 77.64, "accuracy": 8}]}),
    "queue": ("GET", "/admin/requests?status=closed&service=custom_time&limit=50", T["admin"], None),
    "stage_summary": ("GET", "/admin/stage-summary", T["admin"], None),
}
only = sys.argv[5].split(",") if len(sys.argv) > 5 else list(ENDPOINTS)
results = {}
for name in only:
    method, path, tok, body = ENDPOINTS[name]
    lat, errors, stop = [], [0], time.time() + secs

    def run():
        with httpx.Client(base_url=base, headers=H(tok), timeout=30) as c:
            while time.time() < stop:
                t = time.perf_counter()
                try:
                    r = c.request(method, path, json=body)
                    ok = r.status_code < 400
                except httpx.HTTPError:
                    ok = False
                lat.append((time.perf_counter() - t) * 1000)
                if not ok:
                    errors[0] += 1
    th = [threading.Thread(target=run) for _ in range(workers)]
    [t.start() for t in th]
    [t.join() for t in th]
    q = statistics.quantiles(lat, n=100)
    results[name] = {"requests": len(lat), "rps": round(len(lat) / secs, 1), "p50_ms": round(q[49], 1), "p95_ms": round(q[94], 1),
                     "p99_ms": round(q[98], 1), "error_rate": round(errors[0] / max(len(lat), 1), 4)}
    print(name, results[name], flush=True)
json.dump(results, open(f"loadtest/results-{int(time.time())}.json", "w"), indent=2)
