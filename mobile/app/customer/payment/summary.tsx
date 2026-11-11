import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card, InfoRow, Notice, QueryView, Screen, Txt } from '../../../src/components';
import { MEAL_LABELS, SERVICE_LABELS } from '../../../src/constants';
import { bookingService, paymentService } from '../../../src/services';
import { colors } from '../../../src/theme';
import { formatCurrency, formatDate } from '../../../src/utils';

/** Payment summary before generating a payment link. */
export default function PaymentSummary() {
  const { subscriptionId } = useLocalSearchParams<{ subscriptionId: string }>();
  const query = useQuery({ queryKey: ['subscription', subscriptionId], queryFn: () => bookingService.getSubscription(subscriptionId) });
  const create = useMutation({
    mutationFn: () => paymentService.createLink(subscriptionId),
    onSuccess: (p) => router.replace({ pathname: '/customer/payment/link', params: { id: p.id } }),
  });
  const paid = query.data?.status !== 'pending_payment';
  return (
    <Screen
      eyebrow="Payment"
      title="Payment summary"
      footer={query.data && !paid ? <Button title="Generate payment link" variant="accent" icon="link-outline" loading={create.isPending} onPress={() => create.mutate()} /> : undefined}
    >
      <QueryView query={query} empty={{ title: 'Subscription not found' }}>
        {(s) => (
          <>
            <Card>
              <Txt variant="h3">{SERVICE_LABELS[s.service]}</Txt>
              <InfoRow label="Chef" value={s.chefName} />
              <InfoRow label="Period" value={`${formatDate(s.startDate)} – ${formatDate(s.endDate)}`} />
              <InfoRow label="Slot" value={s.slot} />
              <InfoRow label="Meals" value={s.meals.map((m) => MEAL_LABELS[m]).join(', ')} />
              <InfoRow label="Members" value={s.members} />
            </Card>
            <Card tone="cream">
              <InfoRow label="Plan amount" value={formatCurrency(s.amount)} />
              <InfoRow label="Free trials" value={formatCurrency(0)} />
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="h3">Total payable</Txt>
                <Txt variant="h2">{formatCurrency(s.amount)}</Txt>
              </View>
            </Card>
            {paid ? (
              <Button title="View subscription" onPress={() => router.replace({ pathname: '/customer/subscriptions/[id]', params: { id: s.id } })} />
            ) : (
              <Notice icon="shield-checkmark-outline">Your subscription becomes active only after payment succeeds. We’ll generate a secure payment link.</Notice>
            )}
            {create.isError && <Notice tone="error">{create.error.message}</Notice>}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
