import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, ListGroup, ListRow, Notice, QueryView, Screen } from '../../../../src/components';
import { MEAL_LABELS, SERVICE_LABELS } from '../../../../src/constants';
import { bookingService } from '../../../../src/services';
import { formatCurrency, formatDate } from '../../../../src/utils';

/** Subscription details. Active only after successful payment. */
export default function SubscriptionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['subscription', id], queryFn: () => bookingService.getSubscription(id) });
  return (
    <Screen eyebrow="Subscription" title="Your plan" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Subscription not found' }}>
        {(s) => (
          <>
            <Card>
              <Badge status={s.status} />
              <InfoRow label="Service" value={SERVICE_LABELS[s.service]} />
              <InfoRow label="Chef" value={s.chefName} />
              <InfoRow label="Period" value={`${formatDate(s.startDate)} – ${formatDate(s.endDate)}`} />
              <InfoRow label="Slot" value={s.slot} />
              <InfoRow label="Meals" value={s.meals.map((m) => MEAL_LABELS[m]).join(', ')} />
              <InfoRow label="Members" value={s.members} />
              <InfoRow label="Amount" value={formatCurrency(s.amount)} />
              <InfoRow label="Off-days" value={s.offDays.length} />
            </Card>
            {s.status === 'pending_payment' ? (
              <>
                <Notice tone="warning" icon="card-outline">Complete payment to activate your subscription. Visits are scheduled only after payment succeeds.</Notice>
                <Button title="Complete payment" variant="accent" onPress={() => router.push({ pathname: '/customer/payment/summary', params: { subscriptionId: s.id } })} />
              </>
            ) : (
              <ListGroup>
                <ListRow icon="list-outline" title="Service schedule" onPress={() => router.push({ pathname: '/customer/subscriptions/[id]/schedule', params: { id: s.id } })} />
                <ListRow icon="calendar-clear-outline" title="Mark off-days" subtitle="Skip days you don’t need the chef" onPress={() => router.push({ pathname: '/customer/subscriptions/[id]/off-days', params: { id: s.id } })} />
                {s.paymentId && <ListRow icon="receipt-outline" title="Payment receipt" onPress={() => router.push({ pathname: '/customer/payment/[id]', params: { id: s.paymentId! } })} />}
              </ListGroup>
            )}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
