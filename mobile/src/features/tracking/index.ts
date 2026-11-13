// Device location for chef travel and check-in (expo-location). The server validates distance, accuracy and timing.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import { ApiError } from '../../services/api';
import { visitService, type Position } from '../../services';

export class LocationDeniedError extends Error {
  /** true when the OS will not show the prompt again: the chef must enable location in Settings. */
  permanent: boolean;
  constructor(permanent = false) {
    super(permanent
      ? 'Location is turned off for Delco Chefs. Open Settings → Permissions → Location and choose “Allow while using the app”.'
      : 'Location permission is off. Allow location for Delco Chefs to continue.');
    this.permanent = permanent;
  }
}

const deviceId = `${Constants.deviceName ?? 'device'}-${Constants.sessionId ?? ''}`.slice(0, 120);

/** Foreground ("while using the app") permission only. Travel sharing never asks for "Allow all the time". */
export async function ensureLocationPermission(): Promise<void> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return;
  if (!cur.canAskAgain) throw new LocationDeniedError(true);
  const res = await Location.requestForegroundPermissionsAsync();
  if (!res.granted) throw new LocationDeniedError(!res.canAskAgain);
}

const toPosition = (c: Location.LocationObjectCoords): Position => ({
  lat: c.latitude,
  lng: c.longitude,
  // Never invent accuracy: if the OS didn't report one, the server asks for a fresh fix instead of trusting a guess.
  accuracy: c.accuracy ?? undefined,
  deviceId,
});

/**
 * One location fix. `precise` (check-in) asks for GPS-level accuracy and accepts a cached fix only if it is under a
 * minute old and within 100 m accuracy, so a stale position from elsewhere is never sent. Without `precise` (address
 * picking, audit-only positions) a quick balanced fix is fine. The server decides whether the fix is good enough.
 */
export async function currentPosition({ precise = false }: { precise?: boolean } = {}): Promise<Position> {
  await ensureLocationPermission();
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: precise ? Location.Accuracy.High : Location.Accuracy.Balanced });
    return toPosition(p.coords);
  } catch {
    const last = await Location.getLastKnownPositionAsync(precise ? { maxAge: 60_000, requiredAccuracy: 100 } : {});
    if (last) return toPosition(last.coords);
    if (precise) throw new Error('Couldn’t get a GPS fix. Move near a window or outside and try again.');
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
    return toPosition(p.coords);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Travel sharing (Part E1)
//
// One module-level sender shared by the background task and the screen, so there is exactly one queue and one request
// in flight. Each new GPS fix (every 5 s) triggers a send of everything queued. Offline: points stay queued (newest 120 =
// 10 minutes) and go out together when the network returns; retries back off 5 s → 60 s so a dead network is not
// hammered. The server drops duplicates, so a retried batch never creates duplicate rows.
//
// Background: on Android a foreground service (persistent "Sharing your location" notification) keeps fixes coming while
// the app is in the background or the screen is off. It needs only "while using the app" permission because the chef
// starts it from the app. Limits: if the chef swipes the app away the service stops (killServiceOnDestroy); some
// manufacturers' battery savers may still throttle it. Where a foreground service is unavailable (Expo Go, iOS without
// background mode) sharing falls back to foreground-only and the screen says so.
// ---------------------------------------------------------------------------------------------------------------------

export const TRAVEL_TASK = 'delco-chef-travel-location';
const INTERVAL_MS = 5_000;
const MAX_QUEUE = 120;
const MAX_BACKOFF_MS = 60_000;

type QueuedPoint = { lat: number; lng: number; accuracy?: number; recordedAt: string };
export type SharingMode = 'off' | 'background' | 'foreground';
export interface SharingState {
  visitId: string | null;
  mode: SharingMode;
  queued: number;
  lastSentAt: string | null;
  error: string | null;
  /** Set when the server says this visit no longer accepts locations (checked in, reassigned, cancelled). */
  ended: string | null;
}

let state: SharingState = { visitId: null, mode: 'off', queued: 0, lastSentAt: null, error: null, ended: null };
let queue: QueuedPoint[] = [];
let sending = false;
let backoffMs = 0;
let nextTryAt = 0;
let watchSub: Location.LocationSubscription | null = null;
const listeners = new Set<(s: SharingState) => void>();

function set(patch: Partial<SharingState>) {
  state = { ...state, ...patch, queued: queue.length };
  listeners.forEach((l) => l(state));
}

function enqueue(locs: Location.LocationObject[]) {
  if (!state.visitId) return;
  for (const l of locs) {
    const { latitude: lat, longitude: lng, accuracy } = l.coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const recordedAt = new Date(l.timestamp).toISOString();
    if (queue.length && queue[queue.length - 1].recordedAt >= recordedAt) continue; // duplicate or out-of-order fix
    queue.push({ lat, lng, accuracy: accuracy ?? undefined, recordedAt });
  }
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  set({});
  void flush();
}

async function flush(force = false) {
  const visitId = state.visitId;
  if (!visitId || sending || !queue.length || (!force && Date.now() < nextTryAt)) return;
  sending = true;
  const batch = queue.slice();
  try {
    await visitService.sendLocations(visitId, batch);
    // Accepted and rejected (invalid/duplicate) points are both settled: never resend them.
    queue = queue.filter((p) => p.recordedAt > batch[batch.length - 1].recordedAt);
    backoffMs = 0;
    nextTryAt = 0;
    set({ lastSentAt: new Date().toISOString(), error: null });
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'TRACKING_NOT_ACTIVE' || e.status === 404 || e.status === 403)) {
      await stopSharing(e.message || 'Location sharing ended for this visit.');
    } else {
      backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs ? backoffMs * 2 : INTERVAL_MS);
      nextTryAt = Date.now() + backoffMs;
      set({ error: `Connection problem — ${queue.length} location update(s) will be sent when you’re back online.` });
    }
  } finally {
    sending = false;
  }
}

