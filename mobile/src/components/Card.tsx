import React from 'react';
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptic, PressableScale, PulseDot, reducedMotion } from '../motion';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadow, spacing } from '../theme';
import { humanize, statusTone, toneColors, type Tone } from '../utils';
import { Txt } from './Txt';

type CardTone = 'default' | 'cream' | 'plum' | 'accent';

const toneStyle: Record<CardTone, ViewStyle> = {
  default: { backgroundColor: colors.card, borderColor: 'transparent' },
  cream: { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, shadowOpacity: 0, elevation: 0 },
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
  const s = [styles.card, toneStyle[tone], tone === 'plum' && { overflow: 'hidden' as const }, style];
  const body = children;
  if (!onPress) return <View style={s}>{body}</View>;
  return (
    <PressableScale onPress={onPress} to={0.98} feedback="select" accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={s}>
      {body}
    </PressableScale>
  );
}

const LIVE = ['in_progress', 'travelling', 'cooking', 'arrived', 'checked_in'];

/** Rounded status pill; tone inferred from status keywords unless given. */
export function Badge({ status, label, tone }: { status?: string; label?: string; tone?: Tone }) {
  const t = toneColors[tone ?? statusTone(status ?? '')];
  const live = !!status && LIVE.some((k) => status.includes(k));
  const text = label ?? humanize(status ?? '');
  // When the status changes in place (pending → paid), the new pill fades and pops in instead of snapping.
  const v = React.useRef(new Animated.Value(1)).current;
  const prev = React.useRef(text);
  React.useEffect(() => {
    if (prev.current === text) return;
    prev.current = text;
    if (reducedMotion()) return;
    v.setValue(0);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 10 }).start();
  }, [text, v]);
  return (
    <Animated.View
      style={[styles.badge, { backgroundColor: t.bg }, live && styles.badgeLive,
        { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}
    >
      {live && <PulseDot color={t.fg} size={6} />}
      <Txt variant="caption" color={t.fg} style={{ fontFamily: fonts.medium }}>
        {text}
      </Txt>
    </Animated.View>
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
    <Pressable onPress={onPress && (() => (haptic.select(), onPress()))} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.sand }]}>
      {icon && (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={danger ? colors.error : colors.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong" color={danger ? colors.error : undefined}>{title}</Txt>
        {subtitle && <Txt variant="small">{subtitle}</Txt>}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
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
  card: { borderRadius: radius.lg, borderWidth: 1, padding: 20, gap: 12, ...shadow },
  badgeLive: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, minHeight: 60, paddingVertical: 12 },
  rowIcon: { width: 24, alignItems: 'center' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginLeft: spacing.md },
});
