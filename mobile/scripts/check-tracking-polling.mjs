// Checks the customer live-tracking poll/backoff and freshness rules. Run: node scripts/check-tracking-polling.mjs
// (Node 22.6+ strips the TypeScript types; no test framework needed.)
import assert from 'node:assert/strict';
import { nextPollMs, phaseOf } from '../src/features/tracking/polling.ts';

const live = { visitId: '1', available: true, chefLocation: { lat: 1, lng: 1 }, destination: { lat: 1, lng: 2 }, stale: false,
  staleAfterSec: 30, pollIntervalSec: 5, ageSec: 2, updatedAt: '2026-11-14T13:00:00Z', etaMinutes: 12 };

// Polling cadence
assert.equal(nextPollMs(live, 0), 5000, 'live: every 5 s');
assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map((f) => nextPollMs(live, f)), [5000, 10000, 20000, 40000, 60000, 60000, 60000],
  'failures back off 5→60 s, never faster than 5 s');
assert.equal(nextPollMs({ ...live, available: false, code: 'TRACKING_ENDED' }, 0), false, 'ended: stop polling');
assert.equal(nextPollMs({ ...live, available: false, code: 'TRACKING_NOT_STARTED' }, 0), 10000);
const soon = new Date(Date.now() + 20_000).toISOString(), later = new Date(Date.now() + 3_600_000).toISOString();
assert.ok(Math.abs(nextPollMs({ available: false, code: 'TRACKING_NOT_AVAILABLE_YET', availableAt: soon }, 0) - 20000) < 100);
assert.equal(nextPollMs({ available: false, code: 'TRACKING_NOT_AVAILABLE_YET', availableAt: later }, 0), 60000);

// Freshness / phase
const now = Date.now();
assert.equal(phaseOf(live, false, now, now, false), 'live');
assert.equal(phaseOf({ ...live, ageSec: 29 }, false, now, now, false), 'live', '29 s old: still live');
assert.equal(phaseOf({ ...live, ageSec: 31 }, false, now, now, false), 'stale', '31 s old: stale even if server lagged');
assert.equal(phaseOf({ ...live, stale: true }, false, now, now, false), 'stale');
assert.equal(phaseOf(live, true, now, now, false), 'interrupted', 'request failed: connection interrupted');
assert.equal(phaseOf(live, false, now - 31_000, now, false), 'interrupted', 'no answer for 31 s: not shown as live');
assert.equal(phaseOf({ ...live, chefLocation: undefined }, false, now, now, false), 'waiting');
assert.equal(phaseOf({ ...live, arriving: true }, false, now, now, false), 'arriving');
assert.equal(phaseOf({ ...live, ageSec: 12 }, false, now, now, true), 'updating');
console.log('tracking polling checks: all passed');
