# Persistent authentication — implementation report

Audit with root-cause detail: [PERSISTENT_AUTH_AUDIT.md](PERSISTENT_AUTH_AUDIT.md).

## Problems found and root causes

The backend already had a sound design (15-min JWT, 30-day sliding rotated refresh tokens hashed at rest, per-device
sessions, per-session revocation). Users were logged out by **client error handling** and one **server edge case**:

1. Any HTTP error from `/auth/refresh` (502/503 during a Render cold start or deploy, 500, 429) deleted the refresh token.
2. A network failure/timeout during a refresh sent the user to "Session expired".
3. App start while offline or while the backend was slow (>15 s cold start) opened the Welcome screen → user re-did OTP.
4. A lost refresh response (server rotated, phone never got the new token) was treated as token theft → session revoked.
5. `/auth/logout` and `/auth/me` were never retried after refresh → logout with an expired access token left the server session alive.

## Before → after

| | Before | After |
|---|---|---|
| Access token | 15 min HS256, `sub/role/sid/iat/exp/jti/typ` | Same + `iss=delco-chefs`, `aud=delco-chefs-api`; decode requires `exp, iat, sub, sid, iss, aud` |
| Refresh token | 30 d sliding, rotated, hash only | Unchanged lifetime; adds a **lost-response grace** (`REFRESH_REUSE_GRACE_SECONDS`, 300 s) and **per-session serialisation** (Postgres advisory xact lock) |
| Replay | Any rotated token → revoke session | Older rotated / revoked / beyond-grace token → revoke **that session only** (logged without token) |
| Phone: refresh failure | Any HTTP response → wipe token | Only 401/403 ends the session; offline/timeout/5xx/429 keep credentials |
| Phone: app start | Blocking refresh; offline → Welcome | Splash waits ≤ 8 s; online → silent refresh; offline/slow → opens role home from a token-free profile in SecureStore, refresh continues in background |
| Phone: renewal | Only after a 401 | Proactive renewal 60 s before expiry in the request interceptor + 401 fallback; single-flight; retry once |
| Ended session at start | Welcome, no explanation | "Session expired" screen |
| Logout | Could fail silently on expired token | Refreshes then revokes server session; keystore cleared regardless |

Lifetimes (backend settings, `app/core/config.py`): `ACCESS_TOKEN_EXPIRE_MINUTES=15`, `REFRESH_TOKEN_EXPIRE_DAYS=30` (sliding:
each refresh extends from now), `REFRESH_REUSE_GRACE_SECONDS=300`.

## Session lifecycle

1. OTP verify → new `session_id` (per device) + refresh row (hash only) + access JWT.
2. Each refresh: lock session → if token is the head: rotate (old row `rotated_at`, new head expires now+30 d).
   If token is the head's immediate predecessor and rotated ≤ 300 s ago: the phone lost the response → revoke the unseen head, issue a new one.
   Anything else rotated/revoked → revoke this session's rows → 401 `REFRESH_REVOKED`.
3. Every protected request checks signature, `exp`, `iss`, `aud`, `typ`, user active, role unchanged and session unrevoked.
4. Logout / "sign out session" revokes only that session (scoped by `user_id`); other devices continue.
5. 30 days without opening the app → refresh token expires → 401 `REFRESH_EXPIRED` → "Session expired" screen → OTP.

## Database changes

None. The existing `refresh_tokens` table (session_id family, hash, device, created/expires/revoked/rotated timestamps) already models
per-device sessions; last-used = newest row's `created_at`. `alembic check` against the local test DB: *No new upgrade operations detected.*

## Security

- Raw refresh tokens never stored (HMAC-SHA256 with `SECRET_KEY`); 384-bit `secrets.token_urlsafe(48)`.
- JWT algorithm pinned to HS256; issuer and audience validated; required claims enforced.
- Concurrent refreshes and replays of the same session are serialised; at most one live token per session survives.
- Replay revokes only the affected session; cross-user revocation impossible (all session ops filter by `user_id`).
- No tokens/OTPs logged (replay warning logs user id only). AES-256-GCM field encryption and keys untouched.
- Phone: refresh token and the token-free profile only in `expo-secure-store` (Android Keystore); access token in memory only.
- Trade-off: within 300 s of a rotation the previous token is accepted once more. A thief using it revokes the real phone's head,
  so the phone's next refresh is detected as replay and the session ends — theft is still detected, one step later.

