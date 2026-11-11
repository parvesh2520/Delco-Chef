# Delco Chefs

The app is a native React Native (Expo) client for four roles: Customer, Chef, Ops Admin and Super Admin. The backend is FastAPI with PostgreSQL (Neon).
**PostgreSQL is the only source of truth.** The app holds no business data of its own. Every value on screen comes from `/api/v1`, and every rule is enforced on the server.

```
mobile/   Expo Router app (111 screens) → src/services/*.service.ts → Axios (api.ts, JWT + refresh rotation)
backend/  FastAPI
  app/domain/     pure business rules (ranking, pricing, schedule, refunds, board, payouts). No DB or HTTP.
  app/services/   use cases: auth, bookings, subscriptions, payments, attendance, tracking, privacy, worker
  app/api/v1/     HTTP layer (auth, customers, visits, payments, chefs, admin)
  migrations/     Alembic (manages the `public` schema only; Neon's `neon_auth` schema is never touched)
  scripts/        seed.py (dev data), seed_perf.py (benchmark data), bench_tokens.py
loadtest/ k6.js, quick_bench.py, RESULTS.md, plans/
```

## Run locally

Backend with Docker (5 commands):
```bash
git clone <repo> && cd delco-chefs
docker compose up -d --build                      # Postgres + API on :8000 (runs migrations)
docker compose exec api python -m scripts.seed    # fictional dev data
docker compose logs -f api                        # OTP codes appear here (mock SMS provider)
cd mobile && npm ci && cp .env.example .env && npx expo start
```

Backend against Neon (without Docker):
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                  # fill DATABASE_URL (pooled) + DIRECT_URL (direct) + keys
alembic upgrade head                                  # uses DIRECT_URL
python -m scripts.seed                                # optional, development only
uvicorn app.main:app --reload --port 8000
```
API docs: `http://localhost:8000/api/v1/docs`. Health: `/health` (checks the DB and reports the migration). Version: `/version`.

Mobile: set `EXPO_PUBLIC_API_URL` in `mobile/.env`. Use `http://10.0.2.2:8000/api/v1` for the Android emulator, or `http://<LAN-IP>:8000/api/v1` for a phone.
Maps need `GOOGLE_MAPS_API_KEY` at build time. Without it, set `EXPO_PUBLIC_MAPS_ENABLED=false` and the app shows a stylised map.

## Seeded test accounts (fictional; sign in with OTP from the server log)

| Role | Phone | Notes |
|---|---|---|
| Customer | 9876543210 | Aarav: Monthly trial 1 completed, awaiting decision |
| Customer | 9876543213 / 9876543214 | Active paid subscription / payment link waiting |
| Chef (approved) | 9111111111 | Asha (Part B fixture). 9111111113–19 are the other Part B chefs |
| Chef (rejected) | 9111111112 | Shows the rejection reason |
| Ops Admin | 9000000001 | |
| Super Admin | 9000000002 | |

Seeded rows have `is_seed = true`. To remove them, run `python -m scripts.seed --purge`. Seeding refuses to run in production.

## Tests

```bash
docker run -d --name delco-pg-test -e POSTGRES_USER=delco -e POSTGRES_PASSWORD=delco -e POSTGRES_DB=delco_test -p 55432:5432 postgres:17-alpine
cd backend && pytest        # 67 tests against real PostgreSQL (refuses to run against Neon)
cd mobile && npx tsc --noEmit && npx expo export --platform android
```
Tests cover the acceptance cases in Parts A, B, C, D, E, F, G and H. That includes the Part B ranking table, the 20-way parallel assignment test (exactly one succeeds), all 9 check-in attempts, the webhook cases, the refund rule, the payout cycle and the privacy checks.

## Key design decisions

- **Double-booking (B4):** an assignment locks the chef's row (`SELECT … FOR UPDATE`), so assignments for one chef run one at a time. It then re-checks the 60-minute travel buffer inside that lock. As a final backstop, a PostgreSQL `EXCLUDE USING gist (chef_id =, tstzrange &&)` constraint stops two live visits from overlapping.
- **Trial limits (C1):** the services enforce the limits. The database also enforces them: there is a partial unique index allowing one open request per customer per service, and `trials.number ∈ {1,2}` is unique per customer and service.
- **Money:** all amounts are integer paise. Prices are calculated on the server from settings and stored on the order as a snapshot. The app never sends an amount; if it does, the server ignores it.
- **Payments:** each payment link has its own row, and an order can have only one active link. Webhooks are verified by HMAC signature and made idempotent by a unique gateway event id. A payment that arrives on an expired or replaced link is **refunded automatically** and flagged to admins. A subscription is activated only after a verified payment, inside the same transaction.
- **Notifications:** a transactional outbox. A worker delivers them using `SKIP LOCKED`, which is safe when several instances run. SMS and email are mock adapters that write a log line.
- **Tracking:** location ingest writes to an in-memory buffer, which is flushed to the database in batches every 2 s. Customers poll every 5 s. A location is visible only from 15 minutes before the visit until the chef checks in, and only for the customer's own booking. Limitation: the buffer lives inside one process. Running more than one instance needs Redis.
- **Privacy:** phone numbers, addresses, ID numbers, PAN and bank account numbers are encrypted with AES-256-GCM. Lookups use keyed HMAC hashes. Admins see masked phone numbers and must use a reveal action, which is audited. A chef sees the customer's contact only from 2 h before the visit until 2 h after it. Ops Admins never see chef documents. The audit log is append-only, enforced by a database trigger. Logs are redacted.
- **Settings:** all business tunables, listed in Part J3, live in `system_settings`. Admins can edit them live, and every change is audited.

## Payments: Razorpay test mode

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Only `rzp_test_…` keys are accepted. Point the Razorpay webhook at `/api/v1/payments/webhook`.
**Until those keys are set**, development uses a local *sandbox gateway*. It is clearly marked TEST MODE and serves its own checkout page. It sends HMAC-signed webhooks through the same verification path, and it refuses to start in production.

## Deployment

`render.yaml` defines a free Render web service built from `backend/Dockerfile`, using Neon as the database. On start it runs `alembic upgrade head`. CI (`.github/workflows/ci.yml`) runs lint, migration up/down/check, the tests, the mobile typecheck and bundle, and the Docker build. On `main` it then calls the deploy hook.
**Rollback:** redeploy the previous image. For a schema change that has already run, run `alembic downgrade -1`. Migrations are written to be expand-first, so the previous image keeps working against the expanded schema.

## Known gaps

See the final report in the PR / handover notes: Razorpay keys, the Google Maps key, push notifications (FCM/Expo push token), real SMS, object storage (photos are on local disk), Redis for running more than one instance, the after-optimisation k6 latency run, deployment, and the design-note PDF/ERD image.
