// Ops/Super Admin operations. MOCK. Role checks here are UI conveniences; enforce them in FastAPI.
// Target endpoints under /admin/*.
import type { AdminAccount, AdminDashboardStats, AdminRole, RequestStatus, SettingsSectionKey } from '../types';
import { db, mock, mockError, newId } from './mock';

const log = (actor: string, actorRole: AdminRole, action: string, target: string) =>
  db.auditLogs.unshift({ id: newId('l'), actor, actorRole, action, target, at: new Date().toISOString() });

export const adminService = {
  getDashboard: (): Promise<AdminDashboardStats> =>
    mock({
      pendingRequests: db.requests.filter((r) => r.status === 'pending_assignment').length,
      trialsToday: 3,
      activeSubscriptions: db.subscriptions.filter((s) => s.status === 'active').length + 41,
      pendingPayments: db.payments.filter((p) => p.status !== 'paid').length,
      attendanceExceptions: db.attendance.filter((a) => a.status === 'exception').length,
      pendingChefApplications: db.chefs.filter((c) => c.status === 'submitted' || c.status === 'under_review').length,
    }),

  listRequests: (status?: RequestStatus) => mock(status ? db.requests.filter((r) => r.status === status) : db.requests),
  getCustomer: (customerId: string) => {
    const reqs = db.requests.filter((r) => r.customerId === customerId);
    if (!reqs.length) return mock(null);
    const subs = db.subscriptions.filter((s) => reqs.some((r) => r.id === s.requestId));
    return mock({ id: customerId, name: reqs[0].customerName, phone: reqs[0].customerPhone, address: reqs[0].address, requests: reqs, subscriptions: subs });
  },

  /** Ranked list: eligible (approved, in radius, free slot) first, ineligible with reasons. */
  getSuggestions: (_requestId: string) => mock(db.suggestions),
  getChef: (chefId: string) => mock(db.chefs.find((c) => c.id === chefId) ?? db.suggestions.find((s) => s.chefId === chefId) ?? null),
  assignChef: (requestId: string, chefId: string, reason?: string) => {
    const req = db.requests.find((r) => r.id === requestId);
    const s = db.suggestions.find((x) => x.chefId === chefId);
    if (!req || !s) return mockError('Not found');
    if (!s.eligible) return mockError('Only eligible, approved chefs can be assigned.');
    const isReassign = !!req.assignedChefId;
    Object.assign(req, { assignedChefId: chefId, assignedChefName: s.chefName, status: req.status === 'pending_assignment' ? 'chef_assigned' : req.status });
    const pending = req.trials.find((t) => t.status === 'pending_assignment');
    if (pending) Object.assign(pending, { status: 'scheduled', chefId, chefName: s.chefName });
    db.assignmentHistory.unshift({ id: newId('h'), requestId, chefName: s.chefName, action: isReassign ? 'reassigned' : 'assigned', reason, by: 'You', at: new Date().toISOString() });
    return mock(req, 600);
  },
  getAssignmentHistory: (requestId: string) => mock(db.assignmentHistory.filter((h) => h.requestId === requestId)),

  listTrialBoard: () => mock(db.requests.filter((r) => r.trials.length > 0)),
  /** Ops can push trial 2 when the customer asked for another trial. */
  pushSecondTrial: (requestId: string) => {
    const req = db.requests.find((r) => r.id === requestId);
    const t2 = req?.trials.find((t) => t.number === 2);
    if (!req || !t2) return mockError('Second trial has not been requested.');
    t2.status = 'scheduled';
    req.status = 'trial_scheduled';
    return mock(req);
  },

  listAttendance: () => mock(db.attendance),
  getAttendance: (id: string) => mock(db.attendance.find((a) => a.id === id) ?? null),
  resolveAttendance: (id: string, resolution: string) => {
    const a = db.attendance.find((x) => x.id === id);
    if (!a) return mockError('Record not found');
    Object.assign(a, { status: 'resolved', resolution });
    return mock(a);
  },

  getSettings: () => mock(db.settings),
  getSettingsSection: (key: SettingsSectionKey) => mock(db.settings.find((s) => s.key === key) ?? null),
  saveSettingsSection: (key: SettingsSectionKey, values: Record<string, string>) => {
    const s = db.settings.find((x) => x.key === key);
    if (!s) return mockError('Unknown settings section');
    s.fields.forEach((f) => (f.value = values[f.key] ?? f.value));
    return mock(s);
  },

  // ----- Super Admin only -----
  listAdmins: () => mock(db.admins),
  createAdmin: (a: Pick<AdminAccount, 'name' | 'phone' | 'email' | 'role'>) => {
    if (db.admins.some((x) => x.phone === a.phone)) return mockError('An admin with this phone already exists.');
    const created = { ...a, id: newId('ad'), active: true, createdAt: new Date().toISOString() };
    db.admins.push(created);
    log('You', 'super_admin', 'Created admin', `${a.name} (${a.role})`);
    return mock(created);
  },
  setAdminActive: (id: string, active: boolean) => {
    const a = db.admins.find((x) => x.id === id);
    return a ? mock(Object.assign(a, { active })) : mockError('Admin not found');
  },

  listChefApplications: () => mock(db.chefs),
  decideChefApplication: (chefId: string, approve: boolean, reason?: string) => {
    const c = db.chefs.find((x) => x.id === chefId);
    if (!c) return mockError('Chef not found');
    Object.assign(c, { status: approve ? 'approved' : 'rejected', rejectionReason: approve ? undefined : reason });
    log('You', 'super_admin', approve ? 'Approved chef' : 'Rejected chef', c.name);
    return mock(c);
  },
  /** Reveal is audit-logged. Mock returns a fake full value. */
  revealDocument: (chefId: string, docId: string) => {
    const c = db.chefs.find((x) => x.id === chefId);
    const d = c?.documents.find((x) => x.id === docId);
    if (!c || !d) return mockError('Document not found');
    log('You', 'super_admin', 'Revealed document', `${c.name} · ${d.type}`);
    return mock({ value: d.maskedValue.replace(/X|•/g, '7') });
  },
  listAuditLogs: () => mock(db.auditLogs),

  listPayouts: () => mock(db.payouts),
  getPayout: (id: string) => mock(db.payouts.find((p) => p.id === id) ?? null),
  decidePayout: (id: string, approve: boolean) => {
    const p = db.payouts.find((x) => x.id === id);
    if (!p) return mockError('Payout not found');
    p.status = approve ? 'approved' : 'rejected';
    log('You', 'super_admin', approve ? 'Approved payout' : 'Rejected payout', `${p.chefName} · ${p.period}`);
    return mock(p);
  },
};
