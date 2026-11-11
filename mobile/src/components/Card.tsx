import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '../theme';
import { humanize, statusTone, toneColors, type Tone } from '../utils';
import { Txt } from './Txt';

type CardTone = 'default' | 'cream' | 'plum' | 'accent';

const toneStyle: Record<CardTone, ViewStyle> = {
  default: { backgroundColor: colors.card, borderColor: colors.border },
  cream: { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
  plum: { backgroundColor: colors.primary, borderColor: colors.primary },
  accent: { backgroundColor: colors.accentLight, borderColor: colors.accent },
};

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  tone?: CardTone;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Card({ children, onPress, tone = 'default', style, accessibilityLabel }: CardProps) {
  const s = [styles.card, toneStyle[tone], style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [s, pressed && { opacity: 0.9 }]}>
      {children}
    </Pressable>
  );
}

/** Rounded status pill; tone inferred from status keywords unless given. */
export function Badge({ status, label, tone }: { status?: string; label?: string; tone?: Tone }) {
  const t = toneColors[tone ?? statusTone(status ?? '')];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Txt variant="caption" color={t.fg} style={{ fontWeight: '700' }}>
        {label ?? humanize(status ?? '')}
      </Txt>
    </View>
  );
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}

/** Tappable row with leading icon and chevron — for menus and lists. */
export function ListRow({ title, subtitle, icon, right, onPress, danger }: ListRowProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.sand }]}>
      {icon && (
        <View style={[styles.rowIcon, danger && { backgroundColor: colors.errorLight }]}>
          <Ionicons name={icon} size={18} color={danger ? colors.error : colors.purple} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" color={danger ? colors.error : undefined}>{title}</Txt>
        {subtitle && <Txt variant="small">{subtitle}</Txt>}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

/** Groups ListRows inside a card with dividers. */
export function ListGroup({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.card, toneStyle.default, { padding: 0, overflow: 'hidden' }]}>
      {items.map((c, i) => (
        <View key={i} style={i > 0 && styles.divider}>
          {c}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm, ...shadow },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 14 },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
});
