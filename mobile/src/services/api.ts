import axios from 'axios';
import { APP_CONFIG } from '../constants';

export const apiClient = axios.create({
  baseURL: APP_CONFIG.apiBaseUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Standard error handling stub for future API integration
    return Promise.reject(error);
  }
);
