import type { Session } from '../types';
import { useAuthStore } from '../store';
import { api, refreshSession } from './api';
import { sessionStorage } from './session';

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

  /** Restores the session after an app restart from the refresh token in SecureStore. */
  restore: async (): Promise<boolean> => {
    try {
      return !!(await refreshSession());
    } catch {
      return false; // offline: stay signed out of the UI but keep the stored token for next launch
    }
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
