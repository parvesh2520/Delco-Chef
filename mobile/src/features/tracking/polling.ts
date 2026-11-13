// Pure polling / freshness rules for the customer live-tracking screen (no React Native imports, so they can be
// checked with plain Node: see docs/PART_E_IMPLEMENTATION_REPORT.md).
import type { TrackingSnapshot } from '../../types';

export type Phase = 'live' | 'updating' | 'interrupted' | 'stale' | 'waiting' | 'arriving';

/**
 * E4 polling: every pollIntervalSec (5 s) while live; after a failed request the next try backs off 5→10→20→40→60 s
 * (never a tight retry loop); before the window opens it waits until the window (checked at most every 60 s); polling
 * stops when tracking has ended and pauses while the app is in the background (react-query focus manager).
 */
export function nextPollMs(data: TrackingSnapshot | null | undefined, failures: number): number | false {
  if (failures > 0) return Math.min(60_000, 5_000 * 2 ** (failures - 1));
  if (!data) return 5_000;
  if (data.code === 'TRACKING_ENDED') return false;
  if (data.code === 'TRACKING_NOT_AVAILABLE_YET') {
    const until = data.availableAt ? Date.parse(data.availableAt) - Date.now() : 60_000;
    return Math.max(5_000, Math.min(60_000, until));
  }
  if (data.code === 'TRACKING_NOT_STARTED') return 10_000;
  return (data.pollIntervalSec ?? 5) * 1000;
}

/** Phase from the server answer plus how long ago we last heard from the server (a dead network is not "live"). */
export function phaseOf(t: TrackingSnapshot, failed: boolean, fetchedAt: number, now: number, fetching: boolean): Phase {
  const staleMs = (t.staleAfterSec ?? 30) * 1000;
  const ageMs = (t.ageSec ?? 0) * 1000 + (now - fetchedAt);
  if (!t.chefLocation) return failed ? 'interrupted' : 'waiting';
  if (failed || now - fetchedAt > staleMs) return 'interrupted';
  if (t.stale || ageMs > staleMs) return 'stale';
  if (t.arriving) return 'arriving';
  return fetching && ageMs > (t.pollIntervalSec ?? 5) * 2000 ? 'updating' : 'live';
}