if (!TaskManager.isTaskDefined(TRAVEL_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRAVEL_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    enqueue(data.locations);
  });
}

AppState.addEventListener('change', (s) => {
  if (s === 'active' && state.visitId) void flush(true); // send the backlog as soon as the chef returns to the app
});

/** Starts 5-second sharing for a travelling visit. Idempotent; switching visits stops the previous one. */
export async function startSharing(visitId: string): Promise<void> {
  if (state.visitId === visitId && state.mode !== 'off') return;
  if (state.visitId && state.visitId !== visitId) await stopSharing(null);
  await ensureLocationPermission();
  queue = [];
  backoffMs = 0;
  nextTryAt = 0;
  set({ visitId, ended: null, error: null, lastSentAt: null });
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRAVEL_TASK)) await Location.stopLocationUpdatesAsync(TRAVEL_TASK);
    await Location.startLocationUpdatesAsync(TRAVEL_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: INTERVAL_MS,
      distanceInterval: 0, // the 5-second heartbeat is required even when stopped at a signal
      foregroundService: {
        notificationTitle: 'Sharing your location',
        notificationBody: 'Your customer can see you approach until you check in.',
        notificationColor: '#7A2E4A',
        killServiceOnDestroy: true,
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
    set({ mode: 'background' });
  } catch {
    // No foreground service here (Expo Go / unsupported): share while the app is open, and say so on screen.
    watchSub?.remove();
    watchSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: INTERVAL_MS, distanceInterval: 0 },
      (l) => enqueue([l]),
    );
    set({ mode: 'foreground' });
  }
}

/** Stops all location work. `endedReason` is shown to the chef when the server ended sharing. */
export async function stopSharing(endedReason: string | null = null): Promise<void> {
  watchSub?.remove();
  watchSub = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRAVEL_TASK)) await Location.stopLocationUpdatesAsync(TRAVEL_TASK);
  } catch {
    // already stopped
  }
  queue = [];
  set({ visitId: null, mode: 'off', ended: endedReason, error: null });
}

/**
 * Shares location while `active` (the visit is chef_travelling). Leaving the screen does not stop sharing — the
 * chef may open Maps or lock the phone; it stops when travel stops, the visit becomes inactive, or the server refuses.
 */
export function useLocationSharing(visitId: string, active: boolean) {
  const [s, setS] = useState(state);
  const [startError, setStartError] = useState<LocationDeniedError | Error | null>(null);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  useEffect(() => {
    if (!visitId) return;
    if (active) {
      startSharing(visitId).then(() => setStartError(null), (e) => setStartError(e as Error));
    } else if (state.visitId === visitId) {
      void stopSharing(null);
    }
  }, [visitId, active]);
  return { ...s, sharingThisVisit: s.visitId === visitId, startError, retry: () => startSharing(visitId).then(() => setStartError(null), (e) => setStartError(e as Error)) };
}
