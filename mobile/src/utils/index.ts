import { colors } from '../theme';

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
