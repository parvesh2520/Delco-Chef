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

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().session?.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// One refresh at a time: concurrent 401s wait for the same rotation instead of racing (and revoking) each other.
let refreshing: Promise<string | null> | null = null;

export async function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await sessionStorage.get();
      if (!refreshToken) return null;
      try {
        const { data } = await axios.post(`${APP_CONFIG.apiBaseUrl}/auth/refresh`, { refreshToken }, { timeout: 15000 });
        await sessionStorage.set(data.refreshToken);
        useAuthStore.getState().signIn(data);
        return data.token as string;
      } catch (e) {
        // Only a definite rejection signs the user out; a network error keeps the stored token for the next try.
        if ((e as AxiosError).response) {
          await sessionStorage.clear();
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
    if (status === 401 && cfg && !cfg._retried && !cfg.url?.startsWith('/auth/')) {
      cfg._retried = true;
      const token = await refreshSession().catch(() => null);
      if (token) {
        cfg.headers = { ...cfg.headers, Authorization: `Bearer ${token}` };
        return apiClient.request(cfg);
      }
      useAuthStore.getState().expireSession();
    }
    if (!error.response) {
      return Promise.reject(new ApiError('Can’t reach Delco right now. Check your connection and try again.', 'NETWORK', 0));
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
