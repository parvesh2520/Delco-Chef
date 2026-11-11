// Catalogue, booking requests, trials and subscriptions. MOCK.
// Business rules mirrored here only so the UI can demonstrate them; the backend is the source of truth.
import type { BookableService, BookingRequirements, BookingSummary, ServiceType, TrialDecision } from '../types';
import { SERVICE_LABELS } from '../constants';
import { db, mock, mockError, newId } from './mock';

const CURRENT_CUSTOMER = 'c1';
const maxFreeTrials = () => Number(db.settings.find((s) => s.key === 'trials')?.fields[0].value ?? 2);

const myRequests = () => db.requests.filter((r) => r.customerId === CURRENT_CUSTOMER);

export interface ServiceEligibility {
  service: BookableService;
  openRequestId?: string;
  trialsUsed: number;
  maxTrials: number;
  canRequest: boolean;
}

export const bookingService = {
  listServices: () => mock(db.services), // GET /services
  getService: (type: ServiceType) => mock(db.services.find((s) => s.type === type) ?? null),

  /** A customer cannot open a second request for a service while one is open. */
  getEligibility: (service: BookableService): Promise<ServiceEligibility> => {
    const open = myRequests().find((r) => r.service === service && r.isOpen);
    const trialsUsed = myRequests().filter((r) => r.service === service).flatMap((r) => r.trials).length;
    return mock({ service, openRequestId: open?.id, trialsUsed, maxTrials: maxFreeTrials(), canRequest: !open });
  },

  createRequest: (service: BookableService, requirements: BookingRequirements) => {
    // POST /requests
    if (myRequests().some((r) => r.service === service && r.isOpen)) {
      return mockError('You already have an open request for this service.');
    }
    const address = db.addresses.find((a) => a.id === requirements.addressId) ?? db.addresses[0];
    const id = newId('r');
    const req = {
      id, customerId: CURRENT_CUSTOMER, customerName: db.customerProfile.fullName, customerPhone: db.customerProfile.phone,
      service, status: 'pending_assignment' as const, isOpen: true, requirements, address, createdAt: new Date().toISOString(),
      trials: [{ id: newId('t'), requestId: id, service, number: 1 as const, status: 'pending_assignment' as const, date: `${requirements.startDate}T00:00:00.000Z`, slot: requirements.slot }],
    };
    db.requests.unshift(req);
    return mock(req, 700);
  },

  listMyRequests: () => mock(myRequests()), // GET /requests?mine
  getRequest: (id: string) => mock(db.requests.find((r) => r.id === id) ?? null), // GET /requests/{id}

  listMyTrials: () => mock(myRequests().flatMap((r) => r.trials)),
  getTrial: (id: string) => {
    const req = db.requests.find((r) => r.trials.some((t) => t.id === id));
    return mock(req ? { trial: req.trials.find((t) => t.id === id)!, request: req } : null);
  },

  /** Trial 1 → subscribe | another_trial. Final trial → subscribe | reject. POST /trials/{id}/decision */
  submitTrialDecision: (trialId: string, decision: TrialDecision) => {
    const req = db.requests.find((r) => r.trials.some((t) => t.id === trialId));
    const trial = req?.trials.find((t) => t.id === trialId);
    if (!req || !trial) return mockError('Trial not found');
    const isLast = trial.number >= maxFreeTrials();
    if (decision === 'another_trial' && isLast) return mockError('No more free trials for this service.');
    if (decision === 'reject' && !isLast) return mockError('Reject is available after the final trial.');
    trial.decision = decision;
    trial.decidedAt = new Date().toISOString();
    let subscriptionId: string | undefined;
    if (decision === 'another_trial') {
      req.status = 'pending_assignment';
      req.trials.push({ id: newId('t'), requestId: req.id, service: req.service, number: 2, status: 'pending_assignment', date: trial.date, slot: trial.slot });
    } else if (decision === 'reject') {
      req.status = 'rejected';
      req.isOpen = false;
    } else {
      // Subscription stays pending_payment until payment succeeds.
      subscriptionId = newId('s');
      req.status = 'awaiting_payment';
      req.subscriptionId = subscriptionId;
      const rq = req.requirements;
      const amount = req.service === 'monthly_subscription' ? 8999 : 449 * (rq.durationDays ?? 7);
      const end = new Date(rq.startDate);
      end.setDate(end.getDate() + (rq.durationDays ?? 28));
      db.subscriptions.unshift({
        id: subscriptionId, requestId: req.id, service: req.service, status: 'pending_payment', chefName: req.assignedChefName,
        startDate: rq.startDate, endDate: end.toISOString().slice(0, 10), slot: rq.slot, meals: rq.meals, members: rq.members, amount, offDays: [],
      });
    }
    return mock({ decision, subscriptionId });
  },

  listMySubscriptions: () => mock(db.subscriptions.filter((s) => myRequests().some((r) => r.id === s.requestId))),
  getSubscription: (id: string) => mock(db.subscriptions.find((s) => s.id === id) ?? null), // GET /subscriptions/{id}
  saveOffDays: (id: string, offDays: string[]) => {
    // PUT /subscriptions/{id}/off-days
    const s = db.subscriptions.find((x) => x.id === id);
    if (s) s.offDays = offDays;
    return mock(s ?? null);
  },

  listBookingHistory: (): Promise<BookingSummary[]> =>
    mock([
      ...db.subscriptions.filter((s) => myRequests().some((r) => r.id === s.requestId)).map((s) => ({
        id: s.id, kind: 'subscription' as const, service: s.service, title: `${SERVICE_LABELS[s.service]} subscription`, status: s.status, date: s.startDate, amount: s.amount,
      })),
      ...myRequests().map((r) => ({
        id: r.id, kind: 'request' as const, service: r.service, title: `${SERVICE_LABELS[r.service]} request`, status: r.status, date: r.createdAt,
      })),
    ]),
};
