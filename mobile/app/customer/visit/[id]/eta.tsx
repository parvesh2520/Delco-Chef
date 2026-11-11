import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, InfoRow, QueryView, Screen, StatusHero } from '../../../../src/components';
import { visitService } from '../../../../src/services';
import { formatTime } from '../../../../src/utils';

/** Estimated arrival screen. */
export default function Eta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['tracking', id], queryFn: () => visitService.getTracking(id), refetchInterval: 15000 });
  return (
    <Screen eyebrow="Live tracking">
      <QueryView query={query} empty={{ title: 'Visit not found' }}>
        {(t) =>
          t.available && t.etaMinutes !== undefined ? (
            <>
              <StatusHero tone="info" icon="bicycle-outline" title={`Arriving around ${formatTime(new Date(Date.now() + t.etaMinutes * 60000).toISOString())}`} message={`About ${t.etaMinutes} minutes away. Keep your check-in code ready.`} />
              <Card>
                <InfoRow label="Distance" value={t.distanceKm !== undefined ? `${t.distanceKm} km` : undefined} />
                <InfoRow label="Last update" value={formatTime(t.updatedAt)} />
              </Card>
              <Button title="Show check-in code" variant="accent" onPress={() => router.push({ pathname: '/customer/visit/[id]/code', params: { id } })} />
            </>
          ) : (
            <StatusHero tone="neutral" icon="time-outline" title="Arrival time unavailable" message={t.reason}>
              <Button title="Back to visit" variant="secondary" onPress={() => router.back()} />
            </StatusHero>
          )
        }
      </QueryView>
    </Screen>
  );
}
