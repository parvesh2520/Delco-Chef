// Visits, live tracking and chef visit actions. MOCK — no GPS, camera upload or websocket.
// Target endpoints: GET /visits, GET /visits/{id}/tracking, POST /visits/{id}/start-travel|check-in|check-out|photos
import type { TrackingSnapshot, Visit, VisitStatus } from '../types';
import { db, mock, mockError } from './mock';

const setStatus = (id: string, status: VisitStatus, patch: Partial<Visit> = {}) => {
  const v = db.visits.find((x) => x.id === id);
  if (!v) return mockError('Visit not found');
  Object.assign(v, { status, ...patch });
  return mock(v);
};

export const visitService = {
  listCustomerVisits: () => mock(db.visits.filter((v) => v.customerName === db.customerProfile.fullName)),
  listChefVisits: (chefId: string) => mock(db.visits.filter((v) => v.chefId === chefId)),
  get: (id: string) => mock(db.visits.find((v) => v.id === id) ?? null),

  getTracking: (id: string): Promise<TrackingSnapshot | null> => {
    const v = db.visits.find((x) => x.id === id);
    if (!v) return mock(null);
    const travelling = v.status === 'chef_travelling';
    return mock({
      visitId: id,
      available: travelling,
      reason: travelling ? undefined : v.status === 'scheduled' ? 'Your chef hasn’t started travelling yet.' : 'Tracking ends once the chef arrives.',
      chefLocation: travelling ? { lat: v.address.lat + 0.012, lng: v.address.lng - 0.009 } : undefined,
      destination: { lat: v.address.lat, lng: v.address.lng },
      etaMinutes: travelling ? 14 : undefined,
      distanceKm: travelling ? 2.3 : undefined,
      updatedAt: new Date().toISOString(),
    });
  },

  startTravel: (id: string) => setStatus(id, 'chef_travelling'),
  markArrived: (id: string) => setStatus(id, 'arrived'),
  verifyCheckInCode: (id: string, code: string) => {
    const v = db.visits.find((x) => x.id === id);
    if (!v) return mockError('Visit not found');
    if (v.checkInCode !== code) return mockError('Code does not match. Ask the customer to check the app.');
    return mock(true);
  },
  /** Selfie / food photo are captured UI-side only; upload is a backend integration. */
  uploadPhoto: (_id: string, _kind: 'check_in_selfie' | 'check_out_selfie' | 'food') => mock(true, 600),
  checkIn: (id: string) => setStatus(id, 'cooking', { checkInAt: new Date().toISOString() }),
  checkOut: (id: string) => setStatus(id, 'completed', { checkOutAt: new Date().toISOString() }),
  markCustomerUnavailable: (id: string, _note: string) => setStatus(id, 'customer_unavailable'),
};
