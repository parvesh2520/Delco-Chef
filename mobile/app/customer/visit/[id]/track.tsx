import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, MapPreview, MockTag, QueryView, Screen, StatusHero, Txt } from '../../../../src/components';
import { visitService } from '../../../../src/services';
import { formatTime } from '../../../../src/utils';
import { colors } from '../../../../src/theme';

/** Live chef tracking map (refreshes every 15s) and tracking-unavailable state. */
export default function TrackChef() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['tracking', id], queryFn: () => visitService.getTracking(id), refetchInterval: 15000 });
  return (
    <Screen eyebrow="Live tracking" title="Track your chef" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Visit not found' }}>
        {(t) =>
          t.available ? (
            <>
              <MapPreview destination={t.destination} chef={t.chefLocation} height={320} label="Chef location relative to your home" />
              <Card tone="plum" onPress={() => router.push({ pathname: '/customer/visit/[id]/eta', params: { id } })}>
                <Txt variant="eyebrow">Arriving in</Txt>
                <Txt variant="h1" color={colors.textOnDark}>{t.etaMinutes} min</Txt>
                <Txt variant="small" color={colors.accentLight}>{t.distanceKm} km away · updated {formatTime(t.updatedAt)}</Txt>
              </Card>
              <View style={{ gap: 8 }}>
                <Button title="Estimated arrival" variant="secondary" onPress={() => router.push({ pathname: '/customer/visit/[id]/eta', params: { id } })} />
                <Button title="Show check-in code" variant="ghost" onPress={() => router.push({ pathname: '/customer/visit/[id]/code', params: { id } })} />
              </View>
              <MockTag>Simulated location — live GPS pending</MockTag>
            </>
          ) : (
            <StatusHero tone="neutral" icon="location-outline" title="Tracking unavailable" message={t.reason ?? 'Live tracking isn’t available right now.'}>
              <Txt variant="small" center>Tracking starts when your chef begins travelling.</Txt>
              <Button title="View visit details" variant="secondary" onPress={() => router.push({ pathname: '/customer/visit/[id]', params: { id } })} />
            </StatusHero>
          )
        }
      </QueryView>
    </Screen>
  );
}
