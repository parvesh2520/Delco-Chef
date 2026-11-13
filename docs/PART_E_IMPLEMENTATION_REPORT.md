# Part E — Live Chef Tracking: Implementation Report

Date: 13 Nov 2026. Scope: Part E of `Delco Chefs Developer Assignment.pdf` (section 9). Nothing was committed or pushed.
Neon was never contacted: every test and load test ran against a disposable local PostgreSQL 18 on `:55432`.

Status legend: **DONE AND VERIFIED** (automated tests or measurements prove it) · **IMPLEMENTED BUT NOT DEVICE-VERIFIED**
(code compiles, bundles and is unit-checked, but needs a real Android phone) · PARTIALLY IMPLEMENTED · NOT IMPLEMENTED ·
BLOCKED · STRETCH.

> The PDF's E-numbering differs from the task brief's: in the PDF, **E4 is realtime delivery, E5 is buffered writes and
> E6 is the 30-day retention job**. This report follows the PDF. The brief's extra items (stale detection, ETA, load test,
> background permissions) are covered in their own sections.

---

## 1. Requirement mapping (PDF section 9)

| ID | Requirement (PDF) | Status | Evidence |
|---|---|---|---|
| Rule | Chef taps "Start travel"; app sends location every 5 s; queues points when offline and sends them when the connection returns | IMPLEMENTED BUT NOT DEVICE-VERIFIED | `mobile/src/features/tracking/index.ts`. The server side of queued batches (backlog, dedupe) is verified by tests. |
| Rule | Visible only from 15 min before start until check-in, only while travelling, only for the customer's own booking; specific error codes outside the window | DONE AND VERIFIED | `tracking.snapshot`. Tests: `test_window_boundary_and_refusals`, `test_tracking_ends_on_check_in_and_cancellation`, `test_reassignment_hides_the_previous_chef`, `test_booking_time_change_moves_the_window` |
| Rule | ETA computed **on the server** from **straight-line** distance and an admin-configurable average speed (default 20 km/h); no paid routing per update | DONE AND VERIFIED | `test_eta_formula_known_distance`, `test_eta_in_snapshot_uses_configured_speed` |
| Rule | Route line: a routing call at most once per booking, **or skipped** | DONE AND VERIFIED (skipped) | No Directions/Routes API calls. A dashed straight line is drawn and labelled "straight-line distance, not the road route". |
| Rule | Raw points deleted after 30 days; only the last position per chef kept for the live view | DONE AND VERIFIED | `purge_old` (daily worker job) + `chef_last_locations` (primary key = `chef_id`). `test_purge_deletes_points_older_than_30_days` |
| **E1** | Chef app: start/stop travel, send every 5 s, handle denied permission, handle background (explain limits) | IMPLEMENTED BUT NOT DEVICE-VERIFIED | Android foreground-service task (section 8). Permanent denial leads to Settings. |
| **E2** | Ingest endpoint, cheap per call, validates the sender is the chef assigned to an active booking | DONE AND VERIFIED | One auth query plus a cached ownership check. 9 ingest tests; measured p95 67 ms at 200 req/s |
| **E3** | Customer map: moving chef marker, destination marker, ETA text, "Reconnecting…" after 30 s, "Tracking starts 15 minutes before your visit" | IMPLEMENTED BUT NOT DEVICE-VERIFIED | `track.tsx`, `LiveMap.tsx`. Server rules are tested; client rules are checked by `mobile/scripts/check-tracking-polling.mjs` |
| **E4** | Realtime delivery by WS/SSE/efficient polling; state why and how it behaves with 1,000 chefs | DONE AND VERIFIED | Polling, see section 14. Measured: 200 ingest req/s + 10 poll req/s, 0 errors |
| **E5** | Don't write every point to the main DB in the request path; buffer/batch | DONE AND VERIFIED | In-memory buffer, then one multi-row INSERT plus one multi-row upsert every 2 s. A 400-point flush takes 35 ms (p50) |
| **E6** | Scheduled job deleting points older than 30 days | DONE AND VERIFIED | `worker._loop` → `tracking.purge_old` daily, batched deletes using a BRIN index |
| **E7** | Smooth marker movement | STRETCH — IMPLEMENTED BUT NOT DEVICE-VERIFIED | Tween only between two real fixes ≤ 6 s apart; never on stale data |

