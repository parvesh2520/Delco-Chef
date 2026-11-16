import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Badge, BookingCard, Button, Card, QueryView, Screen, TINTS, Txt, type Tint } from '../../../src/components';
import { BOOKABLE_SERVICES, SERVICE_LABELS } from '../../../src/constants';
import { SERVICE_ICONS } from '../../../src/features/bookings';
import { bookingService, type ServiceEligibility } from '../../../src/services';
import { colors, fonts, radius, spacing } from '../../../src/theme';
import type { Trial } from '../../../src/types';
import { formatDate } from '../../../src/utils';

type Icon = keyof typeof Ionicons.glyphMap;

const TRIAL_LOOK: Record<string, { icon: Icon; tint: Tint }> = {
  completed: { icon: 'checkmark-circle-outline', tint: 'green' },
  scheduled: { icon: 'calendar-outline', tint: 'orange' },
  in_progress: { icon: 'flame-outline', tint: 'accent' },
  pending_assignment: { icon: 'hourglass-outline', tint: 'plum' },
  cancelled: { icon: 'close-circle-outline', tint: 'red' },
};

const STATUS_LABEL: Record<ServiceEligibility['trialStatus'], string> = {
  not_started: 'Not started', trial_in_progress: 'In progress', trial_completed: 'Trial done', trials_used: 'All used',
};

/** Free trials left as a segmented meter: used segments in orange, ones still free in green. */
function TrialMeter({ e }: { e: ServiceEligibility }) {
  const left = Math.max(e.maxTrials - e.trialsUsed, 0);
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.meter}>
        {Array.from({ length: e.maxTrials }, (_, i) => (
          <View key={i} style={[styles.segment, { backgroundColor: i < e.trialsUsed ? colors.accent : colors.successLight }]} />
        ))}
      </View>
      <View style={styles.meterFoot}>
        <Txt variant="caption">{e.trialsUsed} of {e.maxTrials} used</Txt>
        <View style={[styles.leftPill, { backgroundColor: left ? TINTS.green.bg : colors.sand }]}>
          <Ionicons name={left ? 'gift-outline' : 'lock-closed-outline'} size={13} color={left ? colors.success : colors.textMuted} />
          <Txt variant="caption" color={left ? colors.success : colors.textMuted} style={{ fontFamily: fonts.medium }}>
            {left ? `${left} free trial${left === 1 ? '' : 's'} left` : 'No free trials left'}
          </Txt>
        </View>
      </View>
    </View>
  );
}

function TrialItem({ t }: { t: Trial }) {
  const look = TRIAL_LOOK[t.status] ?? TRIAL_LOOK.pending_assignment;
  return (
    <BookingCard
      icon={look.icon}
      tint={look.tint}
      title={`Trial ${t.number}`}
      subtitle={`${t.date ? formatDate(t.date) : 'Date to be set'} · ${t.chefName ?? 'Chef to be assigned'}`}
      right={<Badge status={t.decision ? `decided_${t.decision}` : t.status} label={t.decision ? `Chose ${t.decision.replace('_', ' ')}` : undefined} />}
      onPress={() => router.push({ pathname: '/customer/trials/[id]', params: { id: t.id } })}
    />
  );
}

/** Trial status, grouped per subscription service with its own trial limit. */
export default function Trials() {
  const trials = useQuery({ queryKey: ['trials'], queryFn: bookingService.listMyTrials });
  const elig = useQueries({
    queries: BOOKABLE_SERVICES.map((s) => ({ queryKey: ['eligibility', s], queryFn: () => bookingService.getEligibility(s) })),
  });
  return (
    <Screen eyebrow="Free trials" title="Your trials" subtitle="Try a Delco chef at home before you subscribe" refreshing={trials.isRefetching} onRefresh={trials.refetch}>
      <QueryView query={trials} isEmpty={() => false}>
        {(all) =>
          BOOKABLE_SERVICES.map((service, i) => {
            const list = all.filter((t) => t.service === service).sort((a, b) => a.number - b.number);
            const e = elig[i].data;
            return (
              <View key={service} style={{ gap: 12 }}>
                <Card style={styles.service}>
                  <View style={styles.serviceHead}>
                    <View style={[styles.tile, { backgroundColor: TINTS.orange.bg }]}>
                      <Ionicons name={SERVICE_ICONS[service]} size={22} color={TINTS.orange.fg} />
                    </View>
                    <Txt variant="h3" style={{ flex: 1 }}>{SERVICE_LABELS[service]}</Txt>
                    {e && <Badge label={STATUS_LABEL[e.trialStatus]} tone={e.trialStatus === 'trial_completed' ? 'success' : e.trialStatus === 'trial_in_progress' ? 'info' : 'neutral'} />}
                  </View>
                  {e ? <TrialMeter e={e} /> : <View style={styles.meterPlaceholder} />}
                  {e?.canRequestTrial && (
                    <Button title={list.length ? 'Request another free trial' : 'Request a free trial'} variant="accent" small icon="add"
                      onPress={() => router.push({ pathname: '/customer/services/[service]', params: { service } })} />
                  )}
                </Card>
                {list.map((t) => <TrialItem key={t.id} t={t} />)}
              </View>
            );
          })
        }
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  service: { gap: spacing.md },
  serviceHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  meter: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 8, borderRadius: 4 },
  meterFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leftPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  meterPlaceholder: { height: 34 },
});
