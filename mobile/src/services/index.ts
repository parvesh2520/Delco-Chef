import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

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
