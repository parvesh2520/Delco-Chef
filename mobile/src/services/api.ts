import axios from 'axios';
import { APP_CONFIG } from '../constants';
import { useAuthStore } from '../store';

/** Real HTTP client for the FastAPI backend. Services switch from mocks to this as endpoints land. */
export const apiClient = axios.create({
  baseURL: APP_CONFIG.apiBaseUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().session?.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 → session expired screen (route guard reacts to `sessionExpired`).
    if (error?.response?.status === 401) useAuthStore.getState().expireSession();
    return Promise.reject(error);
  }
);
