# Render Deployment Report

**Date:** 12 Nov 2026

**Outcome:** the project is prepared and verified locally, in production mode, inside the exact Docker image Render will build. **It has not been deployed.**

- **Deployment needs your Render, Neon and Razorpay access**, and nothing was pushed to GitHub, which Render builds from.
- **No deployment URL exists yet.**
- **Nothing in this report is marked as verified on Render or through a real Razorpay webhook.**

The step-by-step guide is in `docs/RENDER_DEPLOYMENT_GUIDE.md`.

## Problems found (Phase 1 audit) and what was done

| # | Problem | Severity | Status |
|---|---|---|---|
| 1 | **No `.dockerignore`.** `COPY . .` put `backend/.env` (Neon password, encryption keys, Razorpay secret) and the local `.venv` into the image | Critical | IMPLEMENTED, VERIFIED LOCALLY (the image contains no `.env` or `.venv`; 348 MB) |
| 2 | **Production login was impossible.** With `ENVIRONMENT=production` the mock SMS provider never writes the OTP anywhere, and there is no real SMS provider | Critical | IMPLEMENTED, VERIFIED LOCALLY. New explicit switch `OTP_LOG_CODES` (default false; `render.yaml` sets true for the demo). An OTP login worked in the production-mode container. |
| 3 | The container ran `alembic upgrade head` against Neon **on every start** | High (you asked that migrations not run without approval) | IMPLEMENTED. Now opt-in with `RUN_MIGRATIONS=true`; `render.yaml` sets false; docker-compose sets true for the local stack. |
| 4 | **EAS cloud builds would point at `10.0.2.2`.** The API URL lived only in the git-ignored `mobile/.env`, which EAS doesn't upload | Critical for the APK | IMPLEMENTED. `eas.json` sets the URL per profile, and release builds no longer fall back to a local address. |
| 5 | The app didn't refresh when returning from the Razorpay page (React Query had no foreground listener) | High | IMPLEMENTED, type-checked. Not tested on a device. |
| 6 | The payment pending screen polled every 4 seconds with no stop condition | Medium | IMPLEMENTED. Stops at a final state or after 10 minutes; *Check again* restarts it. |
| 7 | **Bug:** "Generate new link" in the app only re-read the order, so an expired link could never be renewed from the app | High | IMPLEMENTED. It now calls the existing regenerate endpoint. |
| 8 | Opening the payment page didn't lead to the confirmation screen | Medium | IMPLEMENTED |
| 9 | `uvicorn --proxy-headers` without `--forwarded-allow-ips`, so Render's proxy headers were ignored | Low | IMPLEMENTED |
| 10 | `/version` would always say `dev` on Render (no build arg there) | Low | IMPLEMENTED, VERIFIED LOCALLY. Falls back to `RENDER_GIT_COMMIT`. |
| 11 | Database URLs in connection errors could be logged with their password | Medium | IMPLEMENTED, VERIFIED LOCALLY (test) |
| 12 | `render.yaml` had no region (Neon is in Singapore), no pool limits, and no OTP or migration switches | Medium | IMPLEMENTED |
| 13 | `.env.example` was missing variables and didn't say how names map to the ones you listed | Low | IMPLEMENTED |
| 14 | README said migrations run on start | Low | IMPLEMENTED |

**Unchanged by design:**
- Payment business logic and the webhook implementation (signature, idempotency, ordering, privacy). Nothing deployment-related required changing them.
- API routes, JWT, RBAC, CORS policy (off for the native app, never `*` with credentials) and the health endpoint. The health endpoint already checks the database.

## Files

- **Created:**
  - `backend/.dockerignore`
  - `backend/tests/test_deploy_config.py`
  - `docs/RENDER_DEPLOYMENT_GUIDE.md`
  - `docs/RENDER_DEPLOYMENT_REPORT.md`
- **Modified (backend and config):**
  - `backend/Dockerfile`
  - `render.yaml`
  - `docker-compose.yml`
  - `backend/.env.example`
  - `backend/app/core/config.py`
  - `backend/app/core/logging.py`
  - `backend/app/services/auth.py`
  - `README.md`
- **Modified (mobile):**
  - `mobile/eas.json`
  - `mobile/.env.example`
  - `mobile/src/constants/index.ts`
  - `mobile/src/services/index.ts`
  - `mobile/app/customer/payment/pending.tsx`
  - `mobile/app/customer/payment/link.tsx`
- **Not changed:**
  - `requirements.txt` and `package.json`.
  - No migrations.
  - Your local `backend/.env` and `mobile/.env`.

## Deployment architecture

- **Service:** one Render Docker web service, free plan, in Singapore (next to Neon `ap-southeast-1`), health-checked on `/health`.
- **Process:** a single uvicorn process with the in-process background worker. Run exactly one instance.
- **Database:** Neon, using the pooled URL for the app and the direct URL for Alembic.
- **Build:** Docker build of `backend/Dockerfile` (Render does this; no build command).
- **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*' --no-server-header --timeout-graceful-shutdown 20`, with an optional `alembic upgrade head` first when `RUN_MIGRATIONS=true`.

## Environment variable checklist

The full table (purpose, source, sensitivity) is in guide section 4.

| Variable | Status |
|---|---|
| `ENVIRONMENT`, `DEBUG`, `RUN_WORKERS`, `RUN_MIGRATIONS`, `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `OTP_PROVIDER`, `OTP_LOG_CODES` | IMPLEMENTED (values in `render.yaml`) |
| `SECRET_KEY` | IMPLEMENTED (Render generates it) |
| `DATABASE_URL`, `DIRECT_URL`, `FIELD_ENCRYPTION_KEY`, `HMAC_LOOKUP_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | REQUIRES USER ACTION (copy from your local `.env` into Render) |
| `PUBLIC_BASE_URL` | REQUIRES USER ACTION (your Render URL) |
| `RAZORPAY_WEBHOOK_SECRET` | REQUIRES USER ACTION (generate; set in both Render and Razorpay) |

