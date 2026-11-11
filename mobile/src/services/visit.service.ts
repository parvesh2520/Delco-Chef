// Visits, live tracking, chef visit actions (travel, GPS, photos, check-in/out). All validated server-side.
import type { TrackingSnapshot, Visit } from '../types';
import { ApiError, api } from './api';

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  deviceId?: string;
}

export interface AttendanceResult {
  id: string;
  visitId: string;
  checkInAt?: string;
  checkOutAt?: string;
  workedMinutes?: number;
  status: string;
  exception?: string;
}

const TRACKING_CODES = ['TRACKING_NOT_AVAILABLE_YET', 'TRACKING_NOT_STARTED', 'TRACKING_ENDED'];

export const visitService = {
  // No optional params: these are passed directly as TanStack `queryFn`s.
  listCustomerVisits: () => api.get<Visit[]>('/visits', { scope: 'all' }),
  listChefVisits: (_chefId?: string) => api.get<Visit[]>('/visits', { scope: 'all' }),
  get: (id: string) => api.get<Visit>(`/visits/${id}`),
  getCustomerContact: (id: string) =>
    api.get<{ name: string; phone: string; address: Visit['address'] }>(`/visits/${id}/customer`),

  /** Window/ended refusals come back as an unavailable snapshot so the map screen can explain why. */
  getTracking: async (id: string): Promise<TrackingSnapshot | null> => {
    try {
      return await api.get<TrackingSnapshot>(`/visits/${id}/tracking`);
    } catch (e) {
      if (e instanceof ApiError && TRACKING_CODES.includes(e.code)) {
        return { visitId: id, available: false, reason: e.message, code: e.code, updatedAt: new Date().toISOString() };
      }
      throw e;
    }
  },

  startTravel: (id: string) => api.post<Visit>(`/visits/${id}/travel/start`),
  stopTravel: (id: string) => api.post<Visit>(`/visits/${id}/travel/stop`),
  sendLocations: (id: string, points: { lat: number; lng: number; accuracy?: number; recordedAt: string }[]) =>
    api.post<{ accepted: number }>(`/visits/${id}/location`, { points }),
  /** Arrival is confirmed by a successful geofenced check-in; this simply stops location sharing. */
  markArrived: (id: string) => api.post<Visit>(`/visits/${id}/travel/stop`),

  verifyCheckInCode: (id: string, code: string) => api.post<{ valid: boolean }>(`/visits/${id}/check-in/verify-code`, { code }),

  uploadPhoto: (id: string, kind: 'check_in_selfie' | 'check_out_selfie' | 'food', uri: string, mimeType = 'image/jpeg') => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', { uri, name: `${kind}.${mimeType === 'image/png' ? 'png' : 'jpg'}`, type: mimeType } as unknown as Blob);
    return api.upload<{ id: string; kind: string }>(`/visits/${id}/photos`, form);
  },

  checkIn: (id: string, body: Position & { code: string; selfiePhotoId: string }) =>
    api.post<AttendanceResult>(`/visits/${id}/check-in`, body),
  checkOut: (id: string, body: Partial<Position> & { selfiePhotoId: string; foodPhotoId: string }) =>
    api.post<AttendanceResult>(`/visits/${id}/check-out`, body),
  markCustomerUnavailable: (id: string, note: string, pos?: Partial<Position>) =>
    api.post<AttendanceResult>(`/visits/${id}/customer-unavailable`, { note, ...pos }),
};
