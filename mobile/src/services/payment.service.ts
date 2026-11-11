// Payment links. MOCK — no payment gateway is called and no money moves.
// Target endpoints: POST /subscriptions/{id}/payment-link, GET /payments/{id}, POST /payments/{id}/resend|regenerate
import type { Payment } from '../types';
import { db, mock, mockError, newId } from './mock';

const linkValidityHours = () => Number(db.settings.find((s) => s.key === 'payment_link')?.fields[0].value ?? 24);

export const paymentService = {
  listMine: () => mock(db.payments.filter((p) => p.customerId === 'c1')),
  listAll: () => mock(db.payments),
  get: (id: string) => mock(db.payments.find((p) => p.id === id) ?? null),
  getForSubscription: (subscriptionId: string) => mock(db.payments.find((p) => p.subscriptionId === subscriptionId) ?? null),

  createLink: (subscriptionId: string) => {
    const sub = db.subscriptions.find((s) => s.id === subscriptionId);
    if (!sub) return mockError('Subscription not found');
    const existing = db.payments.find((p) => p.subscriptionId === subscriptionId && p.status !== 'expired');
    if (existing) return mock(existing);
    const p: Payment = {
      id: newId('p'), subscriptionId, customerId: 'c1', customerName: db.customerProfile.fullName, service: sub.service,
      amount: sub.amount, status: 'link_created', linkUrl: `https://pay.example.com/l/${subscriptionId}`,
      linkExpiresAt: new Date(Date.now() + linkValidityHours() * 3600e3).toISOString(), createdAt: new Date().toISOString(), attempts: 0,
    };
    db.payments.unshift(p);
    sub.paymentId = p.id;
    return mock(p);
  },

  /** Customer reports a new attempt; status returns to pending until the gateway confirms. */
  markAttempted: (id: string) => {
    const p = db.payments.find((x) => x.id === id);
    if (p && p.status !== 'paid') p.status = 'pending';
    return mock(p ?? null, 150);
  },

  /** MOCK ONLY: simulates the gateway callback so the success/failure screens can be demonstrated. */
  simulateResult: (id: string, success: boolean) => {
    const p = db.payments.find((x) => x.id === id);
    if (!p) return mockError('Payment not found');
    p.attempts += 1;
    p.status = success ? 'paid' : 'failed';
    if (success) {
      Object.assign(p, { paidAt: new Date().toISOString(), method: 'UPI', reference: `MOCK-${p.id.toUpperCase()}` });
      const sub = db.subscriptions.find((s) => s.id === p.subscriptionId);
      if (sub) sub.status = 'active'; // Subscription activates only after payment success.
      const req = db.requests.find((r) => r.subscriptionId === p.subscriptionId);
      if (req) Object.assign(req, { status: 'converted', isOpen: false });
    }
    return mock(p, 900);
  },

  resendLink: (id: string) => mock(db.payments.find((p) => p.id === id) ?? null),
  regenerateLink: (id: string) => {
    const p = db.payments.find((x) => x.id === id);
    if (!p) return mockError('Payment not found');
    Object.assign(p, { status: 'link_created', linkExpiresAt: new Date(Date.now() + linkValidityHours() * 3600e3).toISOString() });
    return mock(p);
  },
};
