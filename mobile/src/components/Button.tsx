import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { FadeInUp, PressableScale } from '../motion';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme';
import { Txt } from './Txt';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.textOnDark, border: colors.primary },
  accent: { bg: colors.accent, fg: colors.primary, border: colors.accent },
  secondary: { bg: 'transparent', fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.purple, border: 'transparent' },
  danger: { bg: colors.error, fg: '#FFFFFF', border: colors.error },
};

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style }: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      to={small ? 0.94 : 0.97}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: p.bg, borderColor: p.border, opacity: disabled ? 0.45 : pressed ? 0.9 : 1 },
        style,
      ]}
    >
      {loading ? (
        <FadeInUp distance={4}>
          <ActivityIndicator color={p.fg} />
        </FadeInUp>
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={small ? 16 : 18} color={p.fg} />}
          <Txt style={{ fontFamily: fonts.medium, fontSize: small ? 14 : 16 }} color={p.fg}>
            {title}
          </Txt>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { minHeight: 40, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