PDF acceptance tests:

| Acceptance test | Result |
|---|---|
| 3 chefs × 60 points; a customer sees only their own chef | DONE AND VERIFIED: `test_acceptance_three_chefs_sixty_points` (plus the existing `test_tracking_window_and_isolation`) |
| Another customer's booking is refused | DONE AND VERIFIED: 404 (the visit's existence is not revealed) |
| 20 min before start → "not available yet" | DONE AND VERIFIED: `TRACKING_NOT_AVAILABLE_YET` (409) with `availableAt` |
| After check-in → "tracking ended" | DONE AND VERIFIED: `TRACKING_ENDED` (409) |
| Simulator stopped 35 s → "Reconnecting" | Server DONE AND VERIFIED (`test_stale_threshold_is_30_seconds`: `stale: true`, `reason: "Reconnecting…"`, no ETA). Client state is unit-checked; screen IMPLEMENTED BUT NOT DEVICE-VERIFIED |

## 2. Gap analysis: what existed and what was wrong

Part E was largely built before this task. The audit found these defects, all now fixed:

| # | Gap found | Risk | Fix |
|---|---|---|---|
| 1 | **Server deadlock at load.** Sync `Depends(get_db)` dependencies and the sync endpoint ran as separate threadpool tasks. A request held a pooled DB connection while waiting for a thread; every thread was waiting for a connection. Reproduced at 200 req/s: all 10 connections "idle in transaction", server unresponsive until the 30 s pool timeout | Outage under the assignment's own load target | Ingest and the live view now authenticate, work and close the session inside **one** threadpool call |
| 2 | Ingest capacity ≈109 req/s (p95 62 s) against 200 offered | Target missed | Fix 1, plus a one-query auth path (`approved_chef_id`), plus a 30 s ownership cache (a 5 s TTL missed on almost every 5 s send) |
| 3 | Live position keyed by **visit**. After a chef stopped travel and was reassigned, the visit could still show the previous chef's position | Privacy: another person's location | Live position is keyed by **chef**. The snapshot shows it only if it belongs to *this* visit, *this* assigned chef and *this* trip (not before `travel_started_at`) |
| 4 | Future timestamps were clamped to "now" (fabricated time). Points from before travel started were accepted. No dedupe, so a retried batch inserted duplicate rows. NaN accuracy and `(0,0)` were accepted | Wrong or duplicate data | Strict per-point validation (section 11). Dedupe by timestamp per chef/visit. Response is `{accepted, rejected}` |
| 5 | ETA was returned for **stale** positions | Fake ETA | `etaMinutes: null` when stale or missing; `0` + `arriving: true` inside the check-in radius |
| 6 | Flush cleared the buffer before writing, so a DB error lost the batch. One upsert statement per chef. In-memory maps grew forever | Data loss, memory growth | The batch is restored on failure (bounded at 100k points), there is one multi-row upsert, and maps are pruned |
| 7 | Map rebuilt the whole WebView on each 5 s poll (flicker, no "moving" marker). The Google Maps SDK was configured but unused | E3 quality | `LiveMap`: loads once, moves the marker only, uses the Google Maps SDK when a key exists |
| 8 | Client showed the last marker as live when the network died. Tight default retries. Polled every 5 s even before the window opened | Misleading UI, wasted requests | Client freshness rules, backoff 5→60 s, window-aware polling |
| 9 | Chef sharing stopped when the app was backgrounded, kept retrying forever after check-in, and handled denied permission only on the start screen | E1 | Foreground-service task, stop on terminal server answers, permanent-denial path to Settings |

## 3. Existing functionality reused (not duplicated)

