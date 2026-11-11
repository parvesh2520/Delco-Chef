import React from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, ListGroup, ListRow, QueryView, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { RequirementsCard } from '../../../src/features/bookings';
import { bookingService } from '../../../src/services';
import { formatDate } from '../../../src/utils';

/** Booking details. Subscriptions route to their own detail screen. */
export default function BookingDetails() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: 'request' | 'subscription' }>();
  if (kind === 'subscription') return <Redirect href={{ pathname: '/customer/subscriptions/[id]', params: { id } }} />;
  return <RequestDetails id={id} />;
}

function RequestDetails({ id }: { id: string }) {
  const query = useQuery({ queryKey: ['request', id], queryFn: () => bookingService.getRequest(id) });
  return (
    <Screen eyebrow="Booking" title="Booking details">
      <QueryView query={query} empty={{ title: 'Booking not found' }}>
        {(r) => (
          <>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="h3">{SERVICE_LABELS[r.service]}</Txt>
                <Badge status={r.status} />
              </View>
              <InfoRow label="Requested" value={formatDate(r.createdAt)} />
              <InfoRow label="Chef" value={r.assignedChefName ?? 'Not yet assigned'} />
              <InfoRow label="Address" value={`${r.address.label} · ${r.address.line1}`} />
            </Card>
            <Section title="Trials">
              <ListGroup>
                {r.trials.map((t) => (
                  <ListRow key={t.id} icon="restaurant-outline" title={`Trial ${t.number} · ${formatDate(t.date)}`} subtitle={t.chefName} right={<Badge status={t.status} />} onPress={() => router.push({ pathname: '/customer/trials/[id]', params: { id: t.id } })} />
                ))}
              </ListGroup>
            </Section>
            <Section title="Requirements">
              <RequirementsCard r={r.requirements} />
            </Section>
            {r.subscriptionId && <Button title="View subscription" onPress={() => router.push({ pathname: '/customer/subscriptions/[id]', params: { id: r.subscriptionId! } })} />}
            {r.isOpen && <Button title="Track request status" variant="secondary" onPress={() => router.push({ pathname: '/customer/trials/request/[id]', params: { id: r.id } })} />}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
