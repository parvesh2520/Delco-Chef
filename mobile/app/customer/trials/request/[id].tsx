import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, ListGroup, ListRow, Notice, QueryView, Screen, Section, Txt } from '../../../../src/components';
import { SERVICE_LABELS } from '../../../../src/constants';
import { RequestTimeline, RequirementsCard } from '../../../../src/features/bookings';
import { bookingService } from '../../../../src/services';
import { formatDate } from '../../../../src/utils';

/** Trial request status. */
export default function TrialRequestStatus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['request', id], queryFn: () => bookingService.getRequest(id) });
  return (
    <Screen eyebrow="Trial request" title="Request status" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Request not found' }}>
        {(r) => {
          const undecided = r.trials.find((t) => t.status === 'completed' && !t.decision);
          return (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="h2">{SERVICE_LABELS[r.service]}</Txt>
                <Badge status={r.status} />
              </View>
              <RequestTimeline request={r} />
              {r.status === 'pending_assignment' && <Notice icon="people-outline">Delco’s team is assigning a verified chef near you. We’ll notify you once your trial is scheduled.</Notice>}
              {undecided && (
                <Button title={`Decide after trial ${undecided.number}`} variant="accent" onPress={() => router.push({ pathname: '/customer/trials/[id]/decision', params: { id: undecided.id } })} />
              )}
              {r.status === 'awaiting_payment' && r.subscriptionId && (
                <Button title="Complete payment" variant="accent" onPress={() => router.push({ pathname: '/customer/payment/summary', params: { subscriptionId: r.subscriptionId! } })} />
              )}
              <Section title="Trials">
                <ListGroup>
                  {r.trials.map((t) => (
                    <ListRow key={t.id} icon="restaurant-outline" title={`Trial ${t.number} · ${formatDate(t.date)}`} subtitle={t.chefName ?? 'Chef to be assigned'} right={<Badge status={t.status} />} onPress={() => router.push({ pathname: '/customer/trials/[id]', params: { id: t.id } })} />
                  ))}
                </ListGroup>
              </Section>
              <Section title="Your requirements">
                <RequirementsCard r={r.requirements} />
              </Section>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
