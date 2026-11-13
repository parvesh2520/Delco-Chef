import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, InfoRow, QueryView, RollingNumber, Screen, StatusHero } from '../../../../src/components';
import { visitService } from '../../../../src/services';
import { colors } from '../../../../src/theme';
import { formatTime } from '../../../../src/utils';

/** Estimated arrival screen. */
export default function Eta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['tracking', id], queryFn: () => visitService.getTracking(id), refetchInterval: (q) => (q.state.data?.code === 'TRACKING_ENDED' ? false : 15000), retry: false });
  return (
    <Screen eyebrow="Live tracking">
      <QueryView query={query} empty={{ title: 'Visit not found' }}>
        {(t) =>
          t.available && !t.stale && t.etaMinutes != null ? (
            <>
              <StatusHero tone="info" icon="bicycle-outline" title={t.arriving ? 'Your chef is arriving' : `Arriving around ${formatTime(new Date(Date.now() + t.etaMinutes * 60000).toISOString())}`} message={t.arriving ? 'Keep your check-in code ready.' : 'Approximate. Keep your check-in code ready.'}>
                {!t.arriving && (
                  <RollingNumber value={t.etaMinutes} format={(n) => `${Math.max(0, Math.round(n))} min away`} variant="h2" color={colors.purple} accessibilityLiveRegion="polite" />
                )}
              </StatusHero>
              <Card>
                <InfoRow label="Distance" value={t.distanceKm !== undefined ? `${t.distanceKm} km` : undefined} />
                <InfoRow label="Last update" value={t.updatedAt ? formatTime(t.updatedAt) : undefined} />
              </Card>
              <Button title="Show check-in code" variant="accent" onPress={() => router.push({ pathname: '/customer/visit/[id]/code', params: { id } })} />
            </>
          ) : (
            <StatusHero tone="neutral" icon="time-outline" title="Arrival time unavailable" message={t.stale ? 'Waiting for a fresh location from your chef — we don’t estimate from an old position.' : t.reason ?? undefined}>
              <Button title="Back to visit" variant="secondary" onPress={() => router.back()} />
            </StatusHero>
          )
        }
      </QueryView>
    </Screen>
  );
}