- Tables `location_points` and `chef_last_locations`, their indexes (`visit_id, recorded_at` B-tree; `recorded_at` BRIN), and the initial migration. **No schema change.**
- Endpoints `POST /visits/{id}/travel/start|stop`, `POST /visits/{id}/location`, `GET /visits/{id}/tracking`. No new endpoints.
- The background worker (2 s location flush, daily retention) and admin settings (`tracking_window_min`, `avg_speed_kmh`, `ping_interval_s`, `stale_after_s`, `checkin_radius_m`).
- Part D check-in already calls `tracking.forget_visit`. Part D attendance is untouched.
- `domain/geo.py` (`haversine_km`, `eta_minutes`). The existing WebView map, kept as the no-key fallback.

## 4. Backend changes

| File | Change |
|---|---|
| `app/services/tracking.py` | Rewritten in place, same public functions. Per-chef live map, strict validation, dedupe, `{accepted, rejected}` result, stale-aware snapshot (`ageSec`, `arriving`, `status`, `staleAfterSec`, `accuracyM`), loss-safe single-statement flush, pruning |
| `app/api/deps.py` | New `approved_chef_id(request, db)`: same checks as `current` + `chef_only` + `approved_chef` in one SQL query without ORM entities |
| `app/api/v1/endpoints/visits.py` | `ingest` and `track` run in one threadpool call each (see gap 1). Same auth outcomes (401/403/404) |
| `tests/conftest.py` | Also resets `tracking._dirty` between tests |
| `tests/test_part_e.py` | **New**, 19 tests |
| `loadtest/location_ingest.py`, `loadtest/run_part_e.sh` | **New** load test (section 15) |

Behaviour change: `POST /visits/{id}/location` now returns `{"accepted": n, "rejected": m}` (previously `{"accepted": n}`).
The mobile client was the only consumer and was updated.

## 5. Mobile changes

| File | Change |
|---|---|
| `src/features/tracking/index.ts` | Background task `delco-chef-travel-location`, one shared queue/sender, backoff, stop on terminal errors, `startSharing` / `stopSharing`, `LocationDeniedError.permanent` (existing exports kept) |
| `src/features/tracking/polling.ts` | **New**. Pure poll-interval and freshness rules |
| `src/components/LiveMap.tsx` | **New**. Google Maps SDK map with an animated chef marker, plus the WebView fallback |
| `app/customer/visit/[id]/track.tsx` | Rewritten. Phases: live / updating / arriving / waiting / stale (Reconnecting…) / connection interrupted. "Tracking starts 15 minutes before your visit" with the opening time; not-started; ended |
| `app/customer/visit/[id]/eta.tsx` | No ETA from stale data; arriving state; stops polling after the end |
| `app/chef/(approved)/visit/[id]/travelling.tsx` | Mode notice (background / foreground-only), queued count, last sent, denied → Allow / Open settings, stops sharing on "I've arrived" |
| `app/_layout.tsx` | Imports the tracking module so the task is defined at startup |
| `src/types`, `src/services/visit.service.ts`, `src/constants`, `src/components/index.ts` | Snapshot type (nullable ETA/updatedAt, new fields), `availableAt`, `googleMapsConfigured` flag |
| `app.config.js` | Foreground-service permissions, `ACCESS_BACKGROUND_LOCATION` blocked, `extra.googleMapsConfigured` |
| `package.json` / lock | **+1 dependency: `expo-task-manager ~58.0.14`**, installed with `expo install`. It is expo-location's declared peer for background tasks and cannot be avoided for E1 background handling |
| `scripts/check-tracking-polling.mjs` | **New**. Node assertions for the client rules |

## 6. Database changes

None. `alembic heads` / `alembic current` = `e66cdf57002d (head)`, and `alembic check` reports "No new upgrade operations
detected" (local test DB). **No production migration is needed for Part E.**

Not added, deliberately: a `received_at` column on `location_points`. The server already rejects device timestamps more
than 30 s ahead and uses its receive time when none is sent, so the column would add write cost and a migration without
changing any rule. The travel state lives on `visits.status` / `travel_started_at` / `travel_stopped_at`.

## 7. API endpoints (all existing)

