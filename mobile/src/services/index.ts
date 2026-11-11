import { QueryClient } from '@tanstack/react-query';

export * from './api';
export * from './auth.service';
export * from './customer.service';
export * from './booking.service';
export * from './payment.service';
export * from './visit.service';
export * from './chef.service';
export * from './admin.service';
export * from './notification.service';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 30,
    },
  },
});
