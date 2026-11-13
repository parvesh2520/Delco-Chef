# Part D: Chef Check-in and Check-out — Implementation Report

**Date:** 13 Nov 2026
**Source:** *Delco Chefs Developer Assignment.pdf*, section 8 (rules, requirements D1–D6 and the nine acceptance attempts).

## Starting point

Part D was already largely built before this pass:

- **Backend:** `services/attendance.py`.
- **Endpoints:** `/visits/{id}/check-in`, `/check-out`, `/photos`, `/customer-unavailable` and `/media/photos/{id}`.
- **Models:** `AttendanceRecord`, `AttendanceEvent`, `Photo`.
- **Tests:** `test_attendance.py`, including the PDF's nine-attempt table.
- **Mobile flow:** the chef journey (location → code → selfie → cooking timer → food photo → completion selfie → check-out), the customer code screen, and the admin attendance screens.

This pass audited all of that against the PDF and your brief. It fixed the defects below and filled the gaps. Nothing working was rewritten.

## Status by requirement

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| D1 | Check-in and check-out APIs with every rule, safe to repeat | **DONE AND VERIFIED** | The PDF table plus 27 new tests: boundaries, invalid input, concurrency, code binding |
| D2 | Chef screens (jobs, permission, weak GPS, code, selfie, timer, check-out photos) and the customer code screen | IMPLEMENTED BUT NOT DEVICE-VERIFIED | Type-checked and bundled; not run on a phone in this pass |
| D3 | Photo validation, stored outside the database, restricted access | **DONE AND VERIFIED** for validation and access. Persistent cloud storage: IMPLEMENTED, **BLOCKED** on credentials | Magic-byte JPEG/PNG check and 5 MB limit; access by role tested; S3 adapter tested with botocore's Stubber |
| D4 | Automatic closure (safe on several instances) and the duration flag | **DONE AND VERIFIED** | Boundary test (not at end+30, yes at end+30:01), repeat run, 4 concurrent workers close exactly once |
| D5 | Admin review list, correct and approve, who/what/why | Backend **DONE AND VERIFIED**; screens IMPLEMENTED BUT NOT DEVICE-VERIFIED | Approve or reject, mandatory reject reason, final decision, audit log, role checks |
| D6 | Design note on cheating | **DONE**: see the section at the end | — |

## Defects found and fixed

1. **Non-finite coordinates passed the geofence.** `"lat": "nan"` parses as a float, and `NaN` makes every comparison false. A forged request with `nan` coordinates or accuracy was therefore treated as within 200 m with good GPS. Coordinates must now be finite and in range (not 0,0), and accuracy must be reported and non-negative. An unparseable position at check-out is no longer a 500 error.
2. **The app invented GPS accuracy.** When the OS reported none, `currentPosition` sent 10, 50 or 100 m. It also used a coarse ("Balanced") fix and an unlimited-age cached position for check-in. Now:
   - Check-in asks for a high-accuracy fix.
   - A cached position is accepted only if it is under a minute old and within 100 m accuracy.
   - A missing accuracy is sent as missing, and the server asks for a new fix (`GPS_ACCURACY_POOR`, `retry: true`).
3. **A failed check-in forced the chef to retake the selfie.** The selfie was uploaded before check-in. If check-in was then refused (weak GPS, too far, too early), the retry re-uploaded the same picture, and the reuse protection rejected it (`PHOTO_REUSED`). The screen now keeps the uploaded photo and reuses it on retry. The weak-GPS message says the selfie is kept. Wrong-code errors offer "Re-enter the code", and a denied location permission opens the existing permission screen.
4. **A code lockout was invisible in the admin review list.** The PDF says "the Admin sees it", but a locked visit had no attendance record, so it showed only as a notification. A lock now creates an `exception` record with `code_locked`, visible under Exceptions with the attempt log.
5. **Admin review could not reject, and a reviewed record could be overwritten.** The review is now **Approve** (optionally correcting worked minutes) or **Reject**:
   - A rejection needs a reason of at least 5 characters, and the visit counts **0 worked minutes**, so it isn't paid.
   - A decided record is final (`ATTENDANCE_ALREADY_REVIEWED`).
   - The audit log records the decision, the exception, and worked minutes before and after.
