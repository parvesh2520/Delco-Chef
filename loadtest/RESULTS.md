# Performance: Part I

Everything below ran on one laptop (20 logical CPUs, Docker Desktop with 7.6 GB). The API ran in Docker from
`backend/Dockerfile`, against PostgreSQL 17 in Docker. k6 also ran in Docker on the same network. Neon and production
were never used. Another project's containers were also running on the laptop during these runs, so the numbers are
slightly pessimistic.

## I1. Dataset

`python -m scripts.seed` loads the small fixed datasets from Parts B, C and G. `python -m scripts.seed_perf` then adds:

| | Rows |
|---|---|
| Customers | 10,005 |
| Chefs | 510 |
| Bookings (requests, one visit each) | 60,005 requests, 60,038 visits |
| Location points | 2,000,000 |

The data covers the last 90 days around Bengaluru. Bookings have a seeded long tail: most customers have a few
bookings, regulars have dozens, the busiest has 127, and the median is 5. `setseed` makes every run produce the same
spread. Seeding takes about 15 s.

## I2. Measure, then fix

Each endpoint was measured with k6 (`k6.js`) at 50 virtual users for 2 minutes. The token customer is the busiest one,
so (a) returns a full page of 20.

| Run | What changed | Raw results |
|---|---|---|
| 1 (before) | Code as committed, 1 API process (the Dockerfile default) | `results-i2-run1-raw.json.gz`, `-summary.json` |
| 2 | Query and code fixes below, still 1 process | `results-i2-run2-raw.json.gz`, `-summary.json` |
| 3 (after) | Fixes + 8 web processes and 1 jobs process | `results-i2-run3-raw.json.gz`, `-summary.json` |

`python summarise.py <raw file>` reproduces the tables below from the raw files. All three runs had 0 errors.

### Before (run 1)

| Endpoint | req/s | p50 ms | p95 ms | p99 ms | Target p95 |
|---|---|---|---|---|---|
| (a) booking history, 20/page | 316 | 152 | 273 | 371 | 300 ✅ |
| (b) ranked suggestions | 41 | 1,223 | **2,089** | 2,907 | 500 ❌ |
| (c) location ingest | 620 | 78 | 115 | 130 | 200 at 200 req/s ✅ |
| (d) admin queue with filters | 89 | 562 | **960** | 1,314 | 300 ❌ |
| (e) admin stage summary | 122 | 406 | **697** | 960 | 300 ❌ |

### Why: query plans (`plans/`)

`EXPLAIN (ANALYZE, BUFFERS)` was saved before and after each fix.

- **(b) suggestions** (`suggest-before.txt` → `suggest-after.txt`)
  - Problem: the busy-chef lookup filtered `starts_at < window end` but had no lower bound on the indexed column. The
    `(chef_id, starts_at)` index therefore read every past visit of every nearby chef: 55,818 rows to return 0.
  - Fix: add `starts_at > window start − 1 day` (no visit lasts a day).
  - Result: 8.8 ms → 0.95 ms, reading 1 row.
  - Python profiling also showed about 1,350 ORM objects built per call: full `Chef` rows plus a selectin-loaded
    `ChefSkill` object per skill. Selecting only the needed columns and the skills as plain tuples cut one call from
    41 ms to 26 ms.
- **(e) stage summary** (`summary-before.txt` → `summary-after.txt`)
  - Problem: seven separate full scans of `service_requests`, 43 ms of database time.
  - Fix: one scan grouped by stage, with totals summed in Python. It now takes 17 ms.
- **(d) admin queue** (`queue-before.txt`, `queue-after.txt`)
  - The query itself is index-backed (0.35 ms). Its earlier cost was 304 per-row queries, already cut to 11 by
    `Prefetch`.
  - What remains is about 17 ms of Python per request, building 50 rows of JSON.

### The real limit: one process

With 50 users each sending the next request as soon as the last returns, latency ≈ 50 ÷ throughput. One Python
process gives 40–120 req/s on these endpoints, which means 0.4–1.2 s of queueing, however fast each query is. Run 2
shows this: the fixes doubled throughput for (b) and (e), but the p95 targets were still missed.

| Endpoint | p95 run 1 → run 2 | req/s run 1 → run 2 |
|---|---|---|
| (b) suggestions | 2,089 → 1,168 ms | 41 → 73 |
| (e) stage summary | 697 → 355 ms | 122 → 241 |
| (d) admin queue | 960 → 1,016 ms (no change) | 89 → 84 |

The fix is horizontal scaling. The API is stateless, except for two parts:

1. **The location buffer.** Each process keeps its own buffer in memory. It used to be flushed only by the
   background-job loop, so a web process with `RUN_WORKERS=false` would have kept its points in memory until
   shutdown. Every process now flushes its own buffer (`worker.start(jobs=...)`), and only `RUN_WORKERS=true` runs the
   outbox and the scheduled jobs.
2. **The jobs.** One container runs with `RUN_WORKERS=true`. The web container runs with `RUN_WORKERS=false` and
   `WEB_CONCURRENCY=8`, which sets uvicorn's worker count.

8 processes × (pool 5 + overflow 5) + the jobs process = 90 connections, which is under PostgreSQL's 100.

