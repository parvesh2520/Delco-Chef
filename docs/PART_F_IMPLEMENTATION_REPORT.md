# Part F: Payments and Refunds — Implementation Report

**Date:** 12 Nov 2026
**Source of truth:** *Delco Chefs Developer Assignment.pdf*, section 10 (Part F) and its acceptance tests.

## Status by requirement

| ID | Priority | Status | Notes |
|---|---|---|---|
| F1 Automatic link, price snapshot, expiry, replacement | Must | DONE AND VERIFIED | Was already working. Tested locally. One real Razorpay test payment was completed earlier. |
| F2 Order → checkout → server-verified status → activation | Must | IMPLEMENTED BUT NOT VERIFIED (new part) | The signed redirect is now also confirmed with Razorpay's API before activation. The API call itself was checked against real Razorpay test mode (read-only). A full payment through the new code has not been done on a device. |
| F3 Webhook with signature check and idempotency | Must | IMPLEMENTED BUT NOT VERIFIED | Tested locally with Razorpay-shaped payloads through the real adapter. **No real Razorpay webhook has reached this server**: there is no webhook secret and no public URL yet (see "What you must configure"). |
| F4 Failed payment, retry, notification | Must | IMPLEMENTED BUT NOT VERIFIED | Tested locally. Matching a real `payment.failed` to its order relies on `notes.reference`, which a real test payment does carry. A real failed webhook has not been received. |
| F5 Cancellation and refund | Should | IMPLEMENTED BUT NOT VERIFIED | Server-side quote and cancellation. Refunds are tracked as requested → processed or failed. Customer cancellation UI added. No real Razorpay refund has been made. |
| F6 Link expiry and 7-day close | Should | IMPLEMENTED BUT NOT VERIFIED | Boundary, repeat-run and race-safety tests pass locally. |
| F7 Admin link screen and customer history with receipt | Should | IMPLEMENTED BUT NOT VERIFIED | Screens use real API data. Not tested on a device. |
| F8 Reconciliation job | Stretch | NOT IMPLEMENTED | Out of scope. |

"Verified" here means tested against real Razorpay test mode or on a device. Everything above passes its local tests.

## Already working, kept as it was

- Automatic link on Subscribe, with the price computed on the server and frozen on the order.
- 48-hour validity (a setting), and one active link per order.
- Regenerating a link kills the old one at once.
- Unique webhook event IDs.
- Automatic refund when money arrives on a dead link. This is the README choice the PDF asks for.
- Payment states CREATED, PAID, FAILED, REFUNDED and PARTIALLY_REFUNDED.
- Late payment moves the cycle but not the price.
- Admin resend and regenerate; the Admin can never edit an amount.
- The sandbox gateway for development without keys (refused in production).

## Bugs found and fixed

1. **Real `payment.failed` webhooks were dropped.** Razorpay's `payment.failed` carries only the payment entity, with no payment-link ID, so every failure ended as `unknown_link`. The payment never became FAILED and the customer was never told. Failures are now matched to the order through our reference in the payment's notes, which a real test payment confirmed is present.
2. **A delayed successful payment could be refunded by mistake.** A customer who paid just before the 48-hour expiry, with the webhook arriving after the expiry job ran, was auto-refunded and not activated. A link now accepts a payment made before it expired, judged by Razorpay's payment time. Replaced and cancelled links still refuse money at once, as the PDF requires.
3. **A browser redirect alone could activate a subscription.** The signed redirect is now checked with `GET /payments/{id}`: the payment must be `captured` and for exactly the link amount. If Razorpay can't be reached, nothing changes and the webhook settles it later.
4. **`refund.failed` was ignored.** A refund the gateway rejected stayed "requested" forever. It is now marked `failed`, Admins are notified, and the payment stays PAID.
5. **A late failure after a refund.** A failure event arriving after a refund or partial refund could overwrite the payment state to FAILED. Only CREATED or FAILED payments can now become FAILED, and failures on cancelled orders are ignored.
6. **Contact details in stored webhook payloads.** The full payload (customer email, phone, UPI ID) was stored in `payment_events`. Only the fields needed for processing and support are kept now.
7. **The 7-day close could race with a payment.** The job locked the request first and the payment confirmation locked the payment first, so the two could deadlock. The job now locks in the same order (payment, then request), re-checks under the locks, and commits each card separately. Customer cancellation uses the same order.

## New functionality

- **Refund preview before cancelling:** `GET /subscriptions/{id}/cancel-preview` returns the server's refund amount for "now". Cancellation uses the same `refund_quote()`; the app never sends or computes an amount.
- **Refunds on payments:** `payment_json` now lists refunds (amount, status, reason, requested and confirmed times) for customers and Admins.
- **Link history for Admins:** `payment_json` also lists every link of the order (Active, Paid, Expired, Replaced, Cancelled), for Admins only.
- **Mobile:**
  - Customer **Cancel subscription** with the server's refund shown before confirming.
  - The receipt screen shows the receipt number, plan period, visits and refund status, with a **Share receipt** action, and shows the failure reason with **Retry payment**.
  - The Admin payment screen shows refund history, link history and action errors. Regenerate is hidden for cancelled orders.
  - Refunded filters on the Admin links list.

**Cancellation after the first visit:** the PDF leaves this out of scope, so no policy was invented. The server refuses it with `REFUND_NOT_ALLOWED` ("handled by support"). A proposed policy belongs in the design note; it is still unresolved.

## Files changed