6. **The admin detail screen showed no evidence.** It now shows:
   - the three photos, loaded with the admin's own token;
   - worked versus scheduled minutes;
   - wrong-code attempts;
   - the attempt log: every check-in/out attempt with server time, distance, GPS accuracy and device;
   - the reviewer, time and reason.
7. **A lost photo caused a 500 error.** It now returns 404 `FILE_NOT_FOUND` ("no longer available"), for example after a Render redeploy wipes the disk.
8. **The customer code screen showed wrong messages.** For a cancelled, missed or unassigned visit it said "Your chef has checked in". The message now matches the visit's real state, and the screen refreshes while the code is shown.
9. **The mobile exception type didn't match the server.** It listed values the server never sends. It now lists exactly the server's: `missing_check_out`, `unusual_duration`, `customer_unavailable`, `code_locked`, `missed_visit`.

## How each rule is enforced (server-side)

| Rule | Implementation |
|---|---|
| Within 200 m | Haversine distance computed on the server from the visit's stored address pin. The radius is a setting (`checkin_radius_m`). |
| Window: start −30 to +30 min | Server clock (`clock.now()`); the phone's time is never used. `CHECKIN_TOO_EARLY` / `CHECKIN_TOO_LATE`. |
| GPS accuracy ≤ 100 m | `GPS_ACCURACY_POOR` with `retry: true`. Exactly 100 m is accepted. |
| Assigned chef only | The visit is loaded only if `chef_id` matches; otherwise 404 (no hint that it exists). Customers and admins get 403 on chef routes. |
| 4-digit code | `numeric_code(4)` from `secrets`, generated at assignment. 5 wrong tries lock it (`CHECKIN_LOCKED`, 423). Wrong answers show tries remaining. Single use (`code_used_at`). Bound to its visit. |
| Selfie mandatory | The check-in must reference a `check_in_selfie` photo of this visit by this chef. JPEG or PNG by magic bytes, ≤ 5 MB. The same image can't be reused by the same chef (SHA-256). |
| One check-in at a time, retry-safe | Visit row lock (`FOR UPDATE`). A repeat check-in returns the same record. A partial unique index allows one open record per chef (`CHEF_ALREADY_CHECKED_IN`). 6 concurrent identical requests produce 1 record (tested). |
| Check-out | Requires a check-in, a completion selfie and a food photo. Worked minutes = server check-out time minus server check-in time. A repeat check-out returns the same record. Phone-sent times and durations are ignored (tested). |
| Unusual duration | Under 50% or over 150% of scheduled time becomes an `exception` with `unusual_duration`, and admins are notified. |
| Customer unavailable | Allowed once the window opens; flagged to admins; the customer is notified. |
| Forgot to check out | `auto_close` runs in the background worker. After scheduled end + 30 min the record becomes `needs_review` / `missing_check_out`, worked time runs to the scheduled end, evidence is kept, and admins are notified. It uses `FOR UPDATE SKIP LOCKED`, so several instances never process the same visit. |
| Audit | Every attempt, success or refusal, is stored in `attendance_events` with server time, position, accuracy, distance, device id and the result code. Admin decisions also go to the append-only `audit_logs`. |

**About hashing the code.** The brief asked to store a hash. The code is **encrypted** instead (AES-256-GCM, `FIELD_ENCRYPTION_KEY`), not hashed, because the customer's app must *display* it, which a one-way hash can't support. It is never in plaintext in the database or logs. It is returned only to that visit's own customer and only until used (tested), and a 4-digit hash would be trivially brute-forced anyway. The protections that matter are the 5-try lock, single use and binding to one visit.

## Image storage

- **Before:** photos lived on the local disk (`MEDIA_ROOT`). That is fine locally, but **Render's disk is wiped on every deploy**.
- **New:** `S3Storage` in `services/storage.py` uses `boto3` and works with Cloudflare R2, AWS S3, Backblaze B2 or MinIO. It is used automatically when `S3_BUCKET` is set.
  - The bucket stays **private**.
  - Photos are never given out by URL. `GET /api/v1/media/photos/{id}` checks the caller first (the chef who took the photo, or an Admin; everyone else gets 404, and no login gets 401), then streams the bytes.
  - Chef documents and data exports use the same store.
