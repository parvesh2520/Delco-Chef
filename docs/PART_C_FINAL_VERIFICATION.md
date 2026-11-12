# Part C: Final Verification

**Date:** 12 Nov 2026
**Source of truth:** *Delco Chefs Developer Assignment.pdf*, section 7 (Part C), including the test data and trial tests on pages 9–10.
**Code inspected:** the working tree at `c891ca8`, plus the Part C commit `d38a7de`. No separate "Part C implementation report" exists in the repo. `docs/PROJECT_STATUS_AUDIT.md` predates `d38a7de`, so its C5, C7 and C9 gaps (no history or close UI, no schedule screen, no summary UI, decision screen ignoring `allowedDecisions`, BUG-1, BUG-2) are already fixed in code and covered by tests.

## Status by requirement

| ID | Priority | Status | Evidence |
|---|---|---|---|
| C1 Service rules on every path | Must | DONE AND VERIFIED | Server-only rule. `test_trials.py` (open request, third trial on customer/board/assign API, placeholder services, no subscribe without a completed trial, late cancel counts), plus `test_second_counted_trial_on_a_new_request_reaches_the_final_decision` |
| C2 Decision step | Must | IMPLEMENTED BUT NOT DEVICE-VERIFIED | Server: allowed choices, refusals with `DECISION_NOT_ALLOWED`, `DECISION_ALREADY_MADE` for a double tap, row locks for concurrent devices, `decided_at` stored. UI renders only `allowedDecisions`, disables taps while submitting and re-fetches on 409. **Fixed:** `allowedDecisions` now matches what the server accepts |
| C3 Admin trial queue | Must | IMPLEMENTED BUT NOT DEVICE-VERIFIED | Ranked suggestions, assign / reassign with a reason, notifications to chef and customer, and offer expiry, all tested |
| C4 Push second trial | Must | IMPLEMENTED BUT NOT DEVICE-VERIFIED | Codes `PUSH_TRIAL1_NOT_COMPLETED`, `PUSH_ALREADY_SUBSCRIBING` and `TRIAL_LIMIT_REACHED`. Audit log entry. Cancelling 3 h before → not counted → push again. All tested |
| C5 Board API and screen | Must | IMPLEMENTED BUT NOT DEVICE-VERIFIED | The 8 columns plus Closed match the PDF table. Every move records from, to, actor, time and note. Request → Payment done is refused. Manual close only from Request or Subscription requested. **Fixed:** the server now requires a close reason; closing an unpaid card now cancels its order and payment link |
| C6 Subscription and payment | Must | IMPLEMENTED BUT NOT DEVICE-VERIFIED | Price is computed on the server (the client `amount` is ignored). Payment link is created automatically. The plan activates only on confirmed payment, with the late-payment shift. `subscriptions.request_id` is unique, so no duplicate subscriptions. Tested |
| C7 Schedule generation | Must | DONE AND VERIFIED (endpoint); screen IMPLEMENTED BUT NOT DEVICE-VERIFIED | PDF monthly and custom numbers reproduced. Real visit status and chef per day; no chef shown when none is assigned. Upcoming / Past / All filters. **Fixed:** missed days and off-days that fall on extension days |
| C8 Off-day calendar | Should | IMPLEMENTED BUT NOT DEVICE-VERIFIED | Free-days counter, forfeits from the 3rd off-day, chef notified, missed-day extension, no duplicate visits on re-sync. Tested |
| C9 Stage timestamps and summary | Should | IMPLEMENTED BUT NOT DEVICE-VERIFIED | Timestamps for request, assigned, trial done, subscription requested and paid. Counts, conversion and average time to assignment. Admin-only (403 otherwise). Tested |
| C10 Complaints | Stretch | NOT IMPLEMENTED | Out of scope until Must items are device-verified |

## Bugs found and fixed

