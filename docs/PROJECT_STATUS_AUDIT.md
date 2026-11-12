# Delco Chefs: Project Status Audit

**Date:** 12 Nov 2026

**Method:** this was a read-only audit of the working tree. The only file it created is this report.

**Evidence collected:**
- Source inspection.
- `pytest`, `tsc`, `expo-doctor` and `expo export`.
- `alembic heads` and the `/health` and `/version` endpoints.
- Read-only queries against Neon (`SET TRANSACTION READ ONLY`).
- Scans of Git history.

**Requirements source:** the original *Delco Chefs Developer Assignment.pdf*. It is not in the repo; it is on the Desktop at `C:\Users\Parvesh Kumar\Desktop\`. The requirement IDs below are taken from that PDF.

No secrets are reproduced in this report.

---

## 1. Executive summary

The backend is substantial and well tested.
- 112 API operations over 101 paths.
- 36 tables.
- 68 of 68 tests passing against real PostgreSQL.
- All four roles sign in against Neon.

The mobile app (112 screens) has had every mock service removed. 101 screens read or write through the API.

**One real Razorpay test-mode payment** was completed end to end on a phone (payment `PAID`, gateway `razorpay`, subscription `active`).

What is **not** done:
- Production deployment.
- An installable APK.
- The Razorpay **webhook**. No secret is set and `payment_events` holds 0 rows.
- Google Maps, because there is no API key.
- Push notifications.
- Redis and object storage.
- The after-optimisation benchmark.
- The spike test.
- The design note, ERD and demo video.

**Nothing is committed.** 74 files are modified, 7 deleted and 49 untracked.

**One correctness bug is about to bite.** Subscription visits assigned automatically are created as chef *offers*. The 10-minute expiry job then unassigns them. In Neon, 27 paid subscription visits were 11 minutes old at audit time (see §14, BUG-1).

**PDF compliance:** 94 requirement rows were assessed.

| Status | Count |
|---|---|
| DONE AND VERIFIED | 39 |
| IMPLEMENTED BUT NOT VERIFIED | 17 |
| PARTIALLY IMPLEMENTED | 19 |
| NOT IMPLEMENTED | 13 |
| OPTIONAL / STRETCH | 6 (1 has a backend-only part) |

## 2. Technology stack (verified)

| Layer | Actual |
|---|---|
| Mobile | Expo SDK 58, React Native 0.88, TypeScript, Expo Router, Zustand, TanStack Query v5, Axios |
| Native modules | `expo-secure-store`, `expo-location`, `expo-image-picker`, `react-native-maps` (in `mobile/package.json`) |
| Backend | FastAPI, SQLAlchemy 2, Pydantic v2, Alembic, PyJWT, `cryptography` (AES-GCM), httpx (`backend/requirements.txt`) |
| Database | Neon PostgreSQL 18 (us-east-2), extensions `plpgsql` and `btree_gist` |
| Queue/cache | In-process worker thread and in-memory location buffer. **No Redis.** |
| Payments | Razorpay test mode (`app/services/gateway.py::RazorpayGateway`), plus a dev-only `SandboxGateway` |
| Storage | Local disk (`backend/media/`, `app/services/storage.py::LocalStorage`) |

## 3. Architecture

```
Phone (Expo app)
  screens → src/services/*.service.ts → src/services/api.ts (Axios)
    Bearer access token (memory) + refresh token (SecureStore); single-flight refresh
        │ HTTPS /api/v1 (EXPO_PUBLIC_API_URL; currently LAN http://10.200.62.38:8000)
FastAPI (app/main.py)
  api/v1/endpoints/* → api/deps.py (JWT + role guards)
                     → services/* (use cases; transactions; outbox writes)
                     → domain/* (pure rules: ranking, pricing, schedule, refunds, board, payouts)
  worker thread (services/worker.py): outbox delivery, location flush, scheduled jobs
        │ SQLAlchemy (pooled DATABASE_URL); Alembic uses DIRECT_URL; DB_PREFER_IPV4=true locally
Neon PostgreSQL (public schema: 36 tables; neon_auth schema untouched)
Razorpay (payment links API; browser redirect callback → /api/v1/payments/razorpay/callback)
```

Business rules are separated from the HTTP handlers. They live in `backend/app/domain/*.py` and are tested without a server in `tests/test_domain.py`.

## 4. Frontend audit

**Screen inventory:** 123 `.tsx` files under `mobile/app`, of which 11 are layouts and **112 are screens**.

| Area | Screens |
|---|---|
| Customer (`app/customer`) | 42 |
| Chef (`app/chef`, incl. registration) | 29 |
| Ops Admin (`app/admin`, excl. super) | 22 |
| Super Admin (`app/admin/super`) | 8 |
| Auth (`app/(auth)`) | 5 |
| Common (`app/(common)`) | 4 |
| Root (`index`, `+not-found`) | 2 |

### Connection to the backend

These counts come from source inspection, not from manual testing on a device.

**Connected (101 screens).** These call real services through `useQuery`/`useMutation`, or through gates such as `VisitGate`, `BookingGate` and `NotificationCentre`.

**Not data-backed by design (11 screens):**
- `welcome`
- `offline`, `permission-denied`, `session-expired`, `+not-found`
- `index` (redirect)
- `payment/failed` (static message)
- `chef/register/{cuisine,documents,profile}`. These collect a local draft that `bank.tsx` submits through `chefService.submitApplication`.
- `customer/onboarding/map-picker` (device GPS only)

**Partially connected.** These screens work, but a PDF feature they should expose has no UI wired to its existing backend endpoint (see §13):
- services list
- admin trial board
- request detail
- payouts
- payment detail
- coming-soon service
- subscription detail

### Services (`mobile/src/services/`)

All nine service files call real endpoints. The `src/services/mock/` directory is deleted, and `MockTag` is used on 0 screens.

**Backend endpoints that no screen calls:**

| Service | Unused functions |
|---|---|
| `adminService` | `getStageSummary` (C9), `revealPhone` (H4), `getBoardMoves`, `moveCard` (C5), `listPaymentLinks` (F7), `revealBank`, `markPayoutPaid`, `adjustPayout` (G3), `getChef` |
| `bookingService` | `notifyMe` (A6), `cancelTrial` (C), `getSchedule` (C7), `cancelSubscription` (F5), `listBookingHistoryPage` |
| `chefService` | `updateMe`, `listAttendance` |
| `paymentService` | `getReceipt` (F7) |

### Mock and placeholder search

These were removed:
- Fixed OTP and test-phone auto-fill (`src/features/authentication/index.tsx`).
- Instant-login welcome buttons (`app/(auth)/welcome.tsx`).
- "Simulate success/failure" payment buttons (`app/customer/payment/pending.tsx`).
- "Simulate approval" (`app/chef/register/status.tsx`).
- Preset Noida map pins (`map-picker.tsx`).

**Remaining:** the `MockTag` component definition in `src/components/Display.tsx`, which is unused. No hardcoded business records were found; a grep for seed names, prices and phone numbers returned 0 hits.

### Capabilities

| Capability | Status |
|---|---|
| Auth / session restore | `api.ts` handles refresh rotation; `auth.service.ts::restore` runs from `app/_layout.tsx`; the refresh token is kept only in SecureStore (`services/session.ts`). Verified on a device by the user (login works). |
| Role protection | `useRoleGuard` in `app/{customer,chef,admin,admin/super}/_layout.tsx`. The server enforces roles independently (tests). |
| Camera | Real (`components/Media.tsx::takePhoto` via `expo-image-picker`); uploads go to `/visits/{id}/photos`. Not tested on a device. |
| GPS | Real (`src/features/tracking/index.ts`), 5-second sharing with an offline queue, foreground only. Not tested on a device. |
| Maps | `react-native-maps` is wired. **Disabled** (`EXPO_PUBLIC_MAPS_ENABLED=false`) because there is no key, so a stylised fallback map is shown. |
| Notifications | In-app list from `/notifications`. **No push notifications** (no `expo-notifications`). |
| Loading/empty/error | Shared `QueryView`; errors show the backend's `message`. |
| Validation gaps | No preferred-language field (A5); no landmark field (A8); allergy "Yes/No" is implied by chips rather than an explicit toggle (A7); the decision screen ignores the server's `allowedDecisions`; Custom Time offers preset durations (7, 14, 21, 30, 60, 90) rather than a free end date. |

## 5. Backend audit

**API surface:** 101 OpenAPI paths and **112 operations**, plus 2 hidden sandbox routes.

| Tag | Operations |
|---|---|
| Admin | 35 |
| Customer | 31 |
| Visits | 13 |
| Chef | 11 |
| Payments | 9 |
| Auth | 7 |
| Health | 4 |
| Notifications | 2 |

The Swagger docs are at `/api/v1/docs`.

| Module | Implemented | Incomplete / caveats |
|---|---|---|
| Auth (`services/auth.py`) | 6-digit OTP, HMAC-hashed and single-use, 5-minute TTL; 5 requests per hour; 5 wrong attempts then a 15-minute lock with retry-after; JWT (15 min); rotating refresh tokens with reuse detection; logout; session list and revoke; one role per phone; admins only by Super Admin; unprovisioned admin attempts are audited | SMS provider is only a log mock. No general API rate limiting beyond OTP. |
| Customers (`endpoints/customers.py`, `services/accounts.py`) | Profile, consent with version and timestamp, onboarding, at most 3 addresses with a single default, interest registration | — |
| Chefs | Application with encrypted ID, PAN and bank; document upload; off-days with conflict alert; assignments; accept/decline; earnings | No automated test for application submit. |
| Booking / assignment (`services/bookings.py`, `domain/ranking.py`) | Validation, eligibility (approved, active, cuisine, off-day, 8 km, 60-minute buffer), PDF-exact score, tie-breaks, bounding-box prefilter, chef row lock plus `EXCLUDE` constraint, reassign reason, history with ranked snapshot | **BUG-1** (offer expiry); `auto_assign` setting unused (B10). |
| Trials / board | Limits on every path, specific error codes, decisions, push of trial 2, cancel at least 2 hours before (not counted), board transition table and move history | No complaints (C10, stretch). |
| Subscriptions (`services/subscriptions.py`, `domain/schedule.py`) | Price snapshot, late-payment shift, schedule recomputed from off and missed days, background schedule build | Edge case BUG-2. |
| Attendance (`services/attendance.py`) | Window, accuracy, 200 m geofence, code with 5-attempt lock, selfie, idempotent check-in and check-out, server clock, duration flag, customer unavailable, auto-close job, admin resolve with audit | Auto-close is not under test. |
| Tracking (`services/tracking.py`) | Ingest with an ownership cache, in-memory buffer with batched flush, visibility window, ETA from average speed, stale flag, 30-day retention | Per-process buffer; polling only. |
| Payments (`services/payments.py`, `gateway.py`) | Automatic link, snapshot, 48-hour expiry, single active link, replacement, idempotent webhook (unique event ID), dead-link auto-refund, failure handling, refund rule, 7-day unpaid close, signed redirect callback | Razorpay webhook unverified (no secret); Razorpay refund API unverified; no reconciliation (F8). |
| Notifications | Transactional outbox and `SKIP LOCKED` worker, persistent notifications, mock SMS/email log lines | No push channel. |
| Privacy (`services/privacy.py`) | Background JSON export with a signed 10-minute download URL, deletion and anonymisation, audited reveals | — |
| Settings (`services/settings.py`) | 29 tunables, validated, audited, live | `auto_assign` is never read. |
| Health | `/health` checks the database and the migration; `/version` | `GIT_COMMIT` is `dev` locally. |

## 6. Database audit (Neon, read-only)

| Item | Finding |
|---|---|
| Alembic | Head and current are both `e66cdf57002d`. One migration: `backend/migrations/versions/20261111_e66cdf57002d_initial_schema.py`. |
| Migration safety | Upgrade, downgrade and upgrade again succeeded locally. `alembic check` showed no drift between models and migration. |
| `schema.sql` | **Does not exist.** The models plus the migration are the only schema source, and they are consistent. |
| Tables | **36** in `public`; the 9 in `neon_auth` are untouched |
| Constraints | 36 primary keys, 61 foreign keys, 11 unique, 30 check, 1 exclusion (`ex_visits_chef_no_overlap`) |
| Indexes | 91, including partial unique indexes `uq_requests_one_open`, `uq_trials_customer_service_number`, `uq_payment_links_one_active`, `uq_attendance_one_open_per_chef`, `uq_payouts_chef_cycle` and a BRIN index on `location_points.recorded_at` |
| Triggers | 1 (`audit_logs` is append-only) |
| Data | Users: 1 chef, 3 customers, 1 ops admin, 1 super admin. 3 requests, 2 trials, 30 visits, 1 subscription (active), 1 payment (PAID via Razorpay), 17 notifications, 8 audit rows. 0 `payment_events`, 0 `system_settings` rows (all defaults). |
| Connection | Pooled URL for the app and direct URL for Alembic (`core/config.py`). `DB_PREFER_IPV4=true` works around IPv6 timeouts on this network. |

**Tables:** `users`, `otp_challenges`, `refresh_tokens`, `customer_profiles`, `addresses`, `consents`, `service_interests`, `data_exports`, `chefs`, `chef_skills`, `chef_documents`, `chef_bank_accounts`, `chef_off_days`, `service_requests`, `board_moves`, `trials`, `subscriptions`, `subscription_days`, `visits`, `assignments`, `photos`, `attendance_records`, `attendance_events`, `location_points`, `chef_last_locations`, `payments`, `payment_links`, `payment_events`, `refunds`, `notifications`, `outbox_events`, `audit_logs`, `system_settings`, `payouts`, `payout_items` (35 model tables), plus `alembic_version`.

**Every entity the PDF requires (J1) is present.** Complaints (C10, stretch) are absent.

## 7. Authentication and security audit

| Check | Result |
|---|---|
| OTP, rate limiting, lockout, expiry, single use | Verified (`tests/test_auth.py`, 14 tests) |
| JWT expiry and refresh rotation/reuse/logout | Verified (`test_refresh_rotation_reuse_and_logout`) |
| Server role checks / admin provisioning | Verified (`test_otp_never_creates_admin_…`, `test_only_super_admin_creates_admins`) |
| Field encryption (phone, address, ID, PAN, bank) and HMAC lookup | Verified (`test_raw_columns_are_encrypted`). Keys were rotated to random 32-byte values in `backend/.env`. |
| Masking / chef contact window / doc reveal | Verified (`test_admin_sees_masked_phone`, `test_chef_contact_window`, `test_document_reveal_permissions`) |
| Export / deletion / audit append-only | Verified (`test_privacy_tracking.py`) |
| Log hygiene | `core/logging.py` redaction. A manual grep found 0 raw phone numbers in the live log. The dev OTP is logged intentionally and only outside production. |
| Secrets in Git history | **None found.** Patterns checked: Neon password prefix, `rzp_test_`, private keys, Google keys. `.env` has never been committed. |
| `.gitignore` | `backend/.env`, `mobile/.env`, media, logs and test media are ignored. **`loadtest/tokens.json` (contains a JWT) and `loadtest/results-*.json` are not ignored.** |
| Credential exposure outside Git | The Neon password and the Razorpay key pair were pasted into the AI chat transcript. **They should be rotated.** |
| Other | `DEBUG=True` in `backend/.env` (debug-level logs). No CORS origins are configured (fine for native apps). No API-wide rate limiter. |

## 8. Payment integration audit

| Capability | (1) Local sandbox | (2) Razorpay test mode | (3) Verified end to end |
|---|---|---|---|
| Credentials | — | Key ID and secret set; auth check returned 200 | — |
| Link creation, server price, snapshot | Tested | Real link created | **Yes**: 1 live link, ₹10,400, `PaymentLink.status=paid` |
| Expiry, replacement, single active link | Tested | Code path identical | Not with Razorpay |
| Checkout + browser return + signature verification | Tested (`test_redirect_callback_…`) | `GET /payments/razorpay/callback` | **Yes**, one payment on a phone (`payments.status=PAID`, `gateway=razorpay`) |
| Webhook endpoint + signature + idempotency + out-of-order handling | Tested (`test_webhook_twice_and_before_client_callback`, `test_invalid_signature_rejected`) | **`RAZORPAY_WEBHOOK_SECRET` not set, so every Razorpay webhook is rejected; no public URL** | **No** (`payment_events` = 0) |
| Failure + retry + notification | Tested | Depends on the webhook; mapping `payment.failed` to a link is unconfirmed (`RazorpayGateway.parse`) | **No** |
| Subscription activation | Tested | Live (schedule now built in the background) | **Yes** (one) |
| Refund rule + tracking | Tested (`test_cancel_with_full_refund_…`) | `RazorpayGateway.refund` never called live; there is no cancel UI | **No** |
| Admin link management | `/admin/payment-links`, resend, regenerate | — | No UI uses `/admin/payment-links` |

**Limitation of the redirect callback:** it needs the phone to reach `PUBLIC_BASE_URL`, which is currently a LAN IP.

## 9. Maps, tracking and external services

| Integration | Classification |
|---|---|
| Google Maps SDK | **Implemented, credentials missing.** `app.config.js` injects `GOOGLE_MAPS_API_KEY` (not set); package `com.delcochefs.app`. |
| Location permissions | Implemented (`app.config.js` plugin strings). Not tested on a device. |
| GPS updates / ingest API / visibility / ETA / reconnecting | Ingest, window, isolation, stale and ETA verified (`test_tracking_window_and_isolation`, `test_tracking_not_yet_and_ended`). Device GPS is not verified. |
| Background location | **Not implemented.** Foreground only, and the limitation is documented in `features/tracking/index.ts`. |
| Real-time delivery | Polling (5 seconds). Load at 1,000 chefs is not measured. |
| Photo storage | **Partial.** Local disk only; no object storage adapter. |
| Push notifications | **Not implemented.** |
| SMS provider | **Mocked** (`LogOtpProvider`). |
| Redis | **Not implemented.** In-process alternatives are used. |

## 10. Performance audit

- **Dataset:** `backend/scripts/seed_perf.py` produced 10,500 users, 500 chefs, 60,000 bookings and 2,000,000 location points in **13 seconds** in local Docker Postgres. Supported and verified.
- **Scripts:** `loadtest/k6.js` (not run, because k6 is not installed) and `loadtest/quick_bench.py`.
- **Baseline:** recorded in `loadtest/RESULTS.md` and `loadtest/results-1794423305.json`, measured with quick_bench at 50 workers for 20 seconds per endpoint, not the PDF's 2 minutes.

| Endpoint | req/s | p50 ms | p95 ms | p99 ms | Errors |
|---|---|---|---|---|---|
| History | 57.5 | 752.8 | 2048.3 | 3057.0 | 0% |
| Suggestions | 37.1 | 1182.1 | 2678.5 | 3542.2 | 0% |
| Ingest | 160.4 | 285.2 | 441.6 | 2166.4 | 0% |
| Queue | 10.0 | 5800.5 | 8218.7 | 10032.4 | 0% |
| Stage summary | 138.3 | 325.9 | 508.8 | 2282.2 | 0% |

Every PDF target was **missed** at baseline.

**Optimisation (done, measured as query counts only):**
- Queue: 304 → 11 queries per request (`presenters.Prefetch`).
- History: 39 → 4 queries.
- Suggestions: payload cut from 201 to 80 chefs.

Plans before the change are saved in `loadtest/plans/*-before.txt`. **There are no after-plans.**

**After-optimisation latency: PENDING. It has not been run.**

| Area | Status |
|---|---|
| Spike test | **Not done** |
| Caching | None |
| Pooling | SQLAlchemy pool (5+5) |
| Indexing | 91 indexes |
| Location batching | Implemented and tested |
| Horizontal scaling | Blocked by the in-process buffer and caches; needs Redis |

## 11. Deployment and infrastructure

| Item | Status |
|---|---|
| `backend/Dockerfile`, `docker-compose.yml` | Written. **The image build was not run** (declined during this session). |
| `render.yaml` | Written; **not deployed** |
| Neon | Configured and migrated |
| Mobile production API URL | **Not set.** `eas.json` has no `env`, so a production build would fall back to `http://10.0.2.2:8000/api/v1`. |
| EAS / APK | `eas.json` has an APK `preview` profile. **No APK has been built.** Only `expo export` bundles exist (Hermes `.hbc`, 3.7 MB). |
| CI (`.github/workflows/ci.yml`) | Written: lint, migrations, tests, mobile typecheck and export, Docker build, deploy hook. **It has never run** because nothing is pushed. |
| Health / version | Verified live |
| Monitoring / logging | JSON logs with request ID. No error tracker or alert configured. |
| Rollback | Documented in the README; downgrade tested locally; not demonstrated |
| Fresh-clone instructions | In `README.md`; **not tested on a clean machine** |

The local API server is currently running on `0.0.0.0:8000` against Neon. That is development, not production.

## 12. PDF compliance matrix

**Key:** D = done and verified, I = implemented but not verified, P = partially implemented, N = not implemented, S = optional or stretch. "Priority" is the PDF's Must or Should; S rows are stretch items.

### Part A: authentication and onboarding

| ID | Priority | Status | Evidence |
|---|---|---|---|
| A1 | Must | D | Tests and live Neon login |
| A2 | Must | D | `test_sixth_otp…`, `test_five_wrong…` |
| A3 | Must | D | `test_refresh_rotation…` |
| A4 | Must | D | `test_unprovisioned_admin…`, `test_otp_never_creates_admin…` |
| A5 | Must | P | Preferred language exists in the API but not in the UI |
| A6 | Must | P | No "Notify me" UI; status not shown on the list cards |
| A7 | Must | I | Server validation tested; UI has preset durations and no explicit allergy toggle |
| A8 | Must | P | No search; no landmark field in the UI; map disabled |
| A9 | Must | D | `test_invalid_phone…`, `test_name_length…` |
| A10 | Must | I | Version and timestamp stored; not asserted in tests |
| A11 | Must | I | Screens exist; not tested on a device |
| A12 | Should | I | No test of application submit |
| A13 | Stretch | S | API only |

### Part B: booking and chef assignment

| ID | Priority | Status | Evidence |
|---|---|---|---|
| B1 | Must | D | `test_booking_validation` |
| B2 | Must | D | `test_suggestions_match_part_b_table` |
| B3 | Must | D | `test_reassignment_requires_reason…` |
| B4 | Must | D | `test_twenty_parallel_assignments…` |
| B5 | Must | D | Reassign and allergy notification tests |
| B6 | Must | D | `test_off_day_after_assignment…` |
| B7 | Must | I | Bounding box and index exist; p95 not met |
| B8 | Must | I | Screens; not tested on a device |
| B9 | Should | P | Works for trials; **BUG-1** for subscriptions |
| B10 | Stretch | S | Not implemented |

### Part C: trials and subscriptions

| ID | Priority | Status | Evidence |
|---|---|---|---|
| C1 | Must | D | `test_trials.py` |
| C2 | Must | D | Server tests; UI ignores `allowedDecisions` |
| C3 | Must | D | Suggestions and assign tests |
| C4 | Must | D | `test_push_second_trial_rules` |
| C5 | Must | P | API and move history tested; board screen has no history or close action |
| C6 | Must | D | Payment tests and live payment |
| C7 | Must | I | Rules verified with PDF numbers; endpoint untested and unused by the UI |
| C8 | Should | I | — |
| C9 | Should | P | API only |
| C10 | Stretch | S | Not implemented |

### Part D: check-in and check-out

| ID | Priority | Status | Evidence |
|---|---|---|---|
| D1 | Must | D | `test_check_in_acceptance_table` |
| D2 | Must | I | Not tested on a device |
| D3 | Must | D | `test_photo_validation` |
| D4 | Should | I | No test |
| D5 | Should | D | API resolve test |
| D6 | Must | N | Design note |

### Part E: live tracking

| ID | Priority | Status | Evidence |
|---|---|---|---|
| E1 | Must | P | Foreground only; not tested on a device |
| E2 | Must | D | Tests |
| E3 | Must | P | Map disabled (no key) |
| E4 | Must | I | Polling; scale not measured |
| E5 | Should | D | Flush test |
| E6 | Should | I | — |
| E7 | Stretch | S | Not implemented |

### Part F: payments and refunds

| ID | Priority | Status | Evidence |
|---|---|---|---|
| F1 | Must | D | Tests and live link |
| F2 | Must | D | Live Razorpay payment and tests |
| F3 | Must | I | Razorpay webhook not configured |
| F4 | Must | I | Depends on the webhook |
| F5 | Should | P | No UI; live refund unverified |
| F6 | Should | I | No test |
| F7 | Should | P | No receipt UI; admin links screen doesn't use the links API |
| F8 | Stretch | S | Not implemented |

### Part G: weekly chef earnings (whole part optional)

| ID | Priority | Status | Evidence |
|---|---|---|---|
| G1 | Should | D | `test_weekly_payout_cycle_part_g` |
| G2 | Should | D | Same test (run twice) |
| G3 | Should | P | No adjust or mark-paid UI |
| G4 | Stretch | S | Not implemented |

### Part H: personal data protection

| ID | Priority | Status | Evidence |
|---|---|---|---|
| H1 | Must | D | Export test |
| H2 | Must | D | Delete test |
| H3 | Must | D | Raw-column test |
| H4 | Must | P | Rules verified; no reveal-phone UI |
| H5 | Should | D | `test_document_reveal_permissions` |
| H6 | Must | D | Append-only test |
| H7 | Must | D | Manual log check plus redaction code |
| H8 | Should | N | Design note |

### Part I: performance and sudden traffic

| ID | Priority | Status | Evidence |
|---|---|---|---|
| I1 | Must | D | Dataset generated (§10) |
| I2 | Must | P | Baseline and before-plans exist; after-numbers and after-plans are pending |
| I3 | Must | N | Spike test and plan |

### Part J: database, deployment and maintainability

| Requirement | Status | Evidence |
|---|---|---|
| Migrations | D | — |
| ERD image | N | — |
| Index reasons in README/ERD | P | Code comments only |
| Partitioning note | N | — |
| Local stack in 5 commands | I | Docker build not run |
| Free-tier deploy and test accounts | N | — |
| App web link or installable build | N | — |
| `/health` and `/version` | D | — |
| Environment config and `.env.example` | D | — |
| CI with automatic deploy | I | Never run |
| Acceptance tests B, C, D, F and webhooks | D | — |
| Live settings change | D | `test_rate_change_keeps_existing_link` |
| Rollback | P | Not demonstrated |
| Versioned API and OpenAPI | D | Live docs; no exported file |
| Code structure | D | — |
| Monitoring (logs, error tracker, alert) | P | Logs only |

### Sections 15 and 16

| Requirement | Status |
|---|---|
| §15 design note | N |
| §16 private repository with meaningful commit history | N (nothing committed) |
| §16 README | P |
| §16 running app | N |
| §16 ERD and migrations | N (ERD) |
| §16 API documentation file | P |
| §16 performance report | P |
| §16 demo video | N |
| §16 design note | N |

## 13. Missing requirements (Must and Should only)

**Must**
- A5 preferred-language UI.
- A6 "Notify me" and trial status on the list cards.
- A8 search and landmark field.
- C5 board history and close UI.
- D6, H8 and I3 design note content.
- E1 background location (or a documented limit).
- E3 Google Maps key.
- F3 and F4 a live Razorpay webhook.
- I2 after-numbers.
- I3 spike test.
- J: ERD, deployment, APK or web link, rollback demo, alert.
- §16 deliverables: commits, video, design note.

**Should**
- B9 (BUG-1).
- C9 summary UI.
- D4 and F6 tests.
- F5 cancel and refund UI plus a live refund.
- F7 receipt and links UI.
- G3 adjust and mark-paid UI.

## 14. Known bugs and technical risks

| ID | Severity | Description | Evidence |
|---|---|---|---|
| **BUG-1** | **Critical** | `subscriptions.sync_visits` calls `bookings.assign(..., quiet=True)`, which creates `Assignment(status="offered")`. `bookings.expire_unanswered` (every minute) then unassigns any visit whose offer is older than 10 minutes. Result: paid subscription visits drop back to the admin queue and 27+ admin alerts are sent. | Neon: 27 `offered` assignments created 21:25:38 UTC, 11 minutes old at audit time |
| BUG-2 | Medium | A subscription's first day can collide with the trial visit on the same date and slot, giving `needs_manual_assignment`. This was seen on visit 36 after the dev shortcut completed a trial early, so real flows are less likely to hit it. | Visits 35 and 36 |
| BUG-3 | Medium | Unanswered trial assignments expire after 10 minutes and return to the queue, so `scripts/dev_complete_visit.py` then finds nothing to complete. This matches the spec, but it is a testing trap. | Outbox `assignment_expired` = 2 |
| RISK-1 | High | The Razorpay webhook is not configured, so failures and refunds are not reflected and payments depend on the browser redirect reaching a LAN IP | `RAZORPAY_WEBHOOK_SECRET` is not set |
| RISK-2 | High | Nothing is committed. All work lives in an uncommitted working tree, and the CI pipeline has never run. | `git status` |
| RISK-3 | High | Credentials were pasted into the AI chat | — |
| RISK-4 | Medium | Mobile production API URL is unset; a production build would point at an emulator address | `eas.json` |
| RISK-5 | Medium | Requests take 2–4 seconds, because Neon is in us-east-2 while users are in India | Live timings |
| RISK-6 | Medium | In-process buffer and worker make multiple instances unsafe for tracking | `services/tracking.py` |
| RISK-7 | Low | Expo patch versions are behind: `expo` ~58.0.24, `expo-constants` ~58.0.16, `expo-font` ~58.0.12, `expo-linking` ~58.0.17, `expo-router` ~58.0.31 | `expo-doctor` 18/20 |
| RISK-8 | Low | `loadtest/tokens.json` is not git-ignored | §7 |
| RISK-9 | Low | Hardcoded `5` (code attempts) and `4` (trial size) in `presenters.py` should come from settings | `presenters.visit_json` |

## 15. Git and repository status

- **Branch and remote:** branch `main`; remote `github.com/parvesh2520/Delco-Chef`.
- **Commits:** the last 4 commits are the original mobile scaffold. **None of the backend or integration work is committed or pushed.**
- **Working tree:** 74 modified, 7 deleted and 49 untracked files (81 tracked files changed: +1,589 / −1,326).
- **Secrets:** `.env` files are untracked and ignored. No secrets were found in Git history.
- **Not backed up:** the implementation exists only on this laptop.

## 16. Remaining credentials and configuration

| Item | Needed for |
|---|---|
| `RAZORPAY_WEBHOOK_SECRET` + public URL (deploy or tunnel) | F3, F4, live refunds |
| `GOOGLE_MAPS_API_KEY` (restricted) | E3, A8 |
| SMS provider (e.g. MSG91) | Production OTP |
| Hosting (Render) + `RENDER_DEPLOY_HOOK` + production secrets | J2, J3 |
| Object storage (e.g. R2) | Production photos |
| Redis (e.g. Upstash) | Multiple instances |
| Expo/EAS account | APK build |
| Rotation of the Neon password and Razorpay keys | Security |
| A Neon project in Singapore (optional) | Latency |

## 17. Recommended next development phases

Each task lists: **what** → **why / PDF item** → **files** → **dependencies** → **priority**.

### PHASE 1: critical security and correctness

1. **Fix BUG-1.** Subscription visits assigned in bulk should be created `accepted` (or excluded from expiry). Add a test. → B9, C6 → `services/bookings.py` (`assign`, `expire_unanswered`), `services/subscriptions.py`, `tests/` → none → **Critical** (Should item, but it corrupts paid data).
2. **Commit and push in logical commits on a branch.** Ignore `loadtest/tokens.json` and `results-*.json`. → §16, J3 → `.gitignore` → none → **Critical**.
3. **Rotate the Neon password and Razorpay keys.** → Security → `backend/.env` → none → **High**.
4. **Make the decision screen use `allowedDecisions`.** → C2 → `app/customer/trials/[id]/decision.tsx` → none → **High**.
5. **Fix BUG-2.** Exclude the request's own trial visit from the subscription chef's busy list, or start the subscription the day after the trial. → C6 → `services/bookings.py::candidates` → none → **Medium**.

### PHASE 2: missing backend ↔ mobile integrations (Must first)

1. **A5, A6, A8 (Must):** language field, "Notify me", status on list cards, landmark field. → customer onboarding, services and address screens.
2. **C5 (Must):** board move history and a close action in `app/admin/trial/[requestId].tsx`.
3. **H4 (Must):** reveal-phone button with a reason on admin customer and request screens.
4. **Should items:**
   - C9 stage-summary card on the admin dashboard.
   - F5 cancel-subscription screen (shows the refund).
   - Customer trial cancel.
   - F7 receipt view.
   - Admin links screen using `/admin/payment-links`.
   - G3 adjust and mark-paid.
   - C7 schedule view using `/subscriptions/{id}/schedule`.
5. **Tests for D4, F6, A12 and the C7 endpoint.** → `backend/tests`.

### PHASE 3: payments, maps and external services

1. **Razorpay webhook (Must F3/F4):** deploy (or tunnel), set the secret, confirm the `payment.failed` link mapping in `RazorpayGateway.parse`, and run one success, one failure and one refund live. Depends on Phase 5.1. **Critical.**
2. **Google Maps key (Must E3/A8):** restricted key and an EAS dev build; enable maps; add place search. **High.**
3. **E1 background location (Must):** use `expo-location` background updates, or document the limit in the design note. **Medium.**
4. **Push notifications** via Expo push tokens (optional for the PDF; push may be mocked). **Low.**
5. **Object storage adapter** (R2/Supabase) for production photos. **Medium.**

### PHASE 4: performance and scalability

1. **I2 (Must):** re-run k6 for 2 minutes per endpoint, save after-results and after-plans, update `loadtest/RESULTS.md`. **High.**
2. **I3 (Must):** spike test ramped to the breaking point, plus the spike plan in the design note. **High.**
3. **Redis-backed tracking buffer and session cache** (needed for horizontal scaling, which the I3 plan discusses). **Medium.**

### PHASE 5: deployment and production readiness

1. **Deploy** the backend to Render with Neon, production secrets and `PUBLIC_BASE_URL`. → J2 → **Critical**.
2. **Set the production API URL** in `eas.json` and build the APK with `eas build -p android --profile preview`. → J2, §16 → **Critical**.
3. **Run CI on GitHub** and fix failures. Verify the Docker build and the 5-command fresh clone. → J2, J3 → **High**.
4. **Monitoring:** error tracking (e.g. Sentry free tier) and one alert (health down / 5xx rate). → J3 → **Medium**.
5. **Rollback demonstration**, including a migration downgrade. → J3 → **Medium**.

### PHASE 6: PDF deliverables

1. **ERD image and index-reasons table.** (J1) **High.**
2. **Design note** of at most 4 pages. Must cover: architecture picture, the five main decisions, cuts, D6 cheating, F refund policy, H8 data minimisation, I3 spike plan, path to automatic assignment, and assumptions. **High.**
3. **Exported OpenAPI file** (`openapi.json`) or a Postman collection. **Medium.**
4. **Demo video** of at most 8 minutes, covering every scenario listed in §16. Depends on Phases 3 and 5. **High.**
5. **README:** deployed URLs, test accounts, known gaps. **Medium.**

### Stretch (only after everything above)

A13 sessions UI, B10 auto-assign, C10 complaints, E7 marker animation, F8 reconciliation, G4 CSV statement.

---

## Update 2026-11-12: A5–A8 customer features

- **A5:** language + dietary preference in onboarding profile and Account settings. Allowed languages are defined once in `backend/app/services/accounts.py` (`LANGUAGES`, same list as chef registration), validated on `PATCH /customers/me`, and served to the app via `GET /config` `languages`.
- **A6:** "Notify me" on coming-soon cards and screens (`POST /services/{type}/interest`, idempotent, returns `alreadyRegistered`). `GET /services` now returns `interested` per coming-soon service. Subscription cards show trial status and the unavailable reason.
- **A7:** explicit allergy Yes/No (Yes requires details); Custom Time picks an exact end date (7–90 days, both ends counted) and sends `endDate`; instructions capped at 300; the form pre-fills diet, cuisines and allergies from the profile.
- **A8:** landmark field, address search via the device geocoder (`expo-location`, needs location permission, no Maps key), required pin, client-side India bounds (same box as `domain/geo.py`), 3-address cap in the UI.
- **Still needs configuration:** the interactive Google Map (tap/drag the pin) needs `GOOGLE_MAPS_API_KEY` at build time (`app.config.js`), `EXPO_PUBLIC_MAPS_ENABLED` not set to `false`, and a development/EAS build (not Expo Go). Without it the map picker shows a static preview; search and "Use my current location" still set the pin. Places Autocomplete is not used.