- **Without the bucket:** in production the server logs a warning at startup.

**Configuration you need to supply.** No credentials were invented. With Cloudflare R2 (free tier, 10 GB):
1. Cloudflare Dashboard → **R2** → Create bucket, e.g. `delco-chefs-media`. Leave public access **off**.
2. R2 → **Manage API tokens** → Create a token with *Object Read & Write* on that bucket.
3. In Render → Environment, set:
   - `S3_BUCKET` = the bucket name
   - `S3_ENDPOINT_URL` = `https://<account-id>.r2.cloudflarestorage.com`
   - `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` = from the token
   - `S3_REGION` = `auto` (already in `render.yaml`)
4. Click **Save and deploy**. The startup log line should say `file storage: s3`.

## Database

**No migration.** The existing tables already had every needed column: status, exception, worked minutes, resolution, reviewer, review time, photo references, distances and the event log. `alembic check` reports no differences.

The review decision is recorded as the prefix of the resolution note ("Approved: …" or "Rejected: …") and in the audit log's `meta.decision`. This was deliberate. A new column would have required running a migration on Neon *before* deploying, and forgetting that step would break every attendance query in production. The API exposes it as `decision`.

## Files changed

- **Backend:**
  - `app/services/attendance.py`: validation, lock record, approve/reject.
  - `app/services/storage.py`: S3 adapter, 404 for missing files.
  - `app/api/v1/endpoints/admin.py`: review fields and attempt log.
  - `app/api/schemas.py`: `decision`.
  - `app/core/config.py`: `S3_*` settings.
  - `app/main.py`: storage line in the startup log.
  - `requirements.txt`: `boto3`.
  - `.env.example`
  - `render.yaml`
- **Tests:** `tests/test_part_d.py` (new, 27 tests).
- **Mobile:**
  - `src/features/tracking/index.ts`: precise fix, no invented accuracy.
  - `app/chef/(approved)/visit/[id]/selfie.tsx`
  - `app/admin/attendance/[id]/index.tsx`
  - `app/admin/attendance/[id]/resolve.tsx`
  - `src/features/admin/EvidencePhoto.tsx` (new)
  - `src/features/admin/index.tsx`
  - `app/customer/visit/[id]/code.tsx`
  - `src/services/admin.service.ts`
  - `src/services/visit.service.ts`
  - `src/types/index.ts`
- **Already modified before this task:** `mobile/app.json` holds the EAS project ID added by your earlier `eas build`. It is unrelated to Part D; keep it.

## Tests

| Check | Result |
|---|---|
| Full backend suite (local PostgreSQL, never Neon) | **150 passed** (123 before + 27 new) |
| `test_attendance.py` (PDF acceptance table) and `test_part_d.py` | All pass |
| Regression: auth, bookings, Part C, subscriptions, payments and webhooks | All pass, unchanged |
| Ruff on changed files | No new findings (same counts as before) |
| `alembic check` | No changes needed |
| `tsc --noEmit` | Passed |
| `expo export --platform android` | Passed |

**What the new tests cover:**
- **Invalid coordinates:** NaN, out of range, (0,0), missing or negative accuracy.
- **Boundaries:** 199 m versus 201 m; accuracy 100 versus 100.5; the window at exactly −30:00, −30:01, +30:00 and +30:01.
- **Role checks:**
  - A customer can't check in.
  - An unassigned chef can't upload or check in.
  - Another customer can't see the code.
  - The chef never sees the code.
- **The code:**
  - The lock is visible to the admin, with the attempt log.
  - The right code is refused after a lock.
  - A code from another booking is refused.
  - A code can't be reused after a successful check-in.
  - 6 concurrent check-ins produce one record.
- **Check-out:**
  - Before check-in is refused.
  - A missing selfie or food photo is refused.
  - Phone times are ignored and worked minutes come from the server.
  - A duplicate check-out returns the same record.
