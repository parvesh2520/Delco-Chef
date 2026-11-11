# Performance — Part I

Dataset (`backend/scripts/seed_perf.py`, local Docker Postgres, never Neon): 10,500 users, 500 chefs,
60,000 bookings, 2,000,000 location points over 90 days around Bengaluru. Generated in 13 s.

## Baseline (before) — `quick_bench.py`, 50 concurrent workers, 20 s each, one uvicorn process on a laptop

| Endpoint | req/s | p50 ms | p95 ms | p99 ms | errors |
|---|---|---|---|---|---|
| (a) booking history, 20/page | 57.5 | 752.8 | 2048.3 | 3057.0 | 0% |
| (b) ranked suggestions | 37.1 | 1182.1 | 2678.5 | 3542.2 | 0% |
| (c) location ingest | 160.4 | 285.2 | 441.6 | 2166.4 | 0% |
| (d) admin queue with filters | 10.0 | 5800.5 | 8218.7 | 10032.4 | 0% |
| (e) admin stage summary | 138.3 | 325.9 | 508.8 | 2282.2 | 0% |

## Diagnosis

`plans/*-before.txt`: the SQL already used index scans (queue 0.16 ms, history 0.12 ms, busy-chef lookup 5.7 ms),
so indexes were not the problem. Counting statements per request showed the real cost:

| Endpoint | Before | After | Change |
|---|---|---|---|
| (d) admin queue, 50 rows | 304 queries | 11 queries | `Prefetch` batch-loads customers, addresses, trials, visits, chef names, subscriptions, off-day conflicts |
| (a) history, 20 rows | 39 queries (6 rows) | 4 queries | status read from the stage; subscriptions in one `IN` query |
| (b) suggestions | 12 queries, 201 chefs / 66 KB | 12 queries, 80 chefs | return all eligible + the 30 nearest excluded (with reasons) |

## After

Re-running the 2-minute k6 suite (`k6.js`) for after-latency numbers is **still to do**. It was not re-run in this
session. Expected effect: the queue drops by about the round-trip count (304 → 11).

Not optimised, and why: location ingest (it is already buffered in memory and written in batches; the remaining cost is
per-request auth, which needs Redis-cached sessions); stage summary (5 indexed counts; cache for 30 s if needed).