### After (run 3): every target met

| Endpoint | req/s | p50 ms | p95 ms | p99 ms | Target p95 | Change in p95 |
|---|---|---|---|---|---|---|
| (a) booking history | 1,422 | 36 | **60** | 86 | 300 ✅ | 273 → 60 (−78%) |
| (b) ranked suggestions | 341 | 84 | **352** | 468 | 500 ✅ | 2,089 → 352 (−83%) |
| (c) location ingest | 2,263 | 20 | **46** | 61 | 200 at 200 req/s ✅ | 115 → 46, 11× the required rate |
| (d) admin queue | 409 | 115 | **209** | 248 | 300 ✅ | 960 → 209 (−78%) |
| (e) admin stage summary | 464 | 103 | **174** | 215 | 300 ✅ | 697 → 174 (−75%) |

Every ingested point was written. `location_points` grew from 2,000,000 to 2,416,024, which matches the number of
accepted ingest requests across runs 1–3.

### What I chose not to optimise, and why

- **(d) admin queue.** Its remaining cost is building 50 rows of JSON in Python. Caching it would show admins stale
  assignment state, which is the one place they need it fresh. Scaling covers it.
- **(e) stage summary.** A 30-second cache would make it almost free. I didn't add one because the single scan plus
  scaling already meets the target, and a cache adds invalidation questions for no measured gain. It's the first
  thing to cache if the bookings table grows tenfold.
- **(c) location ingest.** It was already buffered and batch-written. Its remaining cost is authentication on every
  request, which would need sessions cached in Redis, a new service that the target doesn't justify.
- **Authentication on every request** (user plus session lookup, about 3 ms) is the next common cost across all
  endpoints, for the same reason.

## I3. Spike test (`k6-spike.js`)

The traffic mix follows the TV-advert scenario:
- 60% customers opening the app (history and upcoming visits)
- 35% chefs sending location
- 5% admins ranking chefs for the popular evening slot

The request rate rose in steps of 15 s ramp plus 30 s hold: 50 → 100 → 200 → 300 → 400 → 600 → 800 → 1,000 → 1,300 →
1,600 req/s. It used the same 8 + 1 process setup. Raw data: `results-i3-spike-raw.json.gz`. To get per-10-second
numbers, run `python summarise.py results-i3-spike-raw.json.gz --windows`.

| Offered req/s | Served req/s | p50 ms | p95 ms | Errors |
|---|---|---|---|---|
| 200 | 200 | 3 | 18 | 0% |
| 400 | 400 | 4 | 36 | 0% |
| 600 | 599 | 10 | 51 | 0% |
| 800 | 798 | 7 | 45 | 0% |
| 1,000 | 992–1,021 | 35–71 | 179–341 | 0–0.3% |
| 1,300 | ~700, falling | 124–139 | 326 → 60,000 (timeouts) | 1.7% → 8.8% |
| 1,600 | ~90 | 60,000 | 60,000 | 100% |

**It broke at about 1,000 req/s served** (1,300 offered).

**What failed first: the database connection pools.** The log shows 910 errors of the form
`QueuePool limit of size 5 overflow 5 reached, connection timed out, timeout 30.00`. Every process had all 10
connections in use. New requests waited 30 s for one and then failed, and the location flush also waited.
PostgreSQL itself wasn't the limit, but the 100-connection ceiling stops us simply raising each pool.

About 0.5% of ingest requests during the spike returned 200 with `accepted: 0`. This is a test artefact: one chef token
sends about 400 points a second, so points share a timestamp and the server drops any point that isn't newer than the
last accepted one (as designed). No points were lost. A failed flush puts its batch back, and no "buffer full"
warning appeared.

The answer to the spike plan (what fails first, monitoring, the next hour, the next week, cost) is in
[docs/SPIKE_PLAN.md](../docs/SPIKE_PLAN.md).

## How to reproduce

```powershell
docker network create delco-bench-net
docker run -d --name delco-bench --network delco-bench-net -e POSTGRES_USER=delco -e POSTGRES_PASSWORD=delco -e POSTGRES_DB=bench -p 55433:5432 postgres:17-alpine
# backend/: point DATABASE_URL and DIRECT_URL at localhost:55433/bench, and set throwaway SECRET_KEY, FIELD_ENCRYPTION_KEY, HMAC_LOOKUP_KEY
alembic upgrade head; python -m scripts.seed; python -m scripts.seed_perf
python -m scripts.bench_tokens > ../loadtest/tokens.json    # set ACCESS_TOKEN_EXPIRE_MINUTES=600 for long runs
docker build -t delco-api:bench ./backend
docker run -d --name delco-api-bench  --network delco-bench-net -e RUN_WORKERS=false -e WEB_CONCURRENCY=8 <same env> delco-api:bench
docker run -d --name delco-jobs-bench --network delco-bench-net -e RUN_WORKERS=true <same env> delco-api:bench
docker run --rm --network delco-bench-net -v "<repo>/loadtest:/lt" -w /lt grafana/k6:0.54.0 run -e BASE=http://delco-api-bench:8000/api/v1 --out json=/lt/raw.json.gz /lt/k6.js
```
