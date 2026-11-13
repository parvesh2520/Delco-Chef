# Part G: Weekly Chef Earnings — Implementation Report

**Date:** 13 Nov 2026
**Source of truth:** *Delco Chefs Developer Assignment.pdf*, section 11 (Part G, marked optional).

## 1. Part G requirements (from the PDF)

**Rules**
- Cycle: Monday 00:00 to Sunday 23:59:59 IST. A booking belongs to the cycle in which its scheduled start falls, in IST. Timestamps stored in UTC, cycles calculated in IST.
- Chef share: 80% of the booking amount (a setting).
- Short attendance: under 90% of the scheduled duration, the share is multiplied by worked ÷ scheduled minutes, rounded down to the paisa per booking.
- Not payable: cancelled bookings, trials, and bookings whose attendance is NEEDS_REVIEW. Review items are held back and carried forward to the next cycle once resolved.
- Adjustments: an Admin can add a positive or negative adjustment to a chef's cycle with a reason.
- Running: a scheduled job generates the cycle every Monday at 06:00 IST, exactly one payout per chef per cycle even if it runs twice or on two instances at once.
- Approval: a Super Admin reviews, approves, then marks each payout paid with a bank reference. Once approved, the numbers can no longer change.

| ID | Priority | Requirement |
|---|---|---|
| G1 | Should | Payout calculation as per the rules, in integer paise. |
| G2 | Should | Scheduled run that is safe to repeat and safe on several instances. |
| G3 | Should | Admin screen: cycle list, chef-wise totals, held-back items, adjustment, approve, mark paid. Audit trail of who approved and when. |
| G4 | Stretch | Chef screen: current week earnings and a downloadable statement (CSV or PDF) listing every booking, its status and the amount. |

Test data (Asha, cycle 5–11 Oct 2026): P1 Rs 800, P2 Rs 480 (short), P3 cancelled Rs 0, P4 needs review (Rs 800 held, carried), P5 in the next cycle; adjustment −Rs 50 → **Rs 1,230.00**; running twice gives one record; after P4 is resolved at 60 min the next cycle is 800 + 640 = **Rs 1,440.00**.

## 2. Audit of the existing implementation

| ID | Existing implementation | Frontend | Backend | Tables | Tests before | Missing | Status before |
|---|---|---|---|---|---|---|---|
| G1 | `domain/payouts.py` (`cycle_start`, `chef_share`), `services/payouts.run_cycle`: IST cycle bounds, share % from settings, short-attendance pro-rata with floor division, cancelled/missed/trial → 0, needs-review held, carry-forward of resolved unpaid visits, adjustments summed into the total, all integer paise. | — | `app/domain/payouts.py`, `app/services/payouts.py` | `payouts`, `payout_items`, `visits`, `attendance_records`, `system_settings` | `test_domain.test_payout_rules_part_g`, `test_privacy_tracking.test_weekly_payout_cycle_part_g` (the full PDF example) | Attendance in `exception` status (unusual duration, customer unavailable, code locked: also awaiting Admin review under Part D) was **paid immediately** instead of being held. | Mostly done; one rule bug |
| G2 | Unique index `(chef_id, cycle_start)`; `INSERT … ON CONFLICT DO NOTHING` then `SELECT … FOR UPDATE`; items rebuilt under the lock only while `pending`; `payout_items.visit_id` unique so a visit is paid once. Hourly worker calls `run_due`, which runs the previous cycle once it is past Monday 06:00 IST. | — | `services/payouts.py`, `services/worker.py` | as above | run-twice covered | No test for simultaneous runs | Implemented, partly tested |
| G3 | Super-Admin API: list, detail with items, run, adjust (reason required, refused once approved), approve/reject, mark paid with bank reference (only after approval). `approved_by`/`approved_at` stored; adjustments, approval and paid are audit-logged. | `app/admin/super/payouts/index.tsx`, `[id].tsx` | `api/v1/endpoints/admin.py` | as above | service-level only | API had no held-back item list and no approver name. **Screen showed only approve/reject**: no items, no held items, no adjustment, no mark-paid, no who/when. | Backend mostly done, screen incomplete |
| G4 | `GET /chefs/me/earnings`: current cycle, completed visits only. | `app/chef/(approved)/earnings.tsx` | `services/payouts.chef_earnings` | as above | none | Only completed visits listed (not every booking); statuses "pending"/"held" only; **no downloadable statement**. | Partial |

Cancelled and refunded bookings: a cancelled subscription cancels its future visits, and cancelled or missed visits pay 0. Refunds touch the customer's payment, not the chef's share for visits actually worked; the PDF sets no other refund rule for Part G.

## 3. Changes made

