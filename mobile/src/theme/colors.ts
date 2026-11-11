// Palette taken from delcochefs.com: deep plum, purple, warm orange on cream.
export const colors = {
  primary: '#3F1A42', // plum — headings, primary buttons
  primaryLight: '#F3E8F2',
  purple: '#86308B',
  accent: '#E8983E', // warm orange — CTAs, highlights
  accentLight: '#FBEBD6',

  background: '#FAF4E8', // cream page
  backgroundSecondary: '#FFF8EF',
  card: '#FFFFFF',
  sand: '#F7F5F1',
  text: '#3F1A42',
  textSecondary: '#81777C',
  textMuted: '#A79EA2',
  textOnDark: '#FFF8EF',
  border: '#E7DCD2',

  success: '#2F7D4F',
  successLight: '#E3F1E8',
  warning: '#B8701C',
  warningLight: '#FBEBD6',
  error: '#B3261E',
  errorLight: '#F8E1DF',
  info: '#86308B',
  infoLight: '#F3E8F2',
} as const;

export type Colors = typeof colors;
