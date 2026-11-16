import { colors } from '../theme';
import type { Visit } from '../types';

export const formatCurrency = (amount: number, currency: string = 'INR'): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** ISO date (yyyy-mm-dd) for a Date in local time. */
export const toDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "pending_assignment" -> "Pending assignment" */
export const humanize = (value: string): string => {
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const maskPhone = (phone: string): string => `+91 ••••• ${phone.slice(-5)}`;

export const isValidPhone = (v: string) => /^[6-9]\d{9}$/.test(v);
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const isValidPincode = (v: string) => /^\d{6}$/.test(v);
export const isValidIfsc = (v: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
export const required = (v: string | undefined | null) => !!v && v.trim().length > 0;

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const TONE_KEYWORDS: [Tone, string[]][] = [
  ['success', ['active', 'paid', 'completed', 'approved', 'verified', 'accepted', 'converted', 'ok', 'resolved', 'checked_in']],
  ['error', ['failed', 'rejected', 'declined', 'expired', 'cancelled', 'exception', 'missed', 'unavailable', 'inactive']],
  ['warning', ['pending', 'awaiting', 'offered', 'under_review', 'submitted', 'link_created', 'paused']],
  ['info', ['scheduled', 'assigned', 'travelling', 'in_progress', 'cooking', 'arrived']],
];

export const statusTone = (status: string): Tone =>
  TONE_KEYWORDS.find(([, keys]) => keys.some((k) => status.includes(k)))?.[0] ?? 'neutral';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: colors.success, bg: colors.successLight },
  warning: { fg: colors.warning, bg: colors.warningLight },
  error: { fg: colors.error, bg: colors.errorLight },
  info: { fg: colors.info, bg: colors.infoLight },
  neutral: { fg: colors.textSecondary, bg: colors.sand },
};

export const isNetworkError = (e: unknown): boolean =>
  !!e && typeof e === 'object' && 'isAxiosError' in e && !(e as { response?: unknown }).response;

/** Same bounding box as the server (backend/app/domain/geo.py): latitude and longitude must be within India (A9). */
export const isWithinIndia = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6.5 && lat <= 37.2 && lng >= 68.0 && lng <= 97.5;

// ---------- Visit timing ----------
const LIVE_VISIT = ['chef_travelling', 'arrived', 'checked_in', 'cooking'];
const ENDED_VISIT = ['completed', 'customer_unavailable', 'missed', 'cancelled'];
/** Older payloads without `endsAt`: treat a visit as over two hours after it starts. */
const DEFAULT_VISIT_MS = 2 * 3600_000;

export const visitStart = (v: Visit): number => new Date(v.startsAt ?? v.date).getTime();
export const visitEnd = (v: Visit): number => (v.endsAt ? new Date(v.endsAt).getTime() : visitStart(v) + DEFAULT_VISIT_MS);
export const isLiveVisit = (v: Visit): boolean => LIVE_VISIT.includes(v.status);
export const isEndedVisit = (v: Visit): boolean => ENDED_VISIT.includes(v.status);

/**
 * Visits still ahead, the one that matters now first: a visit under way, then by start time.
 * A scheduled visit drops out once its slot has ended, so the next one takes over even before the server marks it missed.
 */
export function upcomingVisits(visits: Visit[], now: number): Visit[] {
  return visits
    .filter((v) => !isEndedVisit(v) && (isLiveVisit(v) || visitEnd(v) > now))
    .sort((a, b) => Number(isLiveVisit(b)) - Number(isLiveVisit(a)) || visitStart(a) - visitStart(b));
}

export const isSameDay = (a: number | Date, b: number | Date): boolean => new Date(a).toDateString() === new Date(b).toDateString();

/** "45 min", "2 h 10 min", "3 days" until `at`; "now" once it has passed. */
export function timeUntil(at: number, now: number): string {
  const min = Math.ceil((at - now) / 60_000);
  if (min <= 0) return 'now';
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.round(min / (24 * 60));
  return `${d} day${d === 1 ? '' : 's'}`;
}

/** "Today", "Tomorrow" or "Wed, 18 Nov". */
export function dayLabel(at: number, now: number): string {
  const today = new Date(now);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (isSameDay(at, today)) return 'Today';
  if (isSameDay(at, tomorrow)) return 'Tomorrow';
  return new Date(at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
