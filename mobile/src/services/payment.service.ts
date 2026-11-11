// Payment links (Razorpay test mode, or the backend's dev sandbox when keys are absent).
// The app never sends an amount and never marks anything paid: status changes only after the server verifies the gateway.
import type { Payment } from '../types';
import { api } from './api';

export const paymentService = {
  listMine: () => api.get<Payment[]>('/payments'),
  listAll: () => api.get<Payment[]>('/payments'),
  get: (id: string) => api.get<Payment>(`/payments/${id}`),
  getForSubscription: (subscriptionId: string) => api.get<Payment | null>(`/payments/by-subscription/${subscriptionId}`),
  getReceipt: (id: string) => api.get<Payment & { receiptNo: string; startDate: string; endDate: string; visits: number }>(`/payments/${id}/receipt`),

  /** Links are created automatically on Subscribe; this returns the order's current link. */
  createLink: (subscriptionId: string) =>
    api.get<Payment | null>(`/payments/by-subscription/${subscriptionId}`).then((p) => {
      if (!p) throw new Error('No payment order exists for this subscription.');
      return p;
    }),

  /** Re-reads the order after the customer returns from checkout (the webhook may already have confirmed it). */
  markAttempted: (id: string) => api.get<Payment>(`/payments/${id}`),

  resendLink: (id: string) => api.post<Payment>(`/payments/${id}/resend`),
  regenerateLink: (id: string) => api.post<Payment>(`/payments/${id}/regenerate`),
};