Your local `FIELD_ENCRYPTION_KEY` and `HMAC_LOOKUP_KEY` were checked, without printing them, to pass the production secret check. They must be reused, because the Neon data was written with them.

**Name mapping for the variables you listed:**
- `JWT_SECRET_KEY` → `SECRET_KEY`
- `JWT_ALGORITHM` → fixed HS256 in code
- `CORS_ORIGINS` → `BACKEND_CORS_ORIGINS`

## Tests executed

| Check | Result | Status |
|---|---|---|
| Backend pytest, full suite, local PostgreSQL (never Neon) | **123 passed** (120 before + 3 new deployment-config tests) | VERIFIED LOCALLY |
| Ruff | Changed files: no new findings. The one import-order note in `config.py` predates this work. | VERIFIED LOCALLY |
| Database connectivity to Neon | Read-only query succeeded | VERIFIED LOCALLY |
| Alembic | Neon `alembic_version` = `e66cdf57002d`; `alembic heads` = `e66cdf57002d` | VERIFIED LOCALLY |
| Docker build | Built; image has no `.env`, `.venv` or tests | VERIFIED LOCALLY |
| Container in production mode (`PORT=10000`, `ENVIRONMENT=production`, local test database, throwaway keys) | See the list below | VERIFIED LOCALLY |
| TypeScript `tsc --noEmit` | Passed | VERIFIED LOCALLY |
| `expo export --platform android` | Passed | VERIFIED LOCALLY |
| `npx expo lint` | **Not run.** The project has no ESLint configured, and that command installs packages and edits `package.json`, as happened in the previous session. | — |

**Production-mode container checks:**
- `/health` returns 200 with database ok and the migration id.
- `/version` reports the commit, taken from `RENDER_GIT_COMMIT`.
- An OTP request followed by verification returned a token.
- A webhook without a signature got 400.
- An admin API without a token got 401.
- The logs contained no credentials.

## Database migration status

**No migration is needed for the first deploy.** Neon is already at head (`e66cdf57002d`). No migration command was run against Neon. The procedure for future migrations (Neon branch first, then `alembic upgrade head` with `DIRECT_URL`) is in guide section 6.

## Security checks

| Check | Result |
|---|---|
| `DEBUG` false and `ENVIRONMENT=production` in `render.yaml` | Done; production refuses weak secrets |
| Secrets kept out of Git and the image | `.env` is git-ignored; image verified clean |
| CORS | Off by default (native apps need none); credentials never allowed |
| JWT and RBAC | Unchanged; admin without a token returns 401 |
| Rate limiting | OTP requests are rate-limited and wrong codes lock out (429). **No general API rate limiter** (limitation) |
| Request size | Photo uploads are capped at 5 MB (413) |
| Production errors | Generic message to clients; stack traces only in logs, with redaction |
| Health and version | Expose no hosts, credentials or stack traces |
| Webhook | Requires a valid signature; missing secret means everything is rejected |

## Mobile app configuration changes

- **API URL:**
  - Local development uses `mobile/.env`.
  - EAS preview and production builds use `eas.json` → `https://delco-chefs-api.onrender.com/api/v1`. Edit it if your Render URL differs.
- **Refresh on resume:** the app refreshes queries when it returns to the foreground.
- **Payment confirmation:**
  - Opening the payment page leads to the confirmation screen.
  - That screen polls only while open, stops at a final state or after 10 minutes, and offers *Check again*.
  - The app has no way to mark a payment paid.
- **Fixed:** "Generate new link" now really regenerates the link.
- **No dependency changes.** A new EAS build is needed for the Render URL to reach an installed app.

## Razorpay webhook readiness

| Item | Status |
|---|---|
| Endpoint `POST /api/v1/payments/webhook` with signature verification, idempotency and ordering safety | IMPLEMENTED, VERIFIED LOCALLY (Part F tests) |
| Rejects everything while `RAZORPAY_WEBHOOK_SECRET` is unset | VERIFIED LOCALLY (production container) |
| Public HTTPS URL | REQUIRES USER ACTION (deploy) |
| Dashboard webhook and secret | REQUIRES USER ACTION (guide section 8) |
| Delivery from Razorpay | Not done. Needs the steps above; then it can be marked VERIFIED THROUGH REAL RAZORPAY WEBHOOK. |

## Deployment status

| Step | Status |
|---|---|
| Configuration and code ready | IMPLEMENTED |
| Docker image and production mode | VERIFIED LOCALLY |
| Push to GitHub | REQUIRES USER ACTION (nothing committed or pushed, as instructed) |
| Render service | REQUIRES USER ACTION. Not DEPLOYED; no URL yet. |
| Health, login and role APIs on Render | Not yet VERIFIED ON RENDER |

## Remaining limitations

- **Free plan:** sleeps when idle (about 1 minute cold start, longer than the app's 15-second request timeout), and its temporary disk wipes uploaded photos and documents on every deploy. Jobs pause while it sleeps and catch up on wake. Guide section 15 has more, plus the Starter plan recommendation.
- **One instance only:** in-process jobs and the live-location buffer.
- **No real SMS:** OTPs are read from Render's logs while `OTP_LOG_CODES=true`. Not acceptable for real users.
- **No general API rate limiter or WAF.** OTP endpoints are protected.
- **Public API docs:** `/api/v1/docs` is public.
