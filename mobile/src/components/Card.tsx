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
  // Lifted off the page: a deep, plum-tinted shadow under the card.
  plum: { backgroundColor: colors.primary, borderColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.32, shadowRadius: 22, elevation: 12 },
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
  const body = tone === 'plum' ? <><PlumDepth />{children}</> : children;
  if (!onPress) return <View style={s}>{body}</View>;
  return (
    <PressableScale onPress={onPress} to={0.98} feedback="select" accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={s}>
      {body}
    </PressableScale>
  );
}

/**
 * Light and depth inside plum cards: a soft lit corner, a faint warm glow low down and a thin top highlight.
 * Clipped to the card here so the card itself can keep its shadow (overflow: hidden would cut it off on iOS).
 */
function PlumDepth() {
  return (
    <View pointerEvents="none" style={styles.depth}>
      <View style={styles.lit} />
      <View style={styles.warm} />
      <View style={styles.rim} />
    </View>
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

export type Tint = 'plum' | 'orange' | 'accent' | 'green' | 'red';

export const TINTS: Record<Tint, { bg: string; fg: string }> = {
  plum: { bg: colors.primaryLight, fg: colors.purple },
  orange: { bg: colors.accentLight, fg: colors.primary },
  accent: { bg: colors.accent, fg: colors.primary },
  green: { bg: colors.successLight, fg: colors.success },
  red: { bg: colors.errorLight, fg: colors.error },
};

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  /** Coloured icon tile instead of a plain grey icon (menus such as Profile). */
  tint?: Tint;
}

/** Tappable row with leading icon and chevron — for menus and lists. */
export function ListRow({ title, subtitle, icon, right, onPress, danger, tint }: ListRowProps) {
  const t = tint ? TINTS[tint] : null;
  return (
    <Pressable onPress={onPress && (() => (haptic.select(), onPress()))} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.sand }]}>
      {icon && (
        <View style={t ? [styles.rowTile, { backgroundColor: t.bg }] : styles.rowIcon}>
          <Ionicons name={icon} size={t ? 18 : 20} color={t ? t.fg : danger ? colors.error : colors.textSecondary} />
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
        <View key={i}>
          {i > 0 && <View style={styles.divider} />}
          {c}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  depth: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.lg, overflow: 'hidden' },
  lit: { position: 'absolute', width: 260, height: 260, borderRadius: 130, top: -150, right: -90, backgroundColor: colors.purple, opacity: 0.38 },
  warm: { position: 'absolute', width: 180, height: 180, borderRadius: 90, bottom: -120, left: -60, backgroundColor: colors.accent, opacity: 0.12 },
  rim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,248,239,0.16)' },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: 20, gap: 12, ...shadow },
  badgeLive: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, minHeight: 60, paddingVertical: 12 },
  rowIcon: { width: 24, alignItems: 'center' },
  rowTile: { width: 36, height: 36, borderRadius: radius.md - 4, alignItems: 'center', justifyContent: 'center' },
  // Inset hairline: starts at the row's content edge but never shifts the row itself.
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.md },
});
