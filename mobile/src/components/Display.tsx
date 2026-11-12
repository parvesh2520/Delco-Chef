import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { DURATION, EASE_OUT, FadeInUp, useAnimatedNumber } from '../motion';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../theme';
import { Card } from './Card';
import { Eyebrow, Txt } from './Txt';

/** Section with optional eyebrow + title, website-style. */
export function Section({ title, eyebrow, action, children }: { title?: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {(title || eyebrow || action) && (
        <View style={styles.sectionHead}>
          <View style={{ flex: 1, gap: 2 }}>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && <Txt variant="h2">{title}</Txt>}
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

/** Label/value line inside a card. */
export function InfoRow({ label, value, icon }: { label: string; value?: string | number | null; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.infoRow}>
      {icon && <Ionicons name={icon} size={16} color={colors.purple} style={{ marginTop: 2 }} />}
      <Txt variant="small" style={{ width: 120 }}>{label}</Txt>
      <Txt variant="bodyStrong" style={{ flex: 1 }}>{value === undefined || value === null || value === '' ? '—' : String(value)}</Txt>
    </View>
  );
}

/** A number that rolls from its previous value to the new one (counts, ETA, prices). */
export function RollingNumber({ value, format = (n) => String(Math.round(n)), ...txt }: { value: number; format?: (n: number) => string } & Omit<React.ComponentProps<typeof Txt>, 'children'>) {
  const n = useAnimatedNumber(value, DURATION.slow + 200);
  return <Txt {...txt}>{format(n)}</Txt>;
}

export function StatTile({ label, value, icon, onPress, highlight }: { label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; onPress?: () => void; highlight?: boolean }) {
  return (
    <Card onPress={onPress} tone={highlight ? 'accent' : 'default'} style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={20} color={colors.purple} />
      {typeof value === 'number' ? (
        <CountUp value={value} />
      ) : (
        <Txt style={{ fontFamily: fonts.heading, fontSize: 26 }}>{value}</Txt>
      )}
      <Txt variant="small">{label}</Txt>
    </Card>
  );
}

/** Dashboard counts roll up from zero on first show. */
function CountUp({ value }: { value: number }) {
  const [target, setTarget] = React.useState(0);
  useEffect(() => setTarget(value), [value]);
  return <RollingNumber value={target} style={{ fontFamily: fonts.heading, fontSize: 26 }} />;
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Txt style={{ fontFamily: fonts.bold, fontSize: size * 0.36 }} color={colors.textOnDark}>{initials}</Txt>
    </View>
  );
}

/** "Step 2 of 5" progress bar for wizards. */
// Last progress shown per wizard length, so the next step's bar fills on from where the previous one stopped.
const lastProgress: Record<number, number> = {};

export function StepProgress({ step, total, label }: { step: number; total: number; label?: string }) {
  const target = step / total;
  const v = useRef(new Animated.Value(lastProgress[total] ?? 0)).current;
  useEffect(() => {
    lastProgress[total] = target;
    Animated.timing(v, { toValue: target, duration: DURATION.slow + 120, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [target, total, v]);
  return (
    <View style={{ gap: 6 }} accessibilityLabel={`Step ${step} of ${total}`}>
      <Txt variant="caption">Step {step} of {total}{label ? ` · ${label}` : ''}</Txt>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: '100%', transformOrigin: 'left', transform: [{ scaleX: v }] }]} />
      </View>
    </View>
  );
}

/** Inline notice banner. */
export function Notice({ tone = 'info', icon = 'information-circle-outline', children }: { tone?: 'info' | 'warning' | 'error' | 'success'; icon?: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  const map = {
    info: [colors.infoLight, colors.info], warning: [colors.warningLight, colors.warning],
    error: [colors.errorLight, colors.error], success: [colors.successLight, colors.success],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <FadeInUp distance={6} style={[styles.notice, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={fg} />
      <Txt variant="small" color={colors.text} style={{ flex: 1 }}>{children}</Txt>
    </FadeInUp>
  );
}

/** Small label shown on mock-only interactions so they aren't mistaken for real functionality. */
export function MockTag({ children = 'Demo data — not connected to backend' }: { children?: string }) {
  return (
    <View style={styles.mock}>
      <Ionicons name="flask-outline" size={12} color={colors.purple} />
      <Txt variant="caption" color={colors.purple}>{children}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  infoRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, alignItems: 'flex-start' },
  stat: { flex: 1, minWidth: 140, gap: 4 },
  avatar: { backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, alignItems: 'flex-start' },
  mock: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.primaryLight },
});
