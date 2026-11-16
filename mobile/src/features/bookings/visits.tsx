import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, ChefPhoto, Stars, Txt } from '../../components';
import { SERVICE_LABELS } from '../../constants';
import { PressableScale } from '../../motion';
import { colors, fonts, radius, shadow, spacing } from '../../theme';
import type { Visit } from '../../types';
import { formatDate, formatTime } from '../../utils';

export const ENDED_VISIT = ['completed', 'customer_unavailable', 'missed', 'cancelled'];

export const startOf = (v: Visit) => v.startsAt ?? v.date;
const visitTitle = (v: Visit) => (v.kind === 'trial' ? 'Free trial' : SERVICE_LABELS[v.service]);
const openVisit = (v: Visit) => router.push({ pathname: '/customer/visit/[id]', params: { id: v.id } });

/** "Today", "Tomorrow" or "Wednesday, 18 Nov". */
function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

/** Upcoming visits in date order, grouped under a heading per day. */
function groupByDay(visits: Visit[]): { day: string; visits: Visit[] }[] {
  const groups: { day: string; visits: Visit[] }[] = [];
  for (const v of visits) {
    const day = dayHeading(startOf(v));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.visits.push(v);
    else groups.push({ day, visits: [v] });
  }
  return groups;
}

/** One upcoming visit: the time large on the left, then what it is and which chef is coming. */
function UpcomingRow({ v }: { v: Visit }) {
  const chefName = v.chef?.name ?? v.chefName;
  return (
    <PressableScale onPress={() => openVisit(v)} to={0.98} feedback="select" accessibilityRole="button"
      accessibilityLabel={`${visitTitle(v)} at ${formatTime(startOf(v))}, ${chefName || 'chef being assigned'}`} style={styles.row}>
      <View style={styles.time}>
        <Txt style={styles.timeText} numberOfLines={1}>{formatTime(startOf(v))}</Txt>
        <Txt variant="caption" numberOfLines={1}>{v.slot}</Txt>
      </View>
      <View style={styles.rowBody}>
        <Txt variant="h3" numberOfLines={1}>{visitTitle(v)}</Txt>
        <View style={styles.inline}>
          {v.chef ? <ChefPhoto chef={v.chef} size={20} /> : <Ionicons name="person-outline" size={14} color={colors.textMuted} />}
          <Txt variant="small" numberOfLines={1} style={{ flex: 1 }}>{chefName || 'Delco is assigning your chef'}</Txt>
        </View>
      </View>
      <View style={styles.right}><Badge status={v.status} /></View>
    </PressableScale>
  );
}

/** Upcoming visits (already sorted) grouped by day. */
export function UpcomingVisits({ visits }: { visits: Visit[] }) {
  return (
    <View style={{ gap: spacing.md }}>
      {groupByDay(visits).map((g) => (
        <View key={g.day} style={{ gap: spacing.sm }}>
          <Txt variant="label" color={colors.textSecondary}>{g.day}</Txt>
          {g.visits.map((v) => <UpcomingRow key={v.id} v={v} />)}
        </View>
      ))}
    </View>
  );
}

/** A finished visit: date, chef and the customer's rating (or a nudge to rate it). */
function PastRow({ v }: { v: Visit }) {
  const chefName = v.chef?.name ?? v.chefName;
  return (
    <PressableScale onPress={() => openVisit(v)} to={0.98} feedback="select" accessibilityRole="button"
      accessibilityLabel={`${visitTitle(v)} on ${formatDate(startOf(v))}`} style={styles.pastRow}>
      <View style={styles.rowBody}>
        <Txt variant="bodyStrong" numberOfLines={1}>{visitTitle(v)}</Txt>
        <Txt variant="small" numberOfLines={1}>{formatDate(startOf(v))}{chefName ? ` · ${chefName}` : ''}</Txt>
      </View>
      {v.rating ? <Stars value={v.rating.stars} size={14} />
        : v.canRate ? (
          <View style={styles.ratePill}>
            <Ionicons name="star-outline" size={12} color={colors.primary} />
            <Txt variant="caption" color={colors.primary} style={{ fontFamily: fonts.medium }}>Rate</Txt>
          </View>
        ) : <View style={styles.right}><Badge status={v.status} /></View>}
    </PressableScale>
  );
}

/** Finished visits in one card, separated by hairlines. */
export function PastVisits({ visits }: { visits: Visit[] }) {
  return (
    <View style={styles.pastGroup}>
      {visits.map((v, i) => (
        <View key={v.id}>
          {i > 0 && <View style={styles.divider} />}
          <PastRow v={v} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, ...shadow },
  time: { minWidth: 72, flexShrink: 0, paddingRight: 12, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border, gap: 2 },
  timeText: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 22, color: colors.text },
  rowBody: { flex: 1, gap: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pastGroup: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.md },
  right: { alignSelf: 'center', flexShrink: 0 },  // Badge pins itself to the top; keep it centred in the row
  ratePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.accentLight },
});