## Files changed

Backend: `app/core/config.py`, `app/core/security.py`, `app/services/auth.py`, `tests/test_auth.py` (reuse test adapted to grace),
`tests/test_persistent_auth.py` (new).
Mobile: `src/services/api.ts`, `src/services/session.ts`, `src/services/auth.service.ts`, `src/store/index.ts` (`signOut` resets
`sessionExpired`), `app/index.tsx`, `package.json` (`test:auth` script), `tests/` (new: `auth-session.test.ts`, `register.mjs`,
`resolve.mjs`, `stubs/*`). No new dependencies (Node 24 built-in test runner).

## Tests executed (2026-11-14, local Postgres `delco-pg-test` :55432)

| Check | Result |
|---|---|
| `pytest` (full backend suite) | **209 passed** in 79 s |
| `pytest tests/test_persistent_auth.py tests/test_auth.py` | 28 passed |
| `ruff check app tests scripts --select E9,F63,F7,F82` (CI rules) | All checks passed |
| `npx tsc --noEmit` | 0 errors |
| `npm run test:auth` (mobile session logic vs fake backend) | **17 passed**, 0 failed |
| `npx expo export --platform android` | Bundle built (4.1 MB Hermes bytecode) |
| `alembic check` (local test DB) | No new upgrade operations |

Backend tests cover: session creation and lifetimes, access-token expiry, refresh, sliding rotation, old-token reuse, expired/unknown
tokens, revoked session, per-device logout, ending a session from another device, 6 concurrent refreshes → exactly one live token,
lost-response retry, replay detection, cross-user isolation, chef / ops admin / super admin / customer permissions after refresh.
Mobile tests cover: restore after restart (all four roles), offline start + recovery, 503 at start, expired session at start,
proactive renewal, 401 → refresh → retry, 10 simultaneous 401s → 1 refresh, no retry loop, network/5xx during refresh, revoked
session, logout.

**Not executed:** physical-device or emulator testing. The mobile tests exercise the real `api.ts`/`session.ts`/`auth.service.ts`
under Node with stubbed SecureStore, not on Android.

**Process note:** one `alembic check` was accidentally run with `backend/.env`, which points at Neon. `alembic check` only reflects
the schema (read-only, no writes); it was re-run against the local DB.

## Remaining limitations

- No connectivity listener (`@react-native-community/netinfo` not installed): recovery after an outage happens on the next request,
  screen refetch on app focus, or React Query retry — not instantly on reconnect.
- Refresh rows are never pruned; an active device adds a few rows per day (bounded by usage, rows are small).
- A token rotated > 300 s before the phone retries (response lost and phone offline for over 5 min) is treated as replay → OTP needed.
- An offline start shows the last known profile (e.g. chef status) until the first successful refresh updates it.
- On deploy, existing access tokens (no `aud`) get one 401 and are silently refreshed — no user impact.

## Deployment

No migration. Optional env var `REFRESH_REUSE_GRACE_SECONDS` (default 300). A new APK is needed for the mobile fixes.

## Android physical-device verification

1. Build and install the new APK (see `docs/BUILD_APK_WINDOWS.md`) over the old one; sign in once with phone + OTP.
2. Swipe the app away from recents, reopen → your home screen appears with no OTP.
3. Settings → Apps → Delco Chefs → Force stop, reopen → still signed in.
4. Restart the phone, open the app → still signed in.
5. Leave the app idle > 15 min (or background it for 20 min), return and pull to refresh / open a screen → data loads, no login.
6. Turn on airplane mode, force stop, reopen → app opens on your home screen (data shows a connection error, not a login screen).
   Turn airplane mode off, pull to refresh / switch tabs → data loads.
7. With the Render service asleep (after ~15 min idle on the free plan), open the app → splash up to ~8 s, then home; data loads once the backend wakes.
8. Sign in on a second phone with the same number, sign out on phone 2 → phone 1 stays signed in.
9. Sign out on phone 1 → Welcome screen; reopen app → still signed out.
10. Repeat 1–3 with a chef account, an ops admin and a super admin → each lands on its own home, never another role's.
