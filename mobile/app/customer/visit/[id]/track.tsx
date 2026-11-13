import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, LiveMap, Notice, QueryView, Screen, StatusHero, Txt } from '../../../../src/components';
import { visitService } from '../../../../src/services';
import type { TrackingSnapshot } from '../../../../src/types';
import { nextPollMs, phaseOf, type Phase } from '../../../../src/features/tracking/polling';
import { formatTime } from '../../../../src/utils';
import { colors } from '../../../../src/theme';

const LABEL: Record<Phase, { text: string; tone: 'success' | 'info' | 'warning' }> = {
  live: { text: 'Live location', tone: 'success' },
  updating: { text: 'Updating location…', tone: 'info' },
  arriving: { text: 'Your chef is arriving', tone: 'success' },
  waiting: { text: 'Location unavailable', tone: 'warning' },
  stale: { text: 'Reconnecting…', tone: 'warning' },
  interrupted: { text: 'Connection interrupted — reconnecting…', tone: 'warning' },
};

export default function TrackChef() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['tracking', id],
    queryFn: () => visitService.getTracking(id),
    retry: false, // nextPollMs owns the retry schedule
    refetchInterval: (q) => nextPollMs(q.state.data, q.state.fetchFailureCount),
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000); // re-evaluate freshness even if no response arrives
    return () => clearInterval(t);
  }, []);

  if (!query.data) {
    return (
      <Screen eyebrow="Live tracking" title="Track your chef">
        <QueryView query={query} loadingLabel="Finding your chef…" empty={{ title: 'Visit not found' }}>{() => null}</QueryView>
      </Screen>
    );
  }
  const t = query.data;
  return (
    <Screen eyebrow="Live tracking" title="Track your chef" refreshing={query.isRefetching} onRefresh={query.refetch}>
      {t.available && t.destination ? <Live t={t} id={id} phase={phaseOf(t, query.isError, query.dataUpdatedAt, now, query.isFetching)} /> : <Unavailable t={t} id={id} />}
    </Screen>
  );
}

function Live({ t, id, phase }: { t: TrackingSnapshot; id: string; phase: Phase }) {
  const live = phase === 'live' || phase === 'updating' || phase === 'arriving';
  const label = LABEL[phase];
  return (
    <>
      <LiveMap destination={t.destination!} chef={t.chefLocation} stale={!live} fixAt={t.updatedAt} height={320} />
      <Txt variant="small" color={colors.textMuted}>Dashed line shows straight-line distance, not the road route.</Txt>
      <Card tone="plum" onPress={() => router.push({ pathname: '/customer/visit/[id]/eta', params: { id } })}>
        <Txt variant="eyebrow">{phase === 'arriving' ? 'Arriving' : 'Arriving in about'}</Txt>
        <Txt variant="h1" color={colors.textOnDark}>
          {phase === 'arriving' ? 'Any moment' : live && t.etaMinutes != null ? `${t.etaMinutes} min` : '—'}
        </Txt>
        <Txt variant="small" color={colors.accentLight}>
          {live && t.distanceKm != null ? `${t.distanceKm} km away · ` : ''}
          {t.updatedAt ? `${live ? 'updated' : 'last seen'} ${formatTime(t.updatedAt)}` : 'no location yet'}
        </Txt>
        <Txt variant="small" color={colors.accentLight}>Approximate: based on distance and average city travel speed.</Txt>
      </Card>
      <Notice tone={label.tone} icon={live ? 'radio-outline' : 'cloud-offline-outline'}>
        {label.text}
        {phase === 'stale' ? ' Your chef’s last update is more than 30 seconds old. The grey marker is where they were last seen.' : ''}
        {phase === 'interrupted' ? ' We can’t reach Delco right now; the map will update as soon as the connection is back.' : ''}
        {phase === 'waiting' ? ' Your chef is travelling but no position has arrived yet.' : ''}
      </Notice>
      <View style={{ gap: 8 }}>
        <Button title="Show check-in code" variant="secondary" onPress={() => router.push({ pathname: '/customer/visit/[id]/code', params: { id } })} />
      </View>
    </>
  );
}

function Unavailable({ t, id }: { t: TrackingSnapshot; id: string }) {
  const content = {
    TRACKING_NOT_AVAILABLE_YET: { icon: 'time-outline' as const, title: 'Tracking starts 15 minutes before your visit',
      message: t.availableAt ? `You can watch your chef approach from ${formatTime(t.availableAt)}.` : t.reason ?? undefined },
    TRACKING_NOT_STARTED: { icon: 'location-outline' as const, title: 'Your chef hasn’t set off yet',
      message: 'The map appears as soon as your chef starts travelling.' },
    TRACKING_ENDED: { icon: 'checkmark-circle-outline' as const, title: 'Live tracking has ended',
      message: t.reason ?? 'Live tracking has ended for this visit.' },
  }[t.code ?? ''] ?? { icon: 'location-outline' as const, title: 'Tracking unavailable', message: t.reason ?? undefined };
  return (
    <StatusHero tone={t.code === 'TRACKING_ENDED' ? 'success' : 'neutral'} icon={content.icon} title={content.title} message={content.message}>
      <Button title="View visit details" variant="secondary" onPress={() => router.push({ pathname: '/customer/visit/[id]', params: { id } })} />
    </StatusHero>
  );
}
