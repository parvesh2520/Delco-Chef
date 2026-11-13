# Part H: Personal Data Protection — Implementation Report

**Date:** 13 Nov 2026
**Source of truth:** *Delco Chefs Developer Assignment.pdf*, section 12 (Part H), its acceptance tests, and the role table in section 2.

## 1. Part H requirements (from the PDF)

| ID | Priority | Requirement |
|---|---|---|
| H1 | Must | A logged-in customer can request "Download my data" and receive a file (JSON or ZIP) with everything held about them: profile, needs, addresses, consents, bookings, payments (no card details), attendance and tracking summaries. Large accounts: build in the background and notify when ready. |
| H2 | Must | A customer can delete their account. Name, phone, email and addresses are erased or irreversibly anonymised. Financial records that must be kept stay, linked to an anonymous ID. Sessions are revoked. |
| H3 | Must | Phone number and address text are encrypted at field level (e.g. AES-256-GCM) with a key from configuration, not code. Searching a customer by phone still works (e.g. keyed hash). Chef ID, tax and bank account numbers are protected the same way. |
| H4 | Must | Admins see masked phones (e.g. `+91 98••••••21`) with an explicit, recorded "reveal". A chef sees the customer's full address and phone only for an active assigned booking, from 2 h before start to 2 h after end. A customer sees the chef's name, photo and skills, never documents, bank details or home address. A chef never sees customer payment information or another chef's data. |
| H5 | Should | Chef documents: visible only to a Super Admin, masked by default (last 4 characters), recorded reveal. An Ops Admin is refused. |
| H6 | Must | Every reveal, export, deletion, assignment, reassignment and admin override is recorded with who, when, what and why. Audit entries cannot be edited through the API. |
| H7 | Must | No phone numbers, OTPs, tokens or full addresses in application logs or error reports. Show how. |
| H8 | Should | Describe what is collected, why, and for how long (including photos and location history). |

PDF acceptance tests: export contains all sections and nothing of another customer; after deletion the customer row has no name/phone/email/address but payment rows remain; raw phone/address columns are encrypted; a chef asking for an address three days away, or for an unassigned customer, is refused; an Ops Admin revealing a chef document gets 403, a Super Admin succeeds and the reveal is audited.

## 2. Audit of the existing implementation

Most of Part H was already built before this pass. What was found:

| ID | Found before this pass | Gap |
|---|---|---|
| H1 | `POST/GET /v1/privacy/export`, built by the background worker via the outbox, notification when ready, 10-minute signed download URL, file expires after 7 days. Export audited. | Expired export files were never deleted from storage. |
| H2 | `DELETE /v1/customers/me`: name/email/phone/HMAC nulled, addresses overwritten, profile needs cleared, notifications blanked, open visits/requests cancelled, refresh tokens revoked, audited. Payments kept with the same (now anonymous) user id. Blocks deletion while a subscription is active. | (a) Gateway webhook payloads (`payment_events.payload`) keep Razorpay's copy of the customer's `contact` and `email`. (b) Generated export files (full personal data) stayed in storage. |
| H3 | AES-256-GCM (`app/core/security.py`), random 96-bit nonce, versioned blob `v1‖nonce‖ct+tag`; keys from env; production refuses to start with dev keys. HMAC-SHA256 `phone_hmac` with a unique partial index for lookup. Chef ID/tax numbers, bank account and UPI encrypted. | None. |
| H4 | Masked phones in admin request, customer, user and visit views; `POST /admin/users/{id}/reveal-phone` audited. Chef contact endpoint enforces assigned chef + ±2 h window. Customers see chef name only. | (a) Reveals did not require a reason ("why"). (b) The window rule was written twice; the copy in `visit_json` (used by `GET /visits/{id}`) ignored visit status, so the assigned chef could see the full address of a **cancelled** visit inside the window. It also used the wall clock instead of the server clock helper. |
| H5 | Documents and bank only in Super Admin / own-chef views, masked to last 4; reveal and file routes `super_admin_only` and audited; files streamed by the API with `Cache-Control: no-store`, never public URLs. | Reveal reason optional (same as H4a). |
| H6 | `audit_logs` table with actor id/role/name, action, target, reason, meta, timestamp; PostgreSQL trigger rejects UPDATE/DELETE; API exposes only a Super-Admin GET. Assignment, reassignment (reason required by the service), board moves, settings, payouts, attendance overrides, admin creation, chef approval, export, deletion and reveals all audited. | "Why" missing on reveals (H4a). |
| H7 | JSON log formatter with a redaction filter (phones, bearer tokens, JWTs, `otp/code/token/password/secret` values, DB credentials); uvicorn loggers routed through it; request log records path only (no query string); OTP dev line masked phone. | No test proving application logs stay clean during real flows. |
| H8 | Location points purged after 30 days (Part E). | No written note. |

