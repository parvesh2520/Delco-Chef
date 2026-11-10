export const colors = {
  primary: '#E25822', // Flame / Culinary orange
  primaryDark: '#B83F10',
  primaryLight: '#FFEDE4',
  secondary: '#1E293B',
  accent: '#F59E0B',

  // Neutrals
  background: '#FFFFFF',
  backgroundSecondary: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;

export type Colors = typeof colors;
