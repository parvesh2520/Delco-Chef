import { AppState } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { APP_CONFIG } from '../constants';
import { ApiError } from './api';

if (!APP_CONFIG.apiBaseUrl) console.error('EXPO_PUBLIC_API_URL is not set for this build; the app cannot reach the API.');

// React Native has no window focus: treat "app came back to the foreground" as focus, so screens refetch on resume
// (e.g. the payment status after the customer returns from the Razorpay page).
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
  return () => sub.remove();
});

export * from './api';
export * from './auth.service';
export * from './customer.service';
export * from './booking.service';
export * from './payment.service';
export * from './visit.service';
export * from './chef.service';
export * from './admin.service';
export * from './notification.service';
export * from './session';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry transient network/server failures only; a 4xx is a real answer from the server.
      retry: (count, e) => count < 2 && !(e instanceof ApiError && e.status >= 400 && e.status < 500),
      staleTime: 1000 * 30,
    },
  },
});