| Endpoint | Who | Rules |
|---|---|---|
| `POST /visits/{id}/travel/start` | Assigned approved chef | Visit `scheduled`, ≤ 3 h before start |
| `POST /visits/{id}/travel/stop` | Assigned approved chef | Back to `scheduled` |
| `POST /visits/{id}/location` | Assigned approved chef, visit `chef_travelling` | 1–120 points. Customers get 403; other chefs and unknown visits get 404; not travelling gets 409 `TRACKING_NOT_ACTIVE` |
| `GET /visits/{id}/tracking` | Owning customer only | 404 not theirs · 409 `TRACKING_NOT_AVAILABLE_YET` (+`availableAt`) · `TRACKING_NOT_STARTED` · `TRACKING_ENDED`. Returns the latest position only, **never history** |

Not added: an admin tracking view (not in the PDF; it would widen who can see live location).

## 8. Background location configuration (E1)

**Design: a user-started Android foreground service, with "while using the app" permission only.**

- When the chef starts travel, `Location.startLocationUpdatesAsync` starts a foreground service with a persistent
  notification ("Sharing your location"). It requests `Accuracy.High`, `timeInterval: 5000` and `distanceInterval: 0`.
- From expo-location's Android source (`LocationModule.kt`): *"As a user-initiated foreground service with notification,
  this does NOT require the background location permission."* So `ACCESS_BACKGROUND_LOCATION` ("Allow all the time") is
  **not requested and is explicitly removed** from the manifest. This is the privacy-friendliest option and avoids
  Google Play's background-location review.
- Fixes keep arriving with the screen off or another app (Google Maps) in front. They go to the same queue as foreground fixes.
- **Stops** on: "I've arrived" (stop travel), any server 409/404/403 (checked in, reassigned, cancelled, not travelling),
  or the app being swiped away (`killServiceOnDestroy: true`). Sharing never runs outside a travelling visit.
- **Fallback:** if the service can't start (Expo Go, iOS without a background mode), it uses `watchPositionAsync`
  (foreground only), and the chef screen shows a warning to keep the app open.

**Limits (explained to the chef on screen and here):**
1. Swiping the app away ends sharing. Reopening the travelling screen resumes it.
2. Aggressive OEM battery managers (Xiaomi/MIUI, Oppo/ColorOS, Vivo, Samsung "deep sleep") can still throttle or kill
   foreground services. The chef should set Delco Chefs battery usage to "Unrestricted" (manual; documented in section 17).
3. **Expo Go cannot run it.** A development build or a new EAS APK is required, because the config/native permissions
   changed and `expo-task-manager` is a new native module.
4. If Android kills the process, unsent queued points (at most 10 minutes) are lost. The live view only needs the latest
   point, and the next fix restores it.
5. iOS background mode is not enabled (Android is the target). On iOS it falls back to foreground sharing.

## 9. Android permission requirements

Verified with `npx expo config --type introspect`:

