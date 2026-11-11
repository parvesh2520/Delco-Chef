// Ops / Super Admin. The UI hides actions by role for convenience; FastAPI enforces every permission.
import type {
  AdminAccount, AdminDashboardStats, AssignmentHistoryEntry, AttendanceRecord, AuditLog, Chef, ChefSuggestion, Payout, RequestStatus,
  ServiceRequest, SettingsSection, SettingsSectionKey, Subscription,
} from '../types';
import { api } from './api';

type Page<T> = { items: T[]; nextCursor: string | null };

export interface AdminRequest extends ServiceRequest {
  targetVisit?: { id: string; date: string; slot: string; kind: string; status: string; chefId?: string } | null;
}

export const adminService = {
  getDashboard: () => api.get<AdminDashboardStats>('/admin/dashboard'),
  getStageSummary: () => api.get<Record<string, unknown>>('/admin/stage-summary'),

  listRequests: (status?: RequestStatus | 'closed') =>
    api.get<Page<ServiceRequest>>('/admin/requests', { status, limit: 100 }).then((p) => p.items),
  getRequest: (id: string) => api.get<AdminRequest>(`/admin/requests/${id}`),
  getCustomer: (customerId: string) =>
    api.get<{ id: string; name: string; phone: string; address: ServiceRequest['address']; requests: ServiceRequest[]; subscriptions: Subscription[] }>(
      `/admin/customers/${customerId}`
    ),
  revealPhone: (userId: string, reason: string) => api.post<{ phone: string }>(`/admin/users/${userId}/reveal-phone`, { reason }),

  /** Ranked list straight from the server's eligibility + scoring engine. */
  getSuggestions: (requestId: string, date?: string) =>
    api.get<ChefSuggestion[]>(`/admin/requests/${requestId}/suggestions`, { date }).then((list) =>
      list.map((s) => ({
        ...s,
        rawScore: s.score, // spec score (0–1) as stored on the booking
        score: Math.round(s.score * 1000) / 10,
        breakdown: {
          rating: Math.round(s.breakdown.rating * 100), distance: Math.round(s.breakdown.distance * 100),
          workload: Math.round(s.breakdown.workload * 100), cuisine: s.breakdown.cuisine,
        },
      }))
    ),
  getChef: (chefId: string) => api.get<Chef>(`/admin/chefs/${chefId}`),
  assignChef: (requestId: string, chefId: string, reason?: string) =>
    api.post<ServiceRequest>(`/admin/requests/${requestId}/assign`, { chefId, reason }),
  getAssignmentHistory: (requestId: string) => api.get<AssignmentHistoryEntry[]>(`/admin/requests/${requestId}/assignments`),

  listTrialBoard: () => api.get<ServiceRequest[]>('/admin/board'),
  getBoardMoves: (requestId: string) => api.get<{ from: string; to: string; by: string; at: string; note?: string }[]>(`/admin/requests/${requestId}/moves`),
  /** Admin pushes trial 2 with a chef from the ranked list and a date. */
  pushSecondTrial: (requestId: string, chefId: string, date: string) =>
    api.post<ServiceRequest>(`/admin/requests/${requestId}/push-trial`, { chefId, date }),
  moveCard: (requestId: string, to: string, note?: string) => api.post<ServiceRequest>(`/admin/requests/${requestId}/move`, { to, note }),

  listAttendance: () => api.get<AttendanceRecord[]>('/admin/attendance'),
  getAttendance: (id: string) => api.get<AttendanceRecord>(`/admin/attendance/${id}`),
  resolveAttendance: (id: string, resolution: string, workedMinutes?: number) =>
    api.post<AttendanceRecord>(`/admin/attendance/${id}/resolve`, { resolution, workedMinutes }),

  listPaymentLinks: () => api.get<{ id: string; paymentId: string; amount: number; status: string; expiresAt: string; customerName: string }[]>('/admin/payment-links'),

  getSettings: () => api.get<SettingsSection[]>('/admin/settings'),
  getSettingsSection: (key: SettingsSectionKey) => api.get<SettingsSection>(`/admin/settings/${key}`),
  saveSettingsSection: (key: SettingsSectionKey, values: Record<string, string>) =>
    api.put<SettingsSection>(`/admin/settings/${key}`, { values }),

  // ----- Super Admin only -----
  listAdmins: () => api.get<AdminAccount[]>('/admin/admins'),
  createAdmin: (a: Pick<AdminAccount, 'name' | 'phone' | 'email' | 'role'>) => api.post<AdminAccount>('/admin/admins', a),
  setAdminActive: (id: string, active: boolean) => api.patch<AdminAccount>(`/admin/admins/${id}`, { active }),

  listChefApplications: () => api.get<Chef[]>('/admin/chef-applications'),
  decideChefApplication: (chefId: string, approve: boolean, reason?: string) =>
    api.post<Chef>(`/admin/chef-applications/${chefId}/decision`, { approve, reason }),
  /** Every reveal is written to the audit log on the server. */
  revealDocument: (chefId: string, docId: string, reason?: string) =>
    api.post<{ value: string | null; fileUrl?: string }>(`/admin/chefs/${chefId}/documents/${docId}/reveal`, { reason }),
  revealBank: (chefId: string, reason?: string) => api.post<{ accountNumber: string; upi?: string }>(`/admin/chefs/${chefId}/bank/reveal`, { reason }),
  listAuditLogs: () => api.get<AuditLog[]>('/admin/audit-logs'),

  listPayouts: () => api.get<Payout[]>('/admin/payouts'),
  getPayout: (id: string) => api.get<Payout & { items: { id: string; amount: number; kind: string; note?: string }[] }>(`/admin/payouts/${id}`),
  decidePayout: (id: string, approve: boolean) => api.post<Payout>(`/admin/payouts/${id}/decision`, { approve }),
  markPayoutPaid: (id: string, bankReference: string) => api.post<Payout>(`/admin/payouts/${id}/decision`, { approve: true, bankReference }),
  adjustPayout: (id: string, amountPaise: number, reason: string) => api.post<Payout>(`/admin/payouts/${id}/adjustments`, { amountPaise, reason }),
};