1. **A customer's second trial on a new request got stuck.**
   - How it happened: trial 1 was cancelled inside the 2-hour window (counted, request closed), or the customer subscribed and the order then lapsed. A new trial request then created trial #2, but its card started in *Request*.
   - Result: after completion the card sat in *Trial 1: awaiting decision*, while `decide()` expected *Trial 2: awaiting decision*. Every choice was refused. Cancelling that trial also failed with `BOARD_INVALID_TRANSITION`.
   - Fix: such a card now starts in *Trial 2: requested* and follows the PDF's Trial 2 path (requested → scheduled → awaiting decision → Subscribe or Reject). Cancelling a request's only trial closes the card.
   - Where: `services/bookings.py` (`create_request`, `cancel_trial`, new `decision_stage()`).
2. **`allowedDecisions` advertised choices the server refused.**
   - When: after an Admin pushed trial 2, or after the card was closed. The app re-fetched on 409 and showed the same refused buttons again.
   - Fix: choices are now offered only while the card is in that trial's awaiting-decision column, which is the same rule `decide()` uses.
   - Where: `services/presenters.py::trial_json`.
3. **Manual close.**
   - (a) The server accepted a close with no reason; only the app enforced one. It now returns `CLOSE_REASON_REQUIRED` (422).
   - (b) Closing a card in *Subscription requested* left the subscription `pending_payment` with a live payment link, so the customer could still pay for a closed card. The order and its links are now cancelled, at the gateway too.
   - The 7-day unpaid job now uses the same helper, `payments.cancel_unpaid_order`.
4. **Schedule extension days.**
   - A missed visit on an extension day did not extend the plan again, and the day still counted as served.
   - An off-day on an extension day was accepted by the API but ignored by the schedule.
   - Fix: `domain/schedule.py` now extends until every missed day in the extended plan has its replacement. This works for both Monthly and Custom (next chosen weekday). The PDF numbers are unchanged.

The earlier fixes were re-checked and still hold: subscription assignments don't expire as offers, the first subscription day is after the last trial, cross-service overlaps are held for an Admin, and the dev helper refuses expired offers. Their tests in `test_subscription_scheduling.py` pass.

## Files changed

- Backend:
  - `app/domain/schedule.py`
  - `app/services/bookings.py`
  - `app/services/payments.py`
  - `app/services/presenters.py`
- Tests: `tests/test_part_c_verification.py` (new, 8 tests; all 8 failed before the fixes).
- Frontend: none. The screens already use the server's values, and the API contracts are unchanged. The only addition is the new `CLOSE_REASON_REQUIRED` error, which the app's close dialog already prevents by requiring a reason.

## Test results (local PostgreSQL `delco-pg-test` on :55432, never Neon)

| Check | Result |
|---|---|
| Full backend suite | **102 passed** (94 before + 8 new) |
| Part C, trial, subscription, payment, booking and domain tests | 67 passed |
| Ruff | No new findings in changed files (same counts before and after). About 386 pre-existing findings repo-wide (mostly B008 and F401). The repo has no ruff config. |
| `tsc --noEmit` | Passed |
| `expo export --platform android` | Passed (3.7 MB Hermes bundle) |
| `alembic check` | At head `e66cdf57002d`; "No new upgrade operations detected" |

## Migrations

None required. No model or schema changes.

## Manual Android testing still required

Nothing in this pass was run on a device.

1. Decision screen after trial 1 and after trial 2. Try a double tap, and deciding on two phones at once.
2. Admin board columns and card history.
3. Close dialog: the reason is required, the card leaves the board, and the customer's payment link stops working.
4. Push trial 2, then the customer cancels it.
5. Pay through Razorpay test mode, then check the schedule screen (Upcoming / Past / All, "No chef assigned yet" on unassigned visits).
6. Off-day calendar counter and forfeits, plus the chef's notification.
7. Stage summary card refreshes after admin actions.
8. Layout on a small (360 dp) and a large Android screen.

## Remaining limitations

- **C9 counts cards, not people.** Each card is one customer and one service, matching the board. If "customers" must mean distinct people, change the count to `count(distinct customer_id)`.
- **Missed days are recorded per day.** With the *Both* slot, one missed visit marks the whole day missed and adds a full day with two visits.
- **Chef off-days added after scheduling** do not reschedule existing subscription visits automatically; that is Part B (B6) behaviour.
- **C10** is not implemented.
