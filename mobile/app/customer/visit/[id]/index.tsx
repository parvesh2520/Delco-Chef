import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, InfoRow, QueryView, Screen, Txt } from '../../../../src/components';
import { MEAL_LABELS, SERVICE_LABELS } from '../../../../src/constants';
import { visitService } from '../../../../src/services';
import { View } from 'react-native';
import { formatDateTime } from '../../../../src/utils';

/** Upcoming visit details. */
export default function VisitDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['visit', id], queryFn: () => visitService.get(id) });
  return (
    <Screen eyebrow="Visit" title="Visit details" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Visit not found' }}>
        {(v) => (
          <>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={v.chefName} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3">{v.chefName}</Txt>
                  <Txt variant="small">Your Delco chef · {v.kind === 'trial' ? 'Free trial' : SERVICE_LABELS[v.service]}</Txt>
                </View>
                <Badge status={v.status} />
              </View>
            </Card>
            <Card>
              <InfoRow icon="calendar-outline" label="When" value={`${formatDateTime(v.date)} (${v.slot})`} />
              <InfoRow icon="location-outline" label="Where" value={`${v.address.line1}, ${v.address.city}`} />
              <InfoRow icon="restaurant-outline" label="Meals" value={v.meals.map((m) => MEAL_LABELS[m]).join(', ')} />
              <InfoRow icon="people-outline" label="Members" value={v.members} />
            </Card>
            {v.status === 'completed' ? (
              <Button title="Visit summary" onPress={() => router.push({ pathname: '/customer/visit/[id]/completed', params: { id: v.id } })} />
            ) : (
              <>
                <Button title="Show check-in code" variant="accent" icon="key-outline" onPress={() => router.push({ pathname: '/customer/visit/[id]/code', params: { id: v.id } })} />
                <Button title="Track chef" variant="secondary" icon="navigate-outline" onPress={() => router.push({ pathname: '/customer/visit/[id]/track', params: { id: v.id } })} />
              </>
            )}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