| Permission | Why |
|---|---|
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | GPS fix (requested at runtime as "while using the app") |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | Android 14+ foreground service of type `location` (declared by expo-location's library manifest) |
| `POST_NOTIFICATIONS` | Android 13+ shows the service notification. If denied, the service still runs but the notification is hidden from the shade |
| `ACCESS_BACKGROUND_LOCATION` | **Removed** (`tools:node="remove"`) |

Runtime flow: "Start travel" requests foreground permission. On denial the chef sees "Allow location" (it can ask again)
or "Open settings" (permanently denied, `canAskAgain === false`). Permission revoked mid-trip: the OS stops delivering
fixes, the server marks the position stale after 30 s, and the customer sees "Reconnecting…".

## 10. Battery and network trade-offs

- GPS runs only during `chef_travelling`. It is off before travel, after arrival, after check-in, and after cancellation
  or reassignment (the server refuses, so the client stops).
- **The 5 s interval is not reduced, and unchanged positions are still sent.** The PDF requires 5 s, and the heartbeat is
  what lets the customer distinguish "chef waiting at a signal" from "connection lost". Cost: about 720 small requests
  per hour of travel (≈150 bytes each), with high-accuracy GPS for that hour.
- One request in flight at a time. Each fix triggers one send of everything queued (offline backlog goes in one batch,
  newest 120 points kept). Failures back off 5 → 10 → 20 → 40 → 60 s. When the app returns to the foreground it sends
  immediately.
- Customer: polls every 5 s only while the screen is open and the app is foregrounded (react-query focus manager).
  Before the window opens it waits until `availableAt` (checked at most every 60 s); not started → 10 s; ended → stops;
  failures → 5→60 s backoff. The map is not re-rendered per poll: only the marker moves.

## 11. Security and privacy controls

- **Ownership on the server.** Ingest accepts only the JWT's approved chef who is the visit's current `chef_id`, while
  the visit is `chef_travelling`. Customers cannot submit chef coordinates (403). The live view is customer-only, for
  their own visit (404 otherwise), inside the window, while travelling.
- **One chef's position can never overwrite another's**: the live map and `chef_last_locations` are keyed by `chef_id`.
  Concurrency was tested with 4 threads × 50 points.
- **Wrong-trip positions are hidden**: the position must match the visit, the assigned chef, and be no older than this
  trip's `travel_started_at`. This covers reassignment and stop/restart.
- **No history exposed**: the customer response contains one position, never the trail.
- **Point validation:** finite numbers; lat ∈ [-90, 90], lng ∈ [-180, 180]; `(0,0)` rejected; accuracy optional but
  0–1000 m if sent; timestamp must be ISO-8601 *with a time zone*, ≤ 30 s in the future, ≤ 10 min old, and not before
  travel started. Invalid points are counted as `rejected` and dropped, so one bad point never blocks a queued batch and
  the client never retries a poison batch. Structurally malformed bodies get 422. JSON `NaN`/`Infinity` are rejected
  (tested).
- Revoked session, disabled user, and non-approved chef are all refused by the lean ingest auth (tested).
- Retention: raw points are deleted after 30 days. The Maps key is build-time only; the JS bundle gets only a boolean.

## 12. ETA calculation

`ETA minutes = ceil(haversine_km(chef, destination) / avg_speed_kmh × 60)`, with `avg_speed_kmh` = 20 by default
(admin setting, range 5–80).

- **Straight-line (haversine)**: the PDF says "computed on the server from straight-line distance". This is not a
  substitute for road distance; it is the specified definition.
- Never negative; at least 1 minute while outside the check-in radius. Inside the radius (default 200 m): `etaMinutes: 0`,
  `arriving: true`, and the UI says "Any moment".
- Stale (> 30 s) or no position → `etaMinutes: null`; the UI shows "—" and explains why.
- Recalculated on every poll from the latest valid fix. The UI says it is approximate.
- Verified: 0.1° of latitude = 11.12 km → 34 min at 20 km/h; changing the setting to 40 km/h halves it.

## 13. Stale-location handling

- Server: `ageSec = now − recorded_at`; `stale = ageSec > stale_after_s` (30). Stale responses keep the last position
  (for a grey "last seen" marker) but have no ETA and carry `reason: "Reconnecting…"`. Tested at 30 s (fresh) and 35 s (stale).
- Client (`polling.ts`): the view is also *interrupted* if the last successful answer is older than 30 s or the latest
  request failed. A dead network therefore never looks live, even though the server's last answer said "fresh". A
  timer re-evaluates every 5 s without a response.
- Customer states: Live location · Updating location… · Your chef is arriving · Location unavailable (travelling, no
  fix yet) · Reconnecting… (stale) · Connection interrupted — reconnecting… · Live tracking has ended.
- A missing location is never treated as "chef stopped". Stale markers are greyed and never animated.

## 14. Scalability design (E4/E5)

**Polling, not WebSockets/SSE.** Why:
- Render's free and starter instances run one process and sleep or restart, so long-lived sockets would need sticky
  routing, a pub/sub layer and reconnect handling.
- A customer only needs a position every 5 s, which is exactly one cheap GET.
- Polling degrades gracefully: each request is independent and is answered from memory.

With 1,000 chefs: 200 ingest req/s, plus about 200 req/s if every customer watches simultaneously (in practice only those
inside their 15-minute window).

- **Ingest cost per call:** JWT verify + one indexed SQL query (user, session, chef). The ownership check is cached 30 s
  and invalidated on travel start/stop and check-in. The point is appended to an in-memory buffer. **No DB write in the
  request path** (E5).
- **Writes:** every 2 s the worker writes the buffer in one multi-row `INSERT` and the changed live positions in one
  multi-row `INSERT … ON CONFLICT (chef_id) DO UPDATE … WHERE newer`. At 200 points/s that is about 2 statements per 2 s
  instead of 400.
- **Live view:** answered from the in-memory last position. It falls back to `chef_last_locations` (primary-key lookup,
  measured 0.21 ms) after a restart.
- **Single-instance limit (documented, not hidden):** the buffer and caches are per process. Running more than one API
  instance would need the buffer and live positions in a shared store. **Redis was evaluated and not added**: one Render
  instance absorbs the measured load, and adding Upstash would be an unconfigured paid dependency. Plan if scaling out:
  `XADD` points to a Redis stream (one consumer flushes in batches), `SET chef:{id}:last` with a 1-hour TTL for the
  live view, and the ownership cache in Redis. The `tracking.py` interface stays the same.
- Partitioning `location_points` by month (drop old partitions instead of `DELETE`) is the next step past ~100 M rows.
  The BRIN index keeps the current batched deletes cheap until then.

## 15. Load-test results

Setup: laptop (20 logical cores), **one uvicorn process** (same command shape as Render), `RUN_WORKERS=true` (the real
2 s flusher), DB pool 5+5, local PostgreSQL 18 with **fsync on**, 1,000 seeded travelling chefs + 50 polling customers.
The open-loop driver gives each chef a fixed 5 s schedule with a random phase, so the offered rate is 200 req/s.
Latency is measured from the *scheduled* send time, so there is no coordinated omission. Four driver processes were used
because one Python driver could not offer 200 req/s on time. Reproduce with
`PGBIN=… bash ../loadtest/run_part_e.sh 60` from `backend/`.

| Run | Endpoint | req/s | p50 | p95 | p99 | max | errors |
|---|---|---|---|---|---|---|---|
| **Before** (`results-part-e-before.json`) | ingest | 108.6 (of 200 offered) | 29,923 ms | 62,444 ms | 72,807 ms | 91 s | 0% (requests queued, not failed) |
| | live view | 5.4 | 29,217 ms | 62,647 ms | 71,794 ms | — | 0% |
| **After** (`results-part-e-after.json`) | **ingest** | **200.0** | **17.9 ms** | **67.1 ms** | **270.9 ms** | 488 ms | **0%** |
| | live view | 10.0 | 16.9 ms | 68.0 ms | 292.4 ms | 315 ms | 0% |

- **Target "200 req/s with p95 < 200 ms": MET in this local measurement** (p95 67 ms). The p99 is 271 ms.
- **DB writes:** all 12,000 accepted points were persisted (`location_points` = 12,000). A 400-point flush (2 s of data at
  target rate) takes 35 ms p50 / 59 ms max, about 11k points/s capacity. Current-location lookup: 0.21 ms.
- Two other runs were discarded and their files deleted. One had a backlog from an earlier interrupted run, and in the
  other the 15-minute test tokens expired. Both were made before the deadlock fix and showed the hang described in gap 1.
- **Not measured:** Render's hardware (the free tier has 0.1 CPU, and these numbers will not transfer) and Neon network
  latency (adds a round trip to the auth query). Do not quote these figures as production performance.

## 16. Verification run

| Check | Result |
|---|---|
| Backend full suite (local PG, never Neon) | **169 passed** (150 before + 19 new) |
| Part E tests (`tests/test_part_e.py`) | 19 passed. Covers ingest validity, NaN/∞, missing accuracy, invalid timestamps, auth, unassigned, duplicates, concurrency, flush failure, window boundary, ownership, check-in/complete/cancel/missed, reassignment, time change, ETA, arrival, stale, retention, acceptance |
| Existing tracking/privacy, booking, attendance (Part D), auth/RBAC, subscription, payment tests | All pass (in the full suite) |
| Ruff | New files: 0 findings. Changed files: same or fewer than before. Repo total 386 (was 387; no repo config, mostly pre-existing B008) |
| Alembic | heads = current = `e66cdf57002d`; `alembic check`: no drift |
| `tsc --noEmit` | Pass |
| Client rules (`node scripts/check-tracking-polling.mjs`) | All passed: 5 s cadence, 5→60 s backoff, stops when ended, window wait, 29 s live / 31 s stale, interrupted after a failure or 31 s of silence |
| `expo export --platform android` | Bundles (3.9 MB Hermes) |
| Manifest introspection | Permissions as in section 9 |
| `expo install --check` | Two pre-existing outdated packages (`expo-splash-screen`, `expo-status-bar`); not changed |
| Lint | None configured in the mobile project |

## 17. Remaining manual configuration and device testing

**Google Maps (required for the native Google map; without it the WebView map is used):**
1. Google Cloud: enable **Maps SDK for Android**. Billing must be enabled on the project (Maps SDK mobile loads are
   currently free, but a billing account is mandatory).
2. Create an API key restricted to **Android apps**: package `com.delcochefs.app` plus the **SHA-1** of each signing
   certificate (EAS: `eas credentials` → Android → keystore SHA-1; also the debug keystore for dev builds). API
   restriction: Maps SDK for Android only.
3. Set `GOOGLE_MAPS_API_KEY` as an **EAS secret / environment variable** (`eas env:create`) for preview/production, and
   in `mobile/.env` for local builds. Never commit it. `app.config.js` injects it into the manifest and sets
   `googleMapsConfigured`.
4. Note: the existing map picker and fallback map use Google tile URLs through Leaflet without a key. That is outside
   Google's terms and predates this work; the native SDK path is the compliant one.

**New build required:** `eas build -p android --profile preview` (APK) or a dev client. Expo Go cannot exercise the
foreground service. If you use the local `android/` folder (git-ignored), run `npx expo prebuild --clean` first so the
new permissions and `expo-task-manager` are linked.

**Backend deploy:** no migration and no new environment variables. Deploying the code is enough.

**Android device test script (2 phones, or 1 phone + emulator; preview APK against the Render API):**
1. Chef phone: open a visit ≤ 3 h away → Start travel → allow "While using the app". Check that the "Sharing your
   location" notification appears.
2. Customer phone, more than 15 min before start: Track → "Tracking starts 15 minutes before your visit" with the time.
3. At ≤ 15 min: the map shows the home pin and the chef dot. Walk or drive: the dot glides every ~5 s and the ETA changes.
4. Chef: press Home, open Google Maps, lock the screen for 2 minutes. The customer keeps receiving updates.
5. Chef: airplane mode for 60 s. After ~30 s the customer sees "Reconnecting…" with a grey marker and no ETA. Turn
   airplane mode off: the queued points arrive and the view returns to "Live location".
6. Customer: airplane mode → "Connection interrupted"; back online → recovers without rapid-fire retries.
7. Chef: deny the permission once ("Allow location" shown), then "Don't ask again" ("Open settings" shown).
8. Chef: check in → the notification disappears; customer sees "Live tracking has ended".
9. Repeat step 4 on a Xiaomi/Oppo/Vivo/Samsung phone with battery optimisation on, then with "Unrestricted". Record
   the difference.

Not verified by me: everything in this list. **No claim is made that the map or background tracking works on a device
until these steps are run.**

## 18. Known risks / follow-ups

- The threadpool/connection-pool starvation in gap 1 applies to **every** endpoint that uses sync `Depends(get_db)`
  dependencies. It was fixed only on the two Part E hot paths (scope). Other endpoints are safe at normal traffic but
  could stall under bursts above the pool size. The general fix is to resolve auth and the session in one dependency, or
  to size `DB_POOL_SIZE + DB_MAX_OVERFLOW` ≥ threadpool size (40). This is worth a dedicated change.
- Single-instance buffer (section 14): scaling out needs Redis first.
- An ownership cache entry can let a just-reassigned or cancelled chef's points into the buffer for ≤ 30 s, stored
  under their own `chef_id`. They are never shown to the customer, because the live view re-reads the visit on every poll.
