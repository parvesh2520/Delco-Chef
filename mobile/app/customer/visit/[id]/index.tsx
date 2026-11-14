import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, ChefCard, InfoRow, QueryView, Screen, Txt, VisitSteps, visitStep } from '../../../../src/components';
import { MEAL_LABELS, SERVICE_LABELS } from '../../../../src/constants';
import { visitService } from '../../../../src/services';
import { formatDate } from '../../../../src/utils';

const STOPPED = ['customer_unavailable', 'missed', 'cancelled'];
const ENDED = ['completed', ...STOPPED];

/** Upcoming visit details. */
export default function VisitDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['visit', id], queryFn: () => visitService.get(id) });
  return (
    <Screen eyebrow={query.data?.kind === 'trial' ? 'Free trial' : 'Visit'} title="Visit details" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Visit not found' }}>
        {(v) => (
          <>
            {!STOPPED.includes(v.status) ? (
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ gap: 2 }}>
                    <Txt variant="bodyStrong">{formatDate(v.date)}</Txt>
                    <Txt variant="small">{v.slot}</Txt>
                  </View>
                  <Badge status={v.status} />
                </View>
                <VisitSteps step={visitStep(v.status)} />
              </Card>
            ) : null}
            {v.chef ? (
              <ChefCard chef={v.chef} caption={v.kind === 'trial' ? 'Your trial chef' : 'Your Delco chef'} />
            ) : (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={v.chefName} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3">{v.chefName}</Txt>
                    <Txt variant="small">{v.kind === 'trial' ? 'Free trial' : SERVICE_LABELS[v.service]}</Txt>
                  </View>
                </View>
              </Card>
            )}
            <Card>
              <InfoRow icon="location-outline" label="Where" value={`${v.address.line1}, ${v.address.city}`} />
              <InfoRow icon="restaurant-outline" label="Meals" value={v.meals.map((m) => MEAL_LABELS[m]).join(', ')} />
              <InfoRow icon="people-outline" label="Members" value={v.members} />
            </Card>
            {v.status === 'completed' ? (
              <Button title={v.rating ? 'Visit summary' : 'Rate this visit'} variant={v.rating ? 'primary' : 'accent'} icon={v.rating ? undefined : 'star-outline'}
                onPress={() => router.push({ pathname: '/customer/visit/[id]/completed', params: { id: v.id } })} />
            ) : !ENDED.includes(v.status) ? (
              <>
                <Button title="Show check-in code" variant="accent" icon="key-outline" onPress={() => router.push({ pathname: '/customer/visit/[id]/code', params: { id: v.id } })} />
                <Button title="Track chef" variant="secondary" icon="navigate-outline" onPress={() => router.push({ pathname: '/customer/visit/[id]/track', params: { id: v.id } })} />
              </>
            ) : null}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
