import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Session } from '../types';

const KEY = 'delco.refreshToken';
const PROFILE_KEY = 'delco.sessionProfile';

/** Who is signed in (role, onboarding / chef status), without any token: lets the app open offline on the right home. */
export type SessionProfile = Omit<Session, 'token' | 'expiresIn'>;

const native = Platform.OS !== 'web';

async function read(key: string): Promise<string | null> {
  if (!native) return null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

/**
 * The refresh token lives only in the OS keystore (SecureStore, Android Keystore-backed). The access token stays in
 * memory. Nothing auth-related goes to AsyncStorage or files.
 */
export const sessionStorage = {
  get: () => read(KEY),
  set: async (token: string) => {
    if (native) await SecureStore.setItemAsync(KEY, token);
  },
  getProfile: async (): Promise<SessionProfile | null> => {
    const raw = await read(PROFILE_KEY);
    try {
      return raw ? (JSON.parse(raw) as SessionProfile) : null;
    } catch {
      return null;
    }
  },
  setProfile: async ({ token: _t, expiresIn: _e, ...profile }: Session) => {
    if (native) await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile)).catch(() => {});
  },
  clear: async () => {
    if (!native) return;
    await Promise.all([SecureStore.deleteItemAsync(KEY).catch(() => {}), SecureStore.deleteItemAsync(PROFILE_KEY).catch(() => {})]);
  },
};
