import type { Session } from '../types';
import { useAuthStore } from '../store';
import { api, refreshSession } from './api';
import { sessionStorage } from './session';

/** How long the splash waits for the backend before opening the app from the saved profile. */
const RESTORE_WAIT_MS = 8000;

export type LoginPortal = 'customer' | 'chef' | 'admin';

export const authService = {
  /** POST /auth/otp/request — the code is delivered by the backend's OTP provider (dev: written to the server log). */
  requestOtp: (phone: string, portal: LoginPortal) =>
    api.post<{ sentTo: string; expiresInSec: number; resendAfterSec: number }>('/auth/otp/request', { phone, portal }),

  verifyOtp: async (phone: string, code: string, portal: LoginPortal): Promise<Session> => {
    const s = await api.post<Session & { refreshToken: string }>('/auth/otp/verify', { phone, code, portal, device: 'mobile' });
    await sessionStorage.set(s.refreshToken);
    return s;
  },

  /**
   * Restores the session at app start (splash still showing). Online: silently refreshes and signs in. Offline or a
   * slow/cold backend: signs in from the saved profile right away; the refresh keeps running (or is retried by the next
   * request) and only a definite server rejection ends the session.
   */
  restore: async (): Promise<void> => {
    if (!(await sessionStorage.get())) return;
    const outcome = await Promise.race([
      refreshSession().then((t) => (t ? 'restored' : 'ended'), () => 'offline'),
      new Promise<'offline'>((r) => setTimeout(() => r('offline'), RESTORE_WAIT_MS)),
    ]);
    if (outcome !== 'offline' || useAuthStore.getState().session) return;
    const profile = await sessionStorage.getProfile();
    if (profile) useAuthStore.getState().signIn({ ...profile, token: '' });
  },

  /** Re-reads onboarding / chef status from the server after they change. */
  reloadSession: async () => {
    const me = await api.get<Session>('/auth/me');
    const cur = useAuthStore.getState().session;
    if (cur) useAuthStore.getState().signIn({ ...me, token: cur.token });
    return me;
  },

  logout: async () => {
    const refreshToken = await sessionStorage.get();
    try {
      await api.post('/auth/logout', { refreshToken });
    } finally {
      await sessionStorage.clear();
    }
  },
};
