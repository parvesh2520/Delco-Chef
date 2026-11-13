import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { DURATION, EASE_OUT, FadeInUp, haptic, reducedMotion, useAnimatedNumber } from '../motion';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../theme';
import { Button } from './Button';
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

export interface NextAction {
  eyebrow: string;
  title: string;
  detail?: string;
  /** Extra line in the accent colour (e.g. allergies). */
  note?: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** First action is the main button; the rest are smaller. */
  actions?: { title: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void }[];
  onPress?: () => void;
  /** Nothing urgent: a quieter cream card instead of the plum one. */
  calm?: boolean;
}

/**
 * The one thing that matters most right now, at the top of a home screen. Everything else on the screen is secondary
 * to it, so it is the only large dark card there.
 */
export function NextActionCard({ eyebrow, title, detail, note, icon, actions = [], onPress, calm }: NextAction) {
  const fg = calm ? colors.text : colors.textOnDark;
  const [main, ...rest] = actions;
  return (
    <Card tone={calm ? 'cream' : 'plum'} onPress={onPress} style={styles.next} accessibilityLabel={`${eyebrow}: ${title}`}>
      <View style={styles.nextHead}>
        <View style={[styles.nextIcon, { backgroundColor: calm ? colors.primaryLight : colors.accent }]}>
          <Ionicons name={icon} size={22} color={calm ? colors.purple : colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="eyebrow" color={calm ? colors.purple : colors.accent}>{eyebrow}</Txt>
          <Txt variant="h2" color={fg}>{title}</Txt>
        </View>
      </View>
      {detail && <Txt variant="body" color={calm ? colors.textSecondary : colors.accentLight}>{detail}</Txt>}
      {note && <Txt variant="small" color={calm ? colors.error : colors.accent}>{note}</Txt>}
      {main && <Button title={main.title} icon={main.icon} variant={calm ? 'primary' : 'accent'} onPress={main.onPress} style={{ marginTop: spacing.xs }} />}
      {rest.length > 0 && (
        <View style={styles.nextMore}>
          {rest.map((a) => <Button key={a.title} title={a.title} icon={a.icon} variant={calm ? 'secondary' : 'accent'} small onPress={a.onPress} />)}
        </View>
      )}
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

/** Card with a tappable header that smoothly opens and closes its content; the chevron turns as it opens. */
export function Collapsible({ title, subtitle, icon, initiallyOpen = false, children }: { title: string; subtitle?: string; icon?: keyof typeof Ionicons.glyphMap; initiallyOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  const turn = useRef(new Animated.Value(initiallyOpen ? 1 : 0)).current;
  const toggle = () => {
    haptic.select();
    if (!reducedMotion()) LayoutAnimation.configureNext(LayoutAnimation.create(DURATION.base, 'easeInEaseOut', 'opacity'));
    Animated.timing(turn, { toValue: open ? 0 : 1, duration: DURATION.base, easing: EASE_OUT, useNativeDriver: true }).start();
    setOpen(!open);
  };
  return (
    <View style={styles.collapsible}>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ pressed }) => [styles.collapseHead, pressed && { backgroundColor: colors.sand }]}>
        {icon && <Ionicons name={icon} size={18} color={colors.purple} />}
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{title}</Txt>
          {subtitle && <Txt variant="small">{subtitle}</Txt>}
        </View>
        <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </Animated.View>
      </Pressable>
      {open && <View style={styles.collapseBody}>{children}</View>}
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
  next: { gap: spacing.sm, padding: spacing.lg - 4 },
  nextHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  nextMore: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  avatar: { backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  collapsible: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  collapseHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.md },
  collapseBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, alignItems: 'flex-start' },
  mock: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.primaryLight },
});