- **Photo access:** by role, without login, and after the file is deleted.
- **S3 adapter:** put, get, missing key and delete, against a stubbed S3.
- **Auto-close:** the boundary, repeat runs, 4 concurrent workers, evidence kept.
- **Review:**
  - Reject without a reason is refused.
  - Reject sets 0 minutes, and the audit log is checked.
  - The decision is final.
  - Approve with a correction works.
  - A chef or customer can't review.

## Manual Android testing (not done in this pass)

Use a visit assigned to a test chef, with the phone at the customer pin.

1. **Customer:** open the visit, then **Show check-in code**. Check that 4 digits are shown and the screen refreshes.
2. **Chef:** Today → the visit → **Allow location**.
   - Deny the permission once and check you land on the permission screen.
   - Allow it, then start travel.
3. **Code:**
   - Enter a wrong code. The error should show tries remaining.
   - Enter the right code. It should be verified.
4. **Selfie:**
   - Indoors with weak GPS, expect "GPS signal is weak". Tap again and check you **are not** asked to retake the selfie.
   - At the address, check-in should succeed and the timer should start.
5. **Check-out:** take the food photo and the completion selfie, then **Confirm check-out**. It should show as completed with worked minutes.
6. **Admin:** Attendance → Exceptions.
   - Open an auto-closed or locked record. Check the photos load and the attempt log appears.
   - **Reject** with no reason; the button should stay disabled. Then reject with a reason: it should show Rejected, with your name and the time.
7. **Code lock:** enter 5 wrong codes. Check the admin sees a "Code locked" exception.

## Remaining work and limitations

- **Persistent photo storage needs your R2 or S3 credentials** (above). Until then, photos are lost on each Render redeploy.
- **Customer access to photos:** customers can't open evidence photos. The PDF limits access to the chef and Admins.
- **Locked check-ins:** there's no admin action to unlock a locked check-in. The PDF only asks that the Admin sees it. The admin reviews it, and the visit is closed as missed by the auto-close job.
- **Background jobs on free Render:** auto-close runs in the API process. That is safe across instances, but on the free plan it pauses while the service sleeps and catches up on wake.
- **GPS is evidence, not proof** (see D6).

## D6: How a chef could cheat, and what to do about it

**Fake GPS (mock-location apps, rooted phones, emulators)**
- *What's built:*
  - The geofence, window and accuracy checks run on the server.
  - Impossible values are refused.
  - Every attempt is logged with accuracy and device.
  - The 4-digit code needs someone at the door: a spoofed position alone can't check in.
- *What I'd add:*
  - Android's `isFromMockProvider` / `isMock` flag sent and logged.
  - Play Integrity API attestation on check-in.
  - Rejecting fixes whose accuracy is suspiciously perfect, or that jump implausibly from the previous travel point.
  - Comparing the check-in position with the live-travel trail (Part E).

**Checking in from a friend's phone, or the customer sharing the code remotely**
- *What's built:*
  - The chef must be signed in with their own OTP-verified number.
  - The code is shown only to the customer, and only before use, with a notice not to share it remotely.
  - Device ids are logged.
- *What I'd add:*
  - Bind the chef account to a registered device.
  - Flag a device id that differs from the chef's usual one.
  - Generate the code shortly before the visit, rotating, instead of at assignment.
  - Optionally a BLE or QR handshake with the customer's phone.

**Reusing a selfie, or a photo of a photo**
- *What's built:*
  - The camera is used live, not the gallery.
  - The same image file can't be used twice by the chef (SHA-256).
- *What I'd add:*
  - A perceptual hash to catch near-duplicates.
  - EXIF and capture-time checks.
  - Face match against the verified chef profile photo.
  - Liveness (blink or turn).
  - Random admin spot-checks of selfies against the profile.

**Inflating worked time**
- *What's built:*
  - Times come only from the server clock.
  - Durations outside 50–150% are flagged.
  - A forgotten check-out is capped at the scheduled end until an admin decides.
  - A rejection pays nothing.

**Overall:** GPS can't prove physical presence. It is one signal, combined with the in-person code, the selfie, the server clock and an auditable trail an admin can act on.
