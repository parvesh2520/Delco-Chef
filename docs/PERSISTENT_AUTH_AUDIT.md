# Persistent authentication — audit (before changes)

Scope: `backend/app/services/auth.py`, `backend/app/api/v1/endpoints/auth.py`, `backend/app/api/deps.py`,
`backend/app/core/security.py`, `backend/app/models/identity.py` (`RefreshToken`), `mobile/src/services/{api,session,auth.service}.ts`,
`mobile/src/store/index.ts`, `mobile/app/_layout.tsx`, `mobile/app/index.tsx`, `mobile/src/navigation/index.tsx`.

## What already exists (and is sound)

| Area | Finding |
|---|---|
| Access token | HS256 JWT, 15 min (`ACCESS_TOKEN_EXPIRE_MINUTES`), claims `sub, role, sid, iat, exp, jti, typ=access`. Kept in memory only on the device. |
| Refresh token | Issued on OTP verify: `secrets.token_urlsafe(48)`, stored only as HMAC-SHA256 (`secret_hash`). 30 days (`REFRESH_TOKEN_EXPIRE_DAYS`). |
| Rotation | Every refresh marks the old row `rotated_at` and issues a new row with `expires_at = now + 30 d` → sliding 30-day window already exists. |
| Sessions | `refresh_tokens.session_id` is a per-device rotation family. `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `POST /auth/logout` revoke per session, scoped by `user_id`. Every protected request checks the session is unrevoked (`session_active_clause`). |
| Device storage | Refresh token in `expo-secure-store` (Android Keystore). Nothing in AsyncStorage. |
| Single-flight | `refreshSession()` shares one in-flight promise between concurrent 401s. |
| Roles | One role per phone; role claim re-checked against the DB on every request; layout guards per role. |

So refresh tokens **are** issued, **are** stored securely, **do not** expire too early, and the refresh request itself works.
No new session table is needed.

## Why users get logged out (root causes)

1. **Any HTTP error from `/auth/refresh` wiped the refresh token** (`mobile/src/services/api.ts`): the catch cleared SecureStore whenever
   `e.response` existed — including 502/503 from a Render cold start or deploy, 500 while Neon wakes, 429. One bad moment = permanent logout.
2. **A network failure during refresh still signed the user out of the UI.** The 401 interceptor did
   `refreshSession().catch(() => null)` and then `expireSession()`, so a timeout/offline blip during a token refresh sent the user to
   "Session expired" (the token was still stored, but the user was shown the login flow and re-did OTP).
3. **Offline / slow-backend app start showed the Welcome screen.** `authService.restore()` returned `false` on a network error, so the app
   started signed out whenever the backend was unreachable or slower than 15 s (Render free-tier cold start). Users then logged in again.
4. **Lost refresh response killed the session server-side.** If the server rotated the token but the response never reached the phone
   (network drop, timeout), the phone kept the old token; its next refresh was treated as token theft and the **whole session was revoked**.
5. **`/auth/*` URLs were excluded from refresh**, so `POST /auth/logout` and `GET /auth/me` with an expired access token failed with 401:
   logout then cleared the phone but left the server session alive (security gap), and `reloadSession()` failed after 15 min.

## Other findings

- Concurrent refreshes in one app share a promise (good), but the server did not serialise refreshes per session; a second concurrent
  request with the same token was treated as reuse and revoked the session.
- A request that got 401 after another request already refreshed triggered a second rotation (harmless, but wasteful).
- No proactive renewal: a request is first rejected with 401, then refreshed and retried (works, costs one round-trip).
- JWT has no `iss`/`aud`; signature, `exp` and `typ` are validated; algorithm pinned to HS256.
- A genuinely expired session at startup showed Welcome without the "session expired" explanation.
- Tokens / OTPs are not logged (OTP is logged only by the dev log provider, by design).
