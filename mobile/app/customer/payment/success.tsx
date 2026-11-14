import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, InfoRow, QueryView, Screen, StatusHero } from '../../../src/components';
import { paymentService } from '../../../src/services';
import { formatCurrency, formatDateTime } from '../../../src/utils';

/** Payment success — subscription is now active. */
export default function PaymentSuccess() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['payment', id], queryFn: () => paymentService.get(id) });
  const home = () => {
    if (router.canDismiss()) router.dismissAll();
    router.navigate('/customer/home');
  };
  return (
    <Screen back={false}>
      <QueryView query={query} empty={{ title: 'Payment not found' }}>
        {(p) => (
          <>
            <StatusHero art="receipt" celebrate icon="checkmark-circle" title="Payment successful" message="Your subscription is now active. Your chef will see the schedule right away." />
            <Card>
              <InfoRow label="Amount" value={formatCurrency(p.amount)} />
              <InfoRow label="Paid on" value={p.paidAt ? formatDateTime(p.paidAt) : undefined} />
              <InfoRow label="Reference" value={p.reference} />
            </Card>
            <Button title="View subscription" onPress={() => router.replace({ pathname: '/customer/subscriptions/[id]', params: { id: p.subscriptionId } })} />
            <Button title="Back to home" variant="ghost" onPress={home} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
