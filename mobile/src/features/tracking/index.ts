// Device location for chef travel and check-in (expo-location). The server validates distance, accuracy and timing.
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { visitService, type Position } from '../../services';

export class LocationDeniedError extends Error {
  constructor() {
    super('Location permission is off. Allow location for Delco Chefs in Settings to continue.');
  }
}

const deviceId = `${Constants.deviceName ?? 'device'}-${Constants.sessionId ?? ''}`.slice(0, 120);

export async function ensureLocationPermission(): Promise<void> {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) throw new LocationDeniedError();
}

/** One high-accuracy fix for check-in / check-out. Accuracy is sent so the server can refuse weak GPS. */
export async function currentPosition(): Promise<Position> {
  await ensureLocationPermission();
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? 9999, deviceId };
}

type QueuedPoint = { lat: number; lng: number; accuracy?: number; recordedAt: string };

/**
 * While mounted and `active`, watches GPS and sends points every `intervalSec` (default 5 s).
 * Points that fail to send (offline) stay queued and go out with the next successful batch.
 * Limit: foreground only — when the app is backgrounded the OS pauses JS; sharing resumes on return.
 */
export function useLocationSharing(visitId: string, active: boolean, intervalSec = 5) {
  const queue = useRef<QueuedPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !visitId) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      try {
        await ensureLocationPermission();
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: intervalSec * 1000, distanceInterval: 0 }, (p) => {
          queue.current.push({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? undefined,
                               recordedAt: new Date(p.timestamp).toISOString() });
          if (queue.current.length > 120) queue.current = queue.current.slice(-120);
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    const timer = setInterval(async () => {
      if (!queue.current.length) return;
      const batch = queue.current.splice(0, queue.current.length);
      try {
        await visitService.sendLocations(visitId, batch);
        setLastSentAt(new Date().toISOString());
        setError(null);
      } catch (e) {
        queue.current.unshift(...batch); // keep for the next attempt
        setError((e as Error).message);
      }
    }, intervalSec * 1000);
    return () => {
      cancelled = true;
      sub?.remove();
      clearInterval(timer);
    };
  }, [visitId, active, intervalSec]);

  return { error, lastSentAt };
}
