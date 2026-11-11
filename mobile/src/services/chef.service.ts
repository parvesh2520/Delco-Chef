// Chef registration, assignments, off-days, earnings. MOCK.
// Target endpoints: POST /chefs/applications, GET /chefs/me, GET /chefs/me/assignments, POST /assignments/{id}/respond
import type { BankDetails, Chef, Earnings } from '../types';
import { db, mock, mockError } from './mock';

export interface ChefApplicationDraft {
  fullName: string;
  email: string;
  city: string;
  area: string;
  experienceYears: string;
  cuisines: string[];
  specialities: string;
  documents: Partial<Record<'aadhaar' | 'pan' | 'police_verification' | 'photo', string>>;
  bank: Omit<BankDetails, 'accountNumberMasked'> & { accountNumber: string };
}

const offDays: Record<string, string[]> = { ch1: [] };

export const chefService = {
  getMe: (chefId: string) => mock(db.chefs.find((c) => c.id === chefId) ?? null),
  updateMe: (chefId: string, patch: Partial<Chef>) => {
    const c = db.chefs.find((x) => x.id === chefId);
    return c ? mock(Object.assign(c, patch)) : mockError('Chef not found');
  },
  submitApplication: (_draft: ChefApplicationDraft) => mock({ status: 'submitted' as const }, 800),

  listAssignments: () => mock(db.assignments),
  getAssignment: (id: string) => mock(db.assignments.find((a) => a.id === id) ?? null),
  respondAssignment: (id: string, accept: boolean, _reason?: string) => {
    const a = db.assignments.find((x) => x.id === id);
    if (!a) return mockError('Assignment not found');
    if (a.status !== 'offered') return mockError('This assignment is no longer open.');
    a.status = accept ? 'accepted' : 'declined';
    return mock(a);
  },

  getOffDays: (chefId: string) => mock(offDays[chefId] ?? []),
  saveOffDays: (chefId: string, days: string[]) => mock((offDays[chefId] = days)),

  getEarnings: (): Promise<Earnings> =>
    mock({
      period: 'November 2026', total: 14850, visits: 33, pendingPayout: 9900,
      entries: db.visits.filter((v) => v.status === 'completed').map((v) => ({ id: v.id, date: v.date, customerName: v.customerName, amount: 450, status: 'pending' as const })),
    }),
};
