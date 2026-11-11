import { create } from 'zustand';
import type { BookableService, BookingRequirements, ChefApplicationStatus, Session } from '../types';
import type { ChefApplicationDraft } from '../services/chef.service';

// ---------- Auth ----------
// Access token lives in memory only; the refresh token is kept in SecureStore (services/session.ts).
interface AuthState {
  session: Session | null;
  sessionExpired: boolean;
  signIn: (session: Session & { refreshToken?: string }) => void;
  signOut: () => void;
  expireSession: () => void;
  setOnboarded: () => void;
  setChefStatus: (s: ChefApplicationStatus) => void;
  setName: (fullName: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  sessionExpired: false,
  signIn: ({ refreshToken: _r, ...session }) => set({ session, sessionExpired: false }),
  signOut: () => set({ session: null }),
  expireSession: () => set({ session: null, sessionExpired: true }),
  setOnboarded: () => set((s) => (s.session ? { session: { ...s.session, onboarded: true } } : s)),
  setChefStatus: (chefStatus) => set((s) => (s.session ? { session: { ...s.session, chefStatus } } : s)),
  setName: (fullName) =>
    set((s) => (s.session ? { session: { ...s.session, user: { ...s.session.user, fullName } } } : s)),
}));

// ---------- Customer booking wizard ----------
export type BookingDraft = Partial<BookingRequirements> & { service?: BookableService };

interface BookingDraftState {
  draft: BookingDraft;
  start: (service: BookableService) => void;
  update: (patch: BookingDraft) => void;
  reset: () => void;
}

export const useBookingDraft = create<BookingDraftState>((set) => ({
  draft: {},
  start: (service) => set({ draft: { service, allergies: [], cuisines: [], meals: [] } }),
  update: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  reset: () => set({ draft: {} }),
}));

// ---------- Chef registration wizard ----------
interface ChefDraftState {
  draft: Partial<ChefApplicationDraft>;
  update: (patch: Partial<ChefApplicationDraft>) => void;
  reset: () => void;
}

export const useChefDraft = create<ChefDraftState>((set) => ({
  draft: { cuisines: [], documents: {} },
  update: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  reset: () => set({ draft: { cuisines: [], documents: {} } }),
}));

// ---------- Toast (success / info messages) ----------
interface ToastState {
  message: string | null;
  tone: 'success' | 'error' | 'info';
  show: (message: string, tone?: ToastState['tone']) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'success',
  show: (message, tone = 'success') => set({ message, tone }),
  hide: () => set({ message: null }),
}));
