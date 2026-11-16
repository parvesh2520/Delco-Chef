import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { APP_CONFIG } from '../constants';
import { useAuthStore } from '../store';
import { sessionStorage } from './session';

/** Error raised for every failed API call. `message` is the backend's human-readable message. */
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public fields?: Record<string, string>,
    public extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export const apiClient = axios.create({
  baseURL: APP_CONFIG.apiBaseUrl,
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

const NETWORK_MESSAGE = 'Can’t reach Delco right now. Check your connection and try again.';
/** Renew the access token this long before it expires, so requests rarely meet a 401. */
const RENEW_BEFORE_MS = 60_000;
/** OTP and refresh calls never carry or renew a session. */
const isAuthFlow = (url?: string) => !!url && (url.startsWith('/auth/otp/') || url.startsWith('/auth/refresh'));

let accessExpiresAt = 0;
// Track the access token's lifetime and keep the token-free profile in SecureStore for offline app starts.
useAuthStore.subscribe((s, prev) => {
  if (!s.session || s.session === prev.session) return;
  if (s.session.token !== prev.session?.token) {
    accessExpiresAt = s.session.token ? Date.now() + (s.session.expiresIn ?? 0) * 1000 : 0;
  }
  void sessionStorage.setProfile(s.session);
});

apiClient.interceptors.request.use(async (config) => {
  if (useAuthStore.getState().session && !isAuthFlow(config.url) && Date.now() > accessExpiresAt - RENEW_BEFORE_MS) {
    // Silent renewal. Offline: send the request anyway; the response handler reports the network error.
    await refreshSession().catch(() => undefined);
  }
  const token = useAuthStore.getState().session?.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** The server definitively ended the session (expired, revoked, account disabled): forget it and show "session expired". */
async function endSession() {
  await sessionStorage.clear();
  useAuthStore.getState().expireSession();
}

// One refresh at a time: concurrent callers share the same rotation instead of racing each other.
let refreshing: Promise<string | null> | null = null;

/**
 * Exchanges the stored refresh token for a new access token (and rotated refresh token).
 * Resolves the new access token; resolves null when the session is over (credentials cleared);
 * rejects on a transient failure (offline, timeout, 5xx, 429) — credentials are kept for the next try.
 */
export async function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await sessionStorage.get();
      if (!refreshToken) {
        if (useAuthStore.getState().session) await endSession();
        return null;
      }
      try {
        const { data } = await axios.post(`${APP_CONFIG.apiBaseUrl}/auth/refresh`, { refreshToken }, { timeout: 15000 });
        await sessionStorage.set(data.refreshToken);
        useAuthStore.getState().signIn(data);
        return data.token as string;
      } catch (e) {
        const status = (e as AxiosError).response?.status;
        if (status === 401 || status === 403) {
          await endSession();
          return null;
        }
        throw e;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<{ error?: { code: string; message: string; fields?: Record<string, string> } & Record<string, unknown> }>) => {
    const cfg = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const body = error.response?.data?.error;
    if (status === 401 && cfg && !cfg._retried && !isAuthFlow(cfg.url) && useAuthStore.getState().session) {
      cfg._retried = true; // retry once, never loop
      let token: string | null;
      try {
        // Another request may already have renewed the token while this one was in flight.
        const current = useAuthStore.getState().session?.token;
        const sent = (cfg.headers as Record<string, unknown> | undefined)?.Authorization;
        token = current && sent !== `Bearer ${current}` ? current : await refreshSession();
      } catch {
        return Promise.reject(new ApiError(NETWORK_MESSAGE, 'NETWORK', 0));
      }
      if (token) return apiClient.request(cfg); // the request interceptor attaches the new token
    }
    if (!error.response) {
      return Promise.reject(new ApiError(NETWORK_MESSAGE, 'NETWORK', 0));
    }
    const { code = 'ERROR', message = 'Something went wrong. Please try again.', fields, ...extra } = body ?? {};
    return Promise.reject(new ApiError(message, code, status ?? 0, fields, extra));
  }
);

/** Thin typed helpers. Every business value shown in the app comes through these. */
export const api = {
  get: <T>(url: string, params?: object) => apiClient.get<T>(url, { params }).then((r) => r.data),
  post: <T>(url: string, body?: unknown) => apiClient.post<T>(url, body ?? {}).then((r) => r.data),
  put: <T>(url: string, body?: unknown) => apiClient.put<T>(url, body ?? {}).then((r) => r.data),
  patch: <T>(url: string, body?: unknown) => apiClient.patch<T>(url, body ?? {}).then((r) => r.data),
  del: <T>(url: string, body?: unknown) => apiClient.delete<T>(url, { data: body }).then((r) => r.data),
  upload: <T>(url: string, form: FormData) =>
    apiClient.post<T>(url, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }).then((r) => r.data),
};

/** Absolute URL for links the backend returns as paths (photos, exports). */
export const absoluteUrl = (path: string) => (path.startsWith('http') ? path : `${APP_CONFIG.apiBaseUrl.replace(/\/api\/v1$/, '')}${path}`);