## 3. Changes made

| Change | Why |
|---|---|
| `presenters.chef_contact_open()` is now the single owner of the H4 window rule (assigned, live visit, `start − 2 h ≤ now ≤ end + 2 h`). Used by `visit_json` and `GET /visits/{id}/customer`. `visit_json` now uses `clock.now()`. | Closes the cancelled-visit leak and removes the duplicated rule. |
| New `RevealIn` body (`reason`, 3–300 chars, required) for phone, document and bank reveals. | H6 "why" for every reveal. |
| Mobile document screen sends the reason `"Chef application verification"` (its only purpose). | Keeps the existing UI working with the required reason. |
| Account deletion now scrubs contact keys (`contact`, `email`, `phone`, `name`, `customer`, address keys, `vpa`, `customer_details`) from the customer's `payment_events` payloads, keeping amounts and statuses, and deletes the customer's export files. | H2: no personal fields left in kept financial rows or storage. |
| `privacy.purge_expired_exports()` plus a daily `export_retention` worker job. | Retention: export files deleted after their 7-day life. |
| `tests/test_part_h.py` (14 tests). | Section 8 security tests. |

No migration was needed (`alembic check`: no new operations). No key, schema or unrelated feature was changed.

## 4. Files modified

- `backend/app/services/presenters.py` — shared contact-window rule.
- `backend/app/api/v1/endpoints/visits.py` — uses the shared rule.
- `backend/app/api/schemas.py` — `RevealIn`.
- `backend/app/api/v1/endpoints/admin.py` — reveal routes take `RevealIn`.
- `backend/app/services/privacy.py` — payload scrub, export file deletion, `purge_expired_exports`.
- `backend/app/services/worker.py` — daily export retention job.
- `backend/tests/test_part_h.py` — new.
- `mobile/app/admin/super/chef-applications/[id]/documents.tsx` — sends the reveal reason.
- `docs/PART_H_IMPLEMENTATION_REPORT.md` — this file.

## 5. Encryption architecture (H3)

- **Algorithm:** AES-256-GCM (`cryptography` `AESGCM`), random 12-byte nonce per value, 16-byte tag. Stored as `bytea`: `b"v1" ‖ nonce ‖ ciphertext‖tag`. Tampered or wrong-key data raises instead of returning garbage.
- **Encrypted columns:** `users.phone_enc`, `addresses.line1_enc / line2_enc / landmark_enc`, `chef_documents.value_enc` (ID/tax number), `chef_bank_accounts.account_number_enc / upi_enc`, `visits.check_in_code_enc`. City, pincode and the map pin stay plain: they are needed for ranking and distance and are not the street address.
- **Key:** `FIELD_ENCRYPTION_KEY` (32 bytes, url-safe base64) from the environment; startup fails if it does not decode to 32 bytes, and production refuses development defaults.
- **Decryption** only happens in presenters for viewers who are allowed (`phone_of`, `address_json`) and in audited reveal functions. Decrypted values are never logged.

### Key rotation (designed, not built)
The `v1` prefix is the key version. To rotate: add `FIELD_ENCRYPTION_KEY_V2`, write new values with prefix `v2`, let `decrypt` pick the key by prefix, run a batch job that re-encrypts `v1` rows, then retire `v1`. `HMAC_LOOKUP_KEY` rotation needs a second hash column (`phone_hmac_v2`) filled by a batch job before switching lookups, because the hash is deterministic. Existing data keeps working throughout because the current key is never removed until no `v1` row remains.

## 6. HMAC lookup architecture

