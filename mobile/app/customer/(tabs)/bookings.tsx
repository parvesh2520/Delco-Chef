import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Badge, BookingCard, Button, EmptyState, ErrorState, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { ENDED_VISIT, PastVisits, startOf } from '../../../src/features/bookings/visits';
import { SkeletonList } from '../../../src/motion';
import { bookingService, visitService } from '../../../src/services';
import { colors, radius, spacing } from '../../../src/theme';
import type { Subscription } from '../../../src/types';
import { formatDate } from '../../../src/utils';

// Money lives on the Payments tab; this tab is about the visits themselves: how they went and the plans behind them.
// Upcoming visits live on each plan's screen, so this tab stays one plan per card. Trials are under Profile → Trials.
const LIVE_PLAN: Subscription['status'][] = ['active', 'pending_payment', 'paused'];
const RECENT_COUNT = 3;

/** A live plan with its period, slot and visits done. No amounts: those are on the Payments tab. */
function PlanItem({ sub }: { sub: Subscription }) {
  return (
    <BookingCard
      icon="repeat-outline"
      tint="orange"
      title={SERVICE_LABELS[sub.service]}
      subtitle={`${formatDate(sub.startDate)} – ${formatDate(sub.endDate)}\n${sub.slot}`}
      right={<Badge status={sub.status} />}
      progress={sub.status === 'active' && sub.plannedVisits ? { done: sub.completedVisits ?? 0, total: sub.plannedVisits } : undefined}
      onPress={() => router.push({ pathname: '/customer/booking/[id]', params: { id: sub.id, kind: 'subscription' } })}
    />
  );
}

/** The customer's visits: previous visits to rate first, then every live plan (tap one for its upcoming visits). */
export default function Bookings() {
  const [showAll, setShowAll] = useState(false);
  const visits = useQuery({ queryKey: ['visits', 'past'], queryFn: visitService.listPast });
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: bookingService.listMySubscriptions });
  const book = () => router.push('/customer/services');
  const refetch = () => Promise.all([visits.refetch(), subs.refetch()]);

  const past = (visits.data ?? []).filter((v) => ENDED_VISIT.includes(v.status) && v.status !== 'cancelled')
    .sort((a, b) => startOf(b).localeCompare(startOf(a)));
  const plans = (subs.data ?? []).filter((s) => LIVE_PLAN.includes(s.status))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const loading = visits.isPending || subs.isPending;
  const nothing = !loading && !past.length && !plans.length;

  // Screen spaces and animates each top-level child, so the two sections stay separate children (no fragment).
  return (
    <Screen back={false} eyebrow="Bookings" title="Your visits" refreshing={visits.isRefetching || subs.isRefetching} onRefresh={refetch}>
      {loading ? <SkeletonList /> : visits.isError && subs.isError ? <ErrorState error={visits.error} onRetry={refetch} /> : nothing ? (
        <EmptyState art="calendar" title="No visits yet" message="Book a free trial and your chef’s visits will show up here."
          action={<Button title="Book a chef" small onPress={book} />} />
      ) : null}

      {!loading && !nothing && past.length > 0 && (
        <Section eyebrow={showAll ? `Previous visits · ${past.length}` : 'Previous visits'} action={past.length > RECENT_COUNT ? (
          <Button title={showAll ? 'Show less' : `See all (${past.length})`} variant="ghost" small onPress={() => setShowAll((s) => !s)} />
        ) : undefined}>
          <PastVisits visits={showAll ? past : past.slice(0, RECENT_COUNT)} />
        </Section>
      )}

      {!loading && !nothing && (
        <Section eyebrow="Your plans">
          {plans.length ? (
            <View style={styles.list}>
              {plans.map((s) => <PlanItem key={s.id} sub={s} />)}
            </View>
          ) : (
            <View style={styles.none}>
              <Ionicons name="calendar-clear-outline" size={22} color={colors.purple} />
              <Txt variant="small" style={{ flex: 1 }}>No active plans right now.</Txt>
              <Button title="Book" small variant="secondary" onPress={book} />
            </View>
          )}
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  none: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border,
  },
});
