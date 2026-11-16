import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts } from '../theme';

type Variant = 'hero' | 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'small' | 'caption' | 'eyebrow' | 'label';

const styles: Record<Variant, TextStyle> = {
  hero: { fontFamily: fonts.heading, fontSize: 56, lineHeight: 62, letterSpacing: -1 },
  display: { fontFamily: fonts.heading, fontSize: 38, lineHeight: 44 },
  h1: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38 },
  h2: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 },
  h3: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  eyebrow: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0.2 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
};

const defaultColor: Partial<Record<Variant, string>> = {
  small: colors.textSecondary,
  caption: colors.textSecondary,
  eyebrow: colors.accent,
};

export interface TxtProps extends TextProps {
  variant?: Variant;
  color?: string;
  center?: boolean;
}

export function Txt({ variant = 'body', color, center, style, ...rest }: TxtProps) {
  return (
    <Text
      style={[styles[variant], { color: color ?? defaultColor[variant] ?? colors.text }, center && { textAlign: 'center' }, style]}
      {...rest}
    />
  );
}

/** Small accent label above a heading. */
export function Eyebrow({ children, center }: { children: string; center?: boolean }) {
  return (
    <Txt variant="eyebrow" center={center}>
      {children}
    </Txt>
  );
}