`phone_hmac = HMAC-SHA256(HMAC_LOOKUP_KEY, phone.strip())` (hex). Sign-in, OTP rate limiting and the one-role-per-phone rule look users up by this value; a unique partial index (`phone_hmac is not null`) enforces one account per number. A separate key from the encryption key means a leak of one does not expose the other; without the key, the 10-digit space cannot be brute-forced from a DB dump. On deletion the hash is nulled, so the number can register again and the old account can no longer be found by phone.

## 7. Role-based access rules

| Data | Customer | Chef | Ops Admin | Super Admin |
|---|---|---|---|---|
| Own profile, addresses, export, deletion | Yes | own chef profile (masked docs) | — | — |
| Customer phone | own | assigned live visit, ±2 h window only | masked; reveal with reason (audited) | same as Ops |
| Customer street address | own | assigned live visit, ±2 h window only; otherwise city + pincode | full (needed for operations) | full |
| Customer payments | own | never | yes | yes |
| Chef name, skills | assigned chef's name | own | yes | yes |
| Chef phone / home location | never | own | masked / none | masked / yes |
| Chef documents, bank | never | own, masked | refused (403) | masked; reveal/file with reason (audited) |
| Audit log | — | — | 403 | read-only |

Admin endpoints are guarded by `admin_only` / `super_admin_only`; a customer or chef token gets 403 on every admin route. Chef visit routes return 404 for visits not assigned to the caller, so reassignment removes access on the next request.

## 8. Data export and deletion

- **Export (H1):** `POST /v1/privacy/export` → audited → outbox event → worker builds JSON (profile, needs, addresses, consents, service interests, bookings with trials, subscriptions with off-days, payments without link URLs or card data, visits with attendance and tracking point counts, notifications) → stored privately → notification → `GET /v1/privacy/export` returns a 10-minute signed URL (HMAC with `SECRET_KEY`). File expires after 7 days and is then deleted.
- **Deletion (H2):** refused while a subscription is active (customer must cancel first, which triggers the F refund rule). Otherwise: future visits cancelled, open requests closed, addresses overwritten (`Deleted`, `000000`, neutral pin), profile needs and request notes cleared, notifications blanked, gateway payload contact fields scrubbed, export files deleted, name/email/phone/HMAC nulled, status `deleted`, all refresh tokens revoked, audit entry written. Payments, refunds, subscriptions, visits, attendance and audit rows are kept and still reference the same numeric user id, which no longer maps to a person.

## 9. Audit logging (H6)

Each entry stores actor id, role, name at the time, action, target (record reference, never the sensitive value), reason, structured meta and server timestamp. Logged: phone/document/bank reveals and document file views, export requests, account deletion, assignment and reassignment (reason required for reassignment), chef decline, second-trial push, board moves, attendance approve/reject, settings changes, payment link regenerate/resend, subscription cancellation, payout adjust/approve/paid, admin creation/activation, chef approval/rejection, unauthorised admin sign-in attempts (masked phone). Protection: a database trigger rejects UPDATE and DELETE on `audit_logs`; the API offers only `GET /admin/audit-logs` to Super Admins (PUT/PATCH/DELETE → 405).

## 10. Logging hygiene (H7)

`app/core/logging.py` formats every record (including uvicorn) as JSON and runs a redaction pass over the message and tracebacks: Indian phone numbers, `Bearer` tokens, JWTs, values of `otp/code/password/token/refresh_token/secret` keys, and database credentials. The HTTP access line logs method, path, status and time only. Phones in deliberate log lines are passed through `mask_phone`. The one exception is the development OTP line when no SMS provider is configured (assignment §3.1), which production should not use. Proof: `test_redaction_removes_phones_tokens_and_otps` and `test_no_personal_data_in_application_logs` (runs sign-up, address save, admin reveal and address read, then checks the formatted log output contains no phone, street address or token).

## 11. Data minimisation and retention (H8)

