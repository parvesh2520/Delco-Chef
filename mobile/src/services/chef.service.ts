// Chef registration, assignments, off-days, earnings.
import type { Assignment, BankDetails, Chef, Earnings } from '../types';
import { api } from './api';

export type ChefDocKind = 'aadhaar' | 'pan' | 'police_verification' | 'photo';

export interface ChefApplicationDraft {
  fullName: string;
  email: string;
  city: string;
  area: string;
  homeLat?: number;
  homeLng?: number;
  /** UI-only: last error from the location prompt. */
  homeError?: string;
  experienceYears: string;
  cuisines: string[];
  specialities: string;
  idNumber: string;
  taxNumber: string;
  /** Local image URIs picked by the chef; uploaded before submit. */
  documents: Partial<Record<ChefDocKind, string>>;
  bank: Omit<BankDetails, 'accountNumberMasked'> & { accountNumber: string };
}

export const chefService = {
  getMe: (_chefId?: string) => api.get<Chef>('/chefs/me'),
  updateMe: (_chefId: string, patch: Partial<Chef>) => api.patch<Chef>('/chefs/me', patch),

  uploadDocument: (type: ChefDocKind, uri: string, mimeType = 'image/jpeg') => {
    const form = new FormData();
    form.append('file', { uri, name: `${type}.${mimeType === 'image/png' ? 'png' : 'jpg'}`, type: mimeType } as unknown as Blob);
    return api.upload<{ id: string; type: string }>(`/chefs/me/documents/${type}`, form);
  },

  submitApplication: async (draft: ChefApplicationDraft) => {
    for (const [type, uri] of Object.entries(draft.documents)) {
      if (uri) await chefService.uploadDocument(type as ChefDocKind, uri);
    }
    const { documents: _d, homeError: _e, ...body } = draft;
    return api.post<Chef>('/chefs/me/application', body);
  },

  listAssignments: () => api.get<Assignment[]>('/chefs/me/assignments'),
  getAssignment: (id: string) => api.get<Assignment>(`/chefs/me/assignments/${id}`),
  respondAssignment: (id: string, accept: boolean, reason?: string) =>
    api.post<Assignment>(`/assignments/${id}/respond`, { accept, reason }),

  getOffDays: (_chefId?: string) => api.get<string[]>('/chefs/me/off-days'),
  saveOffDays: (_chefId: string, days: string[]) =>
    api.put<{ days: string[]; conflicts: string[] }>('/chefs/me/off-days', { days }).then((r) => r.days),

  getEarnings: () => api.get<Earnings>('/chefs/me/earnings'),
  listAttendance: () => api.get<{ id: string; visitId: string; date: string; workedMinutes?: number; status: string }[]>('/chefs/me/attendance'),
};