| Change | Requirement |
|---|---|
| `_payable` treats attendance in `needs_review` **or** `exception` as held back, unless the visit is cancelled, missed or a trial (those are simply not payable and are not counted as held). When an Admin resolves the record, the existing carry-forward pays it in the next cycle run, at the resolved worked minutes. | G1 |
| `held_items()` and `approvedBy` / `paidAt` in the payout detail response. | G3 |
| Admin payout screen rebuilt on the existing service methods: amount, cycle, paid visits, held amount, approver and time, paid time and reference, item list (visits and adjustments), held-back list, adjustment form (rupees → integer paise, reason required), approve/reject, mark-paid form (only once approved). | G3 |
| `statement()`: one function listing every booking of the chef in a cycle with its pay status (`earned`, payout status `pending/approved/paid/rejected`, `held`, `not_payable`, `upcoming`) and amount, using the same `chef_share` rule as `run_cycle` (no second calculation). `chef_earnings` now uses it and adds `heldAmount`, `cycleStart`, `statementUrl`. | G4 |
| CSV statement: `GET /v1/chefs/statements/{chef_id}?cycleStart&expires&sig`, a signed 10-minute link (same pattern as the customer data export) so the phone's browser can download it without a bearer token. The signature covers chef, cycle and expiry, so a link cannot be re-pointed at another chef or week. `Cache-Control: no-store`. | G4 |
| Chef earnings screen: held amount, "Download statement (CSV)" (refreshes the link first), every booking with status. | G4 |

No new tables, dependencies or migrations.

## 4. Earnings calculation

```
share   = price_paise × chef_share_pct // 100                       (80 by default; setting)
if worked × 100 < scheduled × 90:  share = share × worked // scheduled  (floor to the paisa)
cancelled / missed / trial / nothing worked  → 0 (not payable)
attendance needs_review or exception (unresolved) → held (share shown, not paid)
payout.amount_paise = Σ visit items + Σ adjustments
```
Cycle bounds are Monday 00:00 IST → next Monday 00:00 IST converted to UTC; a visit is in the cycle of its `starts_at`. Carry-forward: earlier visits whose attendance is now `resolved` and that have no payout item are added to the cycle being run.

## 5. API endpoints

| Endpoint | Role |
|---|---|
| `GET /v1/admin/payouts` | Super Admin: cycle list with chef-wise totals |
| `GET /v1/admin/payouts/{id}` | Super Admin: items, held items, approver |
| `POST /v1/admin/payouts/run?cycleStart=YYYY-MM-DD` | Super Admin: run a cycle by hand (Monday only; idempotent) |
| `POST /v1/admin/payouts/{id}/adjustments` | Super Admin: `{amountPaise, reason}` |
| `POST /v1/admin/payouts/{id}/decision` | Super Admin: `{approve}` or `{approve: true, bankReference}` |
| `GET /v1/chefs/me/earnings` | Approved chef: own current week only |
| `GET /v1/chefs/statements/{chefId}` | Signed link from the above |

Ops Admin, chef and customer tokens get 403 on every payout admin route.

## 6. Database relationships

`payouts (chef_id → chefs, cycle_start, amount_paise, held_paise, status, approved_by → users, approved_at, bank_reference, paid_at)` — unique `(chef_id, cycle_start)`.
`payout_items (payout_id → payouts, visit_id → visits UNIQUE, amount_paise, kind visit|adjustment, note, created_by)`.
Inputs: `visits (chef_id, starts_at, ends_at, status, kind, price_paise)` and `attendance_records (visit_id, worked_minutes, check_out_at, status)`.

## 7. Tests and results

New `backend/tests/test_part_g.py`:

| Test | Covers |
|---|---|
| `test_unreviewed_exception_is_held_then_carried_forward` | exception held; resolved → paid in the next cycle at pro-rata; re-running the earlier cycle does not pay it twice |
| `test_cancelled_trial_and_missed_are_never_paid_or_held` | cancelled, missed (with exception record) and trial |
| `test_two_instances_running_at_once_make_one_payout` | 4 threads, separate DB sessions, same cycle → one payout, two items, correct total |
| `test_admin_payout_flow_and_permissions` | Ops/chef 403; Monday check; PDF numbers via API (1,280 → −50 → 1,230); held item P4 at Rs 800; blank reason refused; paid-before-approve refused; approver name and time; locked after approval; re-run keeps approved numbers; mark paid; audit trail order, actor and reason |
| `test_chef_earnings_statement_and_isolation` | current week lists P1–P4 not P5; statuses and amounts; CSV download; tampered, re-pointed and expired links refused; another chef sees nothing; statuses switch to payout status after approval |

Existing: `test_domain.test_payout_rules_part_g`, `test_privacy_tracking.test_weekly_payout_cycle_part_g` (PDF example including 1,230 and 1,440) — both still pass.

| Check | Result |
|---|---|
| Full backend suite | **190 passed**, 0 failed |
| Ruff, CI rules | All checks passed |
| Ruff on new test file | Clean apart from the repo-wide `B008` pattern |
| `npx tsc --noEmit` | Passed |
| `alembic check` (disposable test DB) | No new upgrade operations |

## 8. Remaining limitations

- **Not verified on a device:** the admin payout screen and the chef statement download have passed type checking only.
- The weekly job relies on the hourly worker check (`run_due`) rather than a cron at exactly 06:00 IST; it runs at the first hourly tick after 06:00 and keeps recomputing that cycle hourly while it is still pending.
- If two **different** cycles are run at the same moment and both try to carry the same resolved visit, the unique `visit_id` makes one transaction fail; that run is retried on the next hourly tick. No double payment is possible.
- A **rejected** payout keeps its items, so those visits are not offered again automatically. The PDF does not define rejection; a Super Admin can re-handle it manually.
- Adjustments and the payout screens are Super Admin only (the role table puts payouts with Super Admin); Ops Admins cannot add adjustments.
- The admin cycle list is a flat list sorted by cycle (newest first) with chef-wise totals, not grouped headers.
- The statement covers the current week; past weeks are available to admins via payout details, not as chef downloads.