| Data | Why | Kept for |
|---|---|---|
| Customer phone (encrypted + HMAC) | Sign-in, contact on the day of service | Until account deletion |
| Name, email | Identification, receipts | Until account deletion |
| Addresses (street encrypted; city, pincode, pin plain) | Where the chef cooks; ranking by distance | Until removed by the customer or account deletion |
| Food needs, allergies | Safety and menu | Until account deletion |
| Consents | Legal record of what was accepted | Life of the account (kept as a record) |
| Bookings, payments, refunds | Service delivery, accounting and tax | Kept after deletion, anonymised (statutory accounting retention, typically 8 years in India) |
| Chef live location points | Live tracking, attendance disputes | 30 days (daily purge); only the last position per chef kept |
| Check-in selfies / visit photos | Attendance proof and disputes | Policy: 90 days. **Not yet automated** (see limitations) |
| Chef identity documents, bank details (encrypted) | Verification, payouts | While the chef is active; policy: delete 30 days after a rejected application or 1 year after offboarding. **Not yet automated** |
| Data export files | Customer's download | 7 days, then deleted (daily job) |
| OTP challenges, refresh tokens | Sign-in security | Hashed only; short-lived by design |
| Audit log | Accountability | Append-only; policy: 3 years |

## 12. Security tests and results

New file `tests/test_part_h.py` (14 tests in the first batch; 16 after section 17), all on a disposable local PostgreSQL (`delco-pg-test` container, port 55432; the test fixture refuses Neon URLs):

| Test | Covers |
|---|---|
| `test_encryption_is_randomised_authenticated_and_round_trips` | AES-GCM random nonce, round trip, tamper detection, unknown version refused |
| `test_hmac_lookup_finds_customer_without_decrypting` | HMAC lookup, normalisation, sign-in resolves same account |
| `test_phone_reveal_needs_admin_and_reason_and_is_audited` | masking, reason required, customer refused, audit who/when/what/why, no phone in audit row |
| `test_chef_token_cannot_reveal_or_read_admin_data` | chef token on admin routes → 403; chef cannot export |
| `test_contact_window_edges` | 3 days away refused; −2 h 1 min refused; −2 h and +2 h allowed; +2 h 1 min refused |
| `test_reassignment_removes_previous_chef_access_at_once` | old chef 404 on contact, visit and list; new chef allowed; reassignment audited with reason |
| `test_cancelled_visit_never_shows_contact_even_inside_window` | regression for the fixed leak |
| `test_customer_never_sees_chef_private_data` | no chef phone, bank, home location; admin route refused |
| `test_documents_and_bank_are_super_admin_only` | Ops refused on bank/file; reason required; chef sees own masked values only, cannot reveal; Super Admin file `no-store`; audit without values |
| `test_audit_log_api_is_read_only_and_super_admin_only` | Ops 403; PUT/PATCH/DELETE 405; DB DELETE rejected |
| `test_deletion_scrubs_gateway_copy_and_export_file` | raw row empty, payment kept, webhook contact/email scrubbed, export file gone, phone lookup gone |
| `test_expired_export_files_are_purged` | retention job |
| `test_redaction_removes_phones_tokens_and_otps` | log redaction |
| `test_no_personal_data_in_application_logs` | real flows leave no phone/address/token in logs |

The PDF acceptance tests were already covered in `tests/test_privacy_tracking.py` (export isolation, deletion keeps payments, raw columns encrypted, append-only trigger, chef window and unassigned chef, Ops 403 / Super Admin audited document reveal, masked phone).

**Results (13 Nov 2026):**

| Check | Result |
|---|---|
| Full backend suite | **183 passed**, 0 failed |
| `tests/test_part_h.py` + `tests/test_privacy_tracking.py` | 24 passed |
| Ruff, CI rules (`--select E9,F63,F7,F82` on app, tests, scripts) | All checks passed |
| Ruff on new test file | Clean apart from the repo-wide `B008` FastAPI `Depends` pattern |
| `alembic check` (disposable test DB) | No new upgrade operations |
| `npx tsc --noEmit` (mobile) | Passed |

## 13. Known limitations

- Photo/selfie and chef-document retention are documented policies, not scheduled jobs (not required by the PDF; see section 17).
- Key rotation is designed (section 5) but not implemented; there is one active key version (not required by the PDF; see section 17).
- The redaction filter is pattern-based. Section 17 widened it (spaced/prefixed phones, PostgreSQL DETAIL values) and turned off SQLAlchemy's parameter dumps; a free-text address typed into a log message by future code would still not be caught.
- Admins (Ops and Super) see the customer's full street address in admin screens; the PDF only requires phone masking for admins, and operations need the address.
- Outbox events already delivered keep their notification text; these do not contain phones or addresses.
- Customer visit and trial views return only the assigned chef's name. H4 allows the photo and skills as well; they were not added in this pass.
- Exports are JSON only, not ZIP.

