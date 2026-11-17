"""Summarise k6 raw output (--out json=...gz).

    python summarise.py results-i2-run2-raw.json.gz            # per scenario: req/s, p50/p95/p99, error rate
    python summarise.py results-i3-spike-raw.json.gz --windows  # per 10 s window: offered/served req/s, p95, errors
"""
import gzip
import json
import sys
from collections import defaultdict
from datetime import datetime


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))] if xs else 0.0


def load(path):
    """Yields (time, scenario, duration ms, failed) per HTTP request."""
    failed = {}
    rows = []
    with gzip.open(path, "rt") as f:
        for line in f:
            d = json.loads(line)
            if d.get("type") != "Point":
                continue
            m, data = d["metric"], d["data"]
            key = (data["time"], data["tags"].get("scenario"), data["tags"].get("url"))
            if m == "http_req_duration":
                rows.append((key, data["value"]))
            elif m == "http_req_failed":
                failed[key] = data["value"]
    for key, ms in rows:
        t = datetime.fromisoformat(key[0][:26].rstrip("Z"))
        yield t, key[1], ms, bool(failed.get(key, 0))


def per_scenario(path):
    by = defaultdict(list)
    for t, sc, ms, bad in load(path):
        by[sc].append((t, ms, bad))
    print("| Endpoint | req/s | p50 ms | p95 ms | p99 ms | errors |")
    print("|---|---|---|---|---|---|")
    for sc, xs in by.items():
        secs = max((max(t for t, _, _ in xs) - min(t for t, _, _ in xs)).total_seconds(), 1)
        ms = [m for _, m, _ in xs]
        err = sum(b for _, _, b in xs) / len(xs) * 100
        print(f"| {sc} | {len(xs) / secs:.1f} | {pct(ms, 50):.1f} | {pct(ms, 95):.1f} | {pct(ms, 99):.1f} | {err:.2f}% |")


def windows(path):
    by = defaultdict(list)
    start = None
    for t, _, ms, bad in load(path):
        start = start or t
        by[int((t - start).total_seconds() // 10)].append((ms, bad))
    print("| t (s) | served req/s | p50 ms | p95 ms | errors |")
    print("|---|---|---|---|---|")
    for w in sorted(by):
        xs = by[w]
        ms = [m for m, _ in xs]
        print(f"| {w * 10} | {len(xs) / 10:.0f} | {pct(ms, 50):.0f} | {pct(ms, 95):.0f} | {sum(b for _, b in xs) / len(xs) * 100:.1f}% |")


if __name__ == "__main__":
    (windows if "--windows" in sys.argv else per_scenario)(sys.argv[1])
