// Catalogue, requests, trials and subscriptions. Every rule (trial limits, open requests, prices) is enforced by the API.
import type {
  BookableService, BookingRequirements, BookingSummary, CancelPreview, ServiceOffering, ServiceRequest, ServiceType, Subscription,
  Trial, TrialDecision,
} from '../types';
import { api } from './api';

export interface ServiceEligibility {
  service: BookableService;
  openRequestId?: string;
  trialsUsed: number;
  maxTrials: number;
  completedTrials: number;
  trialStatus: 'not_started' | 'trial_in_progress' | 'trial_completed' | 'trials_used';
  canRequest: boolean;
  canRequestTrial: boolean;
  canSubscribe: boolean;
  reason?: string;
}

export interface AppConfig {
  slots: { value: string; label: string }[];
  maxFreeTrials: number;
  trialMaxPeople: number;
  ratePerPersonPerVisit: number;
  trackingPollSec: number;
  staleAfterSec: number;
  trackingWindowMin: number;
  customDays: { min: number; max: number };
  maxAddresses: number;
  /** Preferred-language options the server accepts (A5). */
  languages: { value: string; label: string }[];
}

/** One real visit row on a schedule day. `chefName` is set only when a chef is actually assigned. */
export interface ScheduleVisit {
  id: string;
  status: string;
  startsAt: string;
  chefName: string | null;
}

export interface ScheduleDay {
  date: string;
  weekday: string;
  /** service | off (customer off-day) | missed (company missed) | extension (added for a missed day) | removed */
  kind: 'service' | 'off' | 'missed' | 'extension' | 'removed';
  visits: ScheduleVisit[];
}

export interface Schedule {
  subscriptionId: string;
  days: ScheduleDay[];
  serviceDates: string[];
  visits: number;
  endDate: string;
  forfeitedGuaranteedDays: number;
  extensionDays: string[];
  offDays: string[];
  missedDays: string[];
  freeOffDaysLeft: number | null;
}

export const bookingService = {
  getConfig: () => api.get<AppConfig>('/config'),
  listServices: () => api.get<ServiceOffering[]>('/services'),
  getService: (type: ServiceType) => api.get<ServiceOffering>(`/services/${type}`),
  notifyMe: (type: ServiceType) => api.post<{ service: ServiceType; interested: boolean; alreadyRegistered: boolean }>(`/services/${type}/interest`),

  getEligibility: (service: BookableService) => api.get<ServiceEligibility>(`/customers/me/eligibility/${service}`),

  /** Creates a free-trial request (or a direct subscription when intent = 'subscribe'). The server prices everything. */
  createRequest: (service: BookableService, requirements: BookingRequirements, intent: 'trial' | 'subscribe' = 'trial') =>
    api.post<ServiceRequest>('/requests', { ...requirements, service, intent }),

  listMyRequests: () => api.get<ServiceRequest[]>('/requests'),
  getRequest: (id: string) => api.get<ServiceRequest>(`/requests/${id}`),

  listMyTrials: () => api.get<Trial[]>('/trials'),
  getTrial: (id: string) => api.get<{ trial: Trial; request: ServiceRequest }>(`/trials/${id}`),
  submitTrialDecision: (trialId: string, decision: TrialDecision) =>
    api.post<{ decision: TrialDecision; subscriptionId?: string; requestId: string }>(`/trials/${trialId}/decision`, { decision }),
  cancelTrial: (trialId: string) => api.post<Trial>(`/trials/${trialId}/cancel`),

  listMySubscriptions: () => api.get<Subscription[]>('/subscriptions'),
  getSubscription: (id: string) => api.get<Subscription>(`/subscriptions/${id}`),
  getSchedule: (id: string) => api.get<Schedule>(`/subscriptions/${id}/schedule`),
  saveOffDays: (id: string, offDays: string[]) => api.put<Subscription>(`/subscriptions/${id}/off-days`, { days: offDays }),
  /** The refund the server would give if the customer cancelled now. The app never computes or sends an amount. */
  getCancelPreview: (id: string) => api.get<CancelPreview>(`/subscriptions/${id}/cancel-preview`),
  cancelSubscription: (id: string, reason?: string) =>
    api.post<{ subscriptionId: string; refundAmount: number; refundPaise: number }>(`/subscriptions/${id}/cancel`, { reason }),

  /** Keyset-paginated; the history screen shows the first page and can ask for more. */
  listBookingHistory: () =>
    api.get<{ items: BookingSummary[]; nextCursor: string | null }>('/customers/me/history', { limit: 20 }).then((r) => r.items),
  listBookingHistoryPage: (cursor?: string) =>
    api.get<{ items: BookingSummary[]; nextCursor: string | null }>('/customers/me/history', { limit: 20, cursor }),
};
