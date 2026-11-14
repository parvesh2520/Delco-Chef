import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SERVICE_LABELS } from '../constants';
import { haptic, PressableScale, PulseDot } from '../motion';
import { colors, fonts, radius, shadow, spacing } from '../theme';
import type { Subscription, Visit } from '../types';
import { formatCurrency, formatDate } from '../utils';
import { Badge, Card } from './Card';
import { ChefPhoto } from './ChefCard';
import { Txt } from './Txt';

/** Upcoming visit as a card for a horizontal row: a calendar date block, the service, the slot and the chef. */
export function VisitCard({ visit, onPress }: { visit: Visit; onPress: () => void }) {
  const d = new Date(visit.date);
  const chef = visit.chef;
  return (
    <PressableScale onPress={onPress} to={0.97} feedback="select" accessibilityRole="button"
      accessibilityLabel={`${SERVICE_LABELS[visit.service]} visit on ${formatDate(visit.date)}`} style={styles.visit}>
      <View style={styles.visitTop}>
        <View style={styles.dateBlock}>
          <Txt variant="caption" color={colors.accent} style={{ fontFamily: fonts.medium }}>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</Txt>
          <Txt style={styles.dateNum}>{d.getDate()}</Txt>
          <Txt variant="caption">{d.toLocaleDateString('en-IN', { month: 'short' })}</Txt>
        </View>
        <Badge status={visit.status} />
      </View>
      <View style={{ gap: 2 }}>
        <Txt variant="h3" numberOfLines={1}>{visit.kind === 'trial' ? 'Free trial' : SERVICE_LABELS[visit.service]}</Txt>
        <View style={styles.inline}>
          <Ionicons name="time-outline" size={14} color={colors.textMuted} />
          <Txt variant="small">{visit.slot}</Txt>
        </View>
      </View>
      <View style={styles.visitChef}>
        {chef ? <ChefPhoto chef={chef} size={28} /> : <View style={styles.chefPending}><Ionicons name="person-outline" size={14} color={colors.textMuted} /></View>}
        <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>{chef?.name ?? 'Assigning your chef'}</Txt>
      </View>
    </PressableScale>
  );
}

/** The plan at a glance: visits done out of planned, period, slot and price. */
export function PlanCard({ sub, onPress }: { sub: Subscription; onPress?: () => void }) {
  const planned = sub.plannedVisits ?? 0;
  const done = Math.min(sub.completedVisits ?? 0, planned || Infinity);
  const pct = planned ? done / planned : 0;
  return (
    <Card tone="plum" onPress={onPress} style={styles.plan} accessibilityLabel={`${SERVICE_LABELS[sub.service]}, ${done} of ${planned} visits done`}>
      <View style={styles.planTop}>
        <Txt variant="eyebrow">{SERVICE_LABELS[sub.service]}</Txt>
        <View style={styles.planBadge}><Badge status={sub.status} /></View>
      </View>
      <View style={styles.inlineEnd}>
        <Txt style={styles.planBig} color={colors.textOnDark}>{done}</Txt>
        <Txt color={colors.accentLight} style={{ marginBottom: 6 }}>of {planned} visits done</Txt>
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: planned, now: done }}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <View style={styles.planFoot}>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt variant="small" color={colors.accentLight}>{formatDate(sub.startDate)} – {formatDate(sub.endDate)}</Txt>
          <Txt variant="small" color={colors.accentLight}>{sub.slot}</Txt>
        </View>
        <Txt style={styles.planPrice} color={colors.textOnDark}>{formatCurrency(sub.amount)}</Txt>
      </View>
    </Card>
  );
}

const STEPS = ['Confirmed', 'On the way', 'Arrived', 'Cooking', 'Done'] as const;

/** Where the visit is now, from the server's visit status (and the tracking "arriving" flag). */
export function visitStep(status?: string, arriving?: boolean): number {
  switch (status) {
    case 'chef_travelling': return arriving ? 2 : 1;
    case 'arrived': return 2;
    case 'checked_in':
    case 'cooking': return 3;
    case 'completed': return 4;
    default: return 0;
  }
}

/** Five-step progress strip for a visit. */
export function VisitSteps({ step }: { step: number }) {
  return (
    <View style={styles.steps} accessibilityLabel={`Visit progress: ${STEPS[step]}`}>
      {STEPS.map((label, i) => {
        const done = i < step || step === STEPS.length - 1;
        const current = i === step && !done;
        return (
          <View key={label} style={styles.step}>
            <View style={styles.stepRow}>
              <View style={[styles.bar, { opacity: i === 0 ? 0 : 1 }, i <= step && styles.barOn]} />
              <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]}>
                {done ? <Ionicons name="checkmark" size={12} color={colors.textOnDark} /> : current ? <PulseDot color={colors.accent} size={8} /> : null}
              </View>
              <View style={[styles.bar, { opacity: i === STEPS.length - 1 ? 0 : 1 }, i < step && styles.barOn]} />
            </View>
            <Txt variant="caption" center color={i <= step ? colors.text : colors.textMuted} style={current ? { fontFamily: fonts.medium } : undefined}>{label}</Txt>
          </View>
        );
      })}
    </View>
  );
}

/** 1–5 star picker; read-only when `onChange` is omitted. */
export function Stars({ value, onChange, size = 32 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.25 }} accessibilityRole={onChange ? 'adjustable' : undefined} accessibilityLabel={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Ionicons name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.accent : colors.border} />;
        return onChange ? (
          <Pressable key={n} hitSlop={6} onPress={() => (haptic.select(), onChange(n))} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>
            {icon}
          </Pressable>
        ) : <View key={n}>{icon}</View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  visit: { width: 232, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 12, ...shadow },
  visitTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  dateBlock: { width: 56, alignItems: 'center', paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border },
  dateNum: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 28, color: colors.text },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inlineEnd: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  visitChef: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  chefPending: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  plan: { padding: spacing.lg, gap: 12 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planBadge: { backgroundColor: colors.card, borderRadius: radius.sm },
  planBig: { fontFamily: fonts.heading, fontSize: 44, lineHeight: 50 },
  planPrice: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 },
  planFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,248,239,0.16)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  steps: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  bar: { flex: 1, height: 2, backgroundColor: colors.border },
  barOn: { backgroundColor: colors.accent },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  dotCurrent: { borderColor: colors.accent },
});