- **Backend:**
  - `app/services/gateway.py`
  - `app/services/payments.py`
  - `app/services/presenters.py`
  - `app/api/v1/endpoints/customers.py`
- **Backend tests:** `tests/test_part_f.py` (new, 18 tests).
- **Mobile:**
  - `app/customer/payment/[id].tsx`
  - `app/customer/subscriptions/[id]/index.tsx`
  - `app/admin/payments/[id].tsx`
  - `app/admin/payments/links.tsx`
  - `src/features/payments/RefundList.tsx` (new)
  - `src/features/payments/index.ts`
  - `src/services/booking.service.ts`
  - `src/types/index.ts`

**Migrations:** none. The existing `payment_events`, `refunds` and `payment_links` tables already had the needed columns and constraints.

## Test results (local PostgreSQL on :55432; Neon never touched)

| Check | Result |
|---|---|
| Full backend suite | **120 passed** (102 before + 18 new) |
| `tests/test_part_f.py` | 18 passed. Covers: valid and invalid signature, missing secret, duplicate delivery, delayed delivery, payment after expiry, replaced link, failure without a link ID, retry, failure after success, amount mismatch, redirect confirmed with the gateway (failed, wrong amount, gateway down, then captured), full refund, 50% refund at exactly 2 h, duplicate cancel, `refund.failed`, cancel after first visit, unpaid cancel, 7-day boundary (just under / over), repeat runs, paid card never closed, money after closure refunded, roles |
| Earlier payment tests (`test_payments.py`, sandbox path) | Pass, unchanged |
| Ruff | No findings in new files; changed files have the same counts as before |
| `tsc --noEmit` | Passed |
| `expo export --platform android` | Passed |
| `alembic check` | Head `e66cdf57002d`, no new operations |

### Checked against real Razorpay test mode (read-only, this session)

- `GET /payments/{id}` through the new `fetch_payment` returned `captured`, the amount in paise and the payment time for an existing test payment.
- That real payment-link payment carries `notes.reference`, which the `payment.failed` fix relies on.

### Not verified against Razorpay

- A real webhook delivery: no secret and no public URL.
- A real failed payment.
- A real refund.

## What you must configure

1. **A public HTTPS URL for the backend.** Razorpay cannot reach `http://10.200.62.38:8000`. Use the Render deployment, or for local testing a tunnel such as `ngrok http 8000`. Then set `PUBLIC_BASE_URL` to that URL. The checkout redirect also uses it.
2. **The webhook, in the Razorpay Dashboard (Test Mode)** → Account & Settings → Webhooks → Add:
   - **URL:** `https://<public-host>/api/v1/payments/webhook`
   - **Secret:** a long random string of your choosing.
   - **Active events:**
     - `payment_link.paid`
     - `payment_link.expired`
     - `payment_link.cancelled`
     - `payment.failed`
     - `refund.processed`
     - `refund.failed`
3. **Environment variables** in `backend/.env` locally, or as secrets on Render (`render.yaml` already lists them):
   - `RAZORPAY_KEY_ID`: set already (`rzp_test_…`).
   - `RAZORPAY_KEY_SECRET`: set already.
   - `RAZORPAY_WEBHOOK_SECRET`: **missing**. Use the same string as the dashboard secret.
   - `PUBLIC_BASE_URL`: the public URL from step 1.

   Restart the server afterwards. Without `RAZORPAY_WEBHOOK_SECRET`, every webhook is rejected with 400; this is intentional.
4. **Then verify in test mode:**
   - Pay one link with a test card or UPI `success@razorpay`.
   - Fail one with `failure@razorpay` or a failing test card.
   - Cancel one paid subscription more than 2 h before the first visit, and one within 2 h.
   - In the dashboard's webhook log, check every delivery returned 200.
   - In `payment_events.outcome` you should see `paid`, `failed`, `refund_processed`, and `duplicate` for any retries Razorpay makes.

## Manual Android checks

Nothing in this pass was run on a device.

1. Subscribe → pay with a test success → the receipt shows Paid, a receipt number and Share receipt; the subscription is active.
2. Pay with a test failure → the notification arrives; the receipt shows the failure reason and **Retry payment** reopens the same link.
3. Let a link expire, or set validity to 1 h in Settings → "Get a new payment link" → the old link is refused.
4. Cancel an active subscription:
   - The dialog shows the server's refund, full or 50%.
   - Afterwards the receipt shows "Refund requested".
   - Once the `refund.processed` webhook arrives, it shows "Refunded".
5. Admin → Payments:
   - Refund filters.
   - The payment details show refund history and link history (Replaced and Paid links).
   - Resend and regenerate work, and their errors are shown.
6. Small (360 dp) and large screens.

## Known limitations

- **Refund call can be lost.** If Razorpay accepts a refund but our database commit then fails, a retried cancellation could request a second refund. The window is very small, and the cancellation is refused once committed. Razorpay refunds have no idempotency key in the current adapter.
- **Failure matching depends on the reference.** It works only if the link's `notes.reference` is present. Links created by this code always set it, and real data confirms Razorpay copies it to the payment.
- **The sandbox trusts its own redirects.** In development without keys, the sandbox gateway has no payment API, so its signed redirect is trusted. It refuses to run in production.
- **No retry for failed refunds.** A refund that fails at the gateway is flagged to Admins; there is no in-app re-try. Support handles it.
- **F8 reconciliation** (finding payments stuck in CREATED) is not implemented.
- **Cancellation after the first visit** has no policy yet; it needs your decision.