## 14. Environment variables

| Variable | Purpose |
|---|---|
| `FIELD_ENCRYPTION_KEY` | 32-byte url-safe base64 AES-256-GCM key |
| `HMAC_LOOKUP_KEY` | 32-byte url-safe base64 key for phone lookup hashes |
| `SECRET_KEY` | JWT signing, OTP/refresh-token hashing, signed export URLs |
| `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Private object storage (Cloudflare R2 or S3) for documents, photos and exports |
| `ENVIRONMENT=production` | Enables the refusal to start with development keys |

Generate a key: `python -c "import os,base64;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"`.

## 15. Production configuration

1. Set distinct, random `FIELD_ENCRYPTION_KEY`, `HMAC_LOOKUP_KEY` and `SECRET_KEY` in the host's secret store (Render environment), never in the repo. Back them up securely: losing `FIELD_ENCRYPTION_KEY` makes encrypted data unreadable.
2. **Do not change the keys of an existing database** without the rotation procedure in section 5.
3. Use a private R2/S3 bucket (no public access, no public bucket URL). All files are served through authenticated API routes.
4. Run the background worker (`RUN_WORKERS=true`) so exports are built and the location/export retention jobs run.
5. Configure a real SMS provider so the development OTP log line is never used.
6. Restrict database access so only the application role can write; the audit-log trigger blocks UPDATE/DELETE even for that role.

## 16. Not verified (needs device or production)

- The mobile document review screen sending the reveal reason has passed type checking only; it has not been run on a device.
- Export download, deletion and reveal flows have not been run on a device or against the deployed Render + Neon stack in this pass.
- Real Razorpay webhook payloads were not available; the scrub was tested with a Razorpay-shaped payload.
- Production startup with production keys and the R2 bucket was not exercised.

## 17. Follow-up batch (13 Nov 2026, with Part G)

### Retention requirement check
The PDF asks for: raw location points deleted after 30 days (Part E6, already done) and, under **H8 (Should)**, a *description* in the note of what is collected, why and for how long, "including photos and location history". It does **not** require automatic deletion of attendance selfies, food photos or chef documents, and sets no retention periods for them. No cleanup job was added; the periods in section 11 remain a documented policy and a future improvement. A future job should: select expired `photos` / `chef_documents` rows, delete the object first, null `storage_key` only after the delete succeeds (so a storage failure is retried next run and the DB never points at a missing file without knowing it), and log counts only.

### Key rotation check
The PDF (H3) requires field encryption with a key from configuration and a working phone search. It does not require rotation. Not implemented; the design in section 5 stands. No keys or encrypted records were touched.

### Log redaction: gap found and fixed (H7)
Investigation: phones and addresses are encrypted before they reach SQL, but **unhandled database errors were logged with every bound value** (SQLAlchemy's `[parameters: …]` block), and PostgreSQL's own `DETAIL: Failing row contains (…)` / `Key (…)=(…)` lines echo row values. These can include names, emails and allergy notes. A new test proved the DETAIL leak.

Changes:
- `app/core/database.py`: engine created with `hide_parameters=True` (SQLAlchemy no longer prints bound values in errors).
- `app/core/logging.py`: redaction of PostgreSQL `Failing row contains (…)` and `Key (…)=(…)` values; the phone pattern now also matches `98765 43210`, `98765-43210`, `+91-98765-43210`, `09876543210` and `919876543210`, while amounts, dates, IDs and 5–6 digit pincodes are left alone.

### Tests added (`tests/test_part_h.py`, now 16)
- `test_redaction_catches_spaced_and_prefixed_phone_formats` — six phone formats redacted; a line with an amount, a date, a visit id and a pincode unchanged.
- `test_database_errors_do_not_carry_bound_values` — a real constraint violation with fake values: SQLAlchemy parameters hidden, and the formatted log record contains neither the name nor the email.

### Results
Full backend suite **190 passed**, 0 failed (includes all Part H tests as regression). Ruff CI rules clean. No migration.

### Remaining Part H limitations after this batch
- Photo/selfie and chef-document deletion: documented policy only.
- Key rotation: designed only.
- Free text that future code logs on purpose is not pattern-detectable; reviews must keep personal values out of log calls.
- Nothing in this batch was verified on a device or in production.
