# Spike plan (Part I3)

**Scenario.** A TV advert pushes traffic to 50× normal for two hours. Three things happen at once:
- About 5,000 customers open the app. Each opening makes about 5 calls, so roughly 800 req/s for the first minute.
- 1,000 chefs send their location every 5 s, which is 200 req/s of writes.
- Many customers try to book the same evening slot.

The numbers in this note come from `loadtest/RESULTS.md`.

## What fails first, and how we would know

1. **Database connection pools.** In the spike test, 8 API processes served about 1,000 req/s cleanly. At 1,300 req/s
   every process had all 10 of its connections in use (pool 5 + overflow 5). Requests then waited 30 s for a
   connection and failed (`QueuePool limit … timeout 30`), and served traffic collapsed from 1,000 to 90 req/s.
   PostgreSQL itself was not saturated. The wait for a connection is what broke.
2. **The free host, much sooner.** Production runs on one small free-tier instance, about a tenth of one laptop core.
   It will hit the same queueing at a few dozen req/s, well before the database.
3. **The popular slot.** Booking is correct under load: the `ex_visits_chef_no_overlap` constraint and row locks make
   the losers get `ASSIGN_CONFLICT`. But each loser still costs a full request, and admins see a long manual queue.

**Monitoring and alerts** (Render metrics and log alerts now; Grafana Cloud's free tier for dashboards):
- p95 latency per route above 500 ms for 2 minutes.
- 5xx rate above 1% for 1 minute.
- Any `QueuePool limit` or `connection timed out` log line. This is the earliest warning; it fired 30 s before the
  collapse.
- Database: active connections above 80% of the maximum, CPU above 75%, replica lag above 5 s.
- `Location buffer full` warnings, or location flush failures. Points are kept in memory up to 100,000; beyond that
  the oldest are dropped.
- Business checks: bookings per minute, and `ASSIGN_CONFLICT` per minute (the popular-slot fight).

## What I would change in the next hour (configuration only, no code)

- **Stateless servers and horizontal scaling.** Move the web service to 3–4 Standard instances with
  `RUN_WORKERS=false` and `WEB_CONCURRENCY=2` each. Run exactly one instance with `RUN_WORKERS=true` for the outbox
  and scheduled jobs. Every process flushes its own location buffer, so web instances are disposable.
- **Connection pooling.** Point the web services at Neon's pooled (PgBouncer) URL, which we already use. Set
  `DB_POOL_SIZE=5`, `DB_MAX_OVERFLOW=0` and a short pool timeout, so a request fails in 2–3 s instead of hanging for
  30 s. Many app processes then share a small number of real database connections.
- **Graceful degradation**, switching things off in this order:
  1. Data exports (`build_export` jobs).
  2. The admin stage summary and booking history beyond page 1.
  3. Lower location frequency to one point every 15 s, which cuts ingest by 3×. The app already batches points, so
     nothing is lost.
  4. Customer live-tracking polls: return the last position and a `Retry-After`.

  Booking and check-in stay on until the very end.
- **Rate limiting.** Limit by IP at the edge, and per user in the API (a small token bucket). Return `429` with
  `Retry-After`. Today the app treats a 429 as temporary only when refreshing a session, where it keeps the user
  signed in. A general back-off on `Retry-After` is a next-week change.

## What I would change in the next week (code)

- **Caching.** Keep sessions and the settings row in Redis (Upstash) for 30 s. Authentication is now the biggest
  per-request cost common to every endpoint. Cache stage summary and service lists for 30 s. Booking-specific data is
  never cached.
- **Read replicas.** Send booking history, admin lists and stage summary to a Neon read replica. Writes, booking and
  assignment stay on the primary.
- **Queues and batching for location.** Write location ingest to a queue (Redis stream or Upstash QStash), and have
  one consumer insert every 2 s with `COPY`. The API then only authenticates and appends, so it doesn't depend on the
  database at all. At 1 billion rows, partition `location_points` by month (`recorded_at`), drop partitions after
  90 days and archive them to object storage.
- **The popular slot.** Add a "hold" step: reserve the slot for 2 minutes with a short lock in Redis, then confirm.
  Customers see "slot full" instantly instead of losing at the final database constraint.
- **CDN for static content.** Chef photos and documents go to S3/R2 behind Cloudflare. They are served with short-lived
  signed URLs, so they leave the API entirely. App bundles already come from the stores and Expo's CDN.
- **Autoscaling.** Minimum 2 instances, maximum 8, target 60% CPU. Scale up after 60 s above target, scale down after
  10 minutes below it, so instances don't flap during a two-hour spike. Alert when the maximum is reached.

## What it would cost

These are approximate list prices; check them before buying. Free-tier limits change.

| Item | During the spike | Per month if kept |
|---|---|---|
| Render web: 4 × Standard (1 CPU, 2 GB) + 1 jobs instance | about $5 for two hours (billed by the second) | about $125 |
| Neon: Launch or Scale plan with a read replica | autoscaled compute hours | $19–$69 plus usage |
| Upstash Redis, pay as you go | under $1 | under $10 at this traffic |
| Cloudflare CDN + R2 storage | $0 (free tier) | a few dollars |
| Grafana Cloud monitoring | $0 (free tier) | $0 |

**Total:** under $10 for the two-hour spike, if autoscaling scales down afterwards. About $150–$200 a month to keep
the capacity ready.
