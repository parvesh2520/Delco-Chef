import React from 'react';
import { Linking } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Notice, Screen, StatusHero, Txt } from '../../../src/components';
import { paymentService } from '../../../src/services';
import { formatCurrency } from '../../../src/utils';

/** Payment pending — polls the server until the gateway's verified webhook confirms (or fails) the payment. */
export default function PaymentPending() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['payment', id], queryFn: () => paymentService.get(id), refetchInterval: 4000 });
  const status = query.data?.status;
  if (status === 'paid') {
    ['payments', 'subscription', 'subscriptions', 'requests', 'request', 'history'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    return <Redirect href={{ pathname: '/customer/payment/success', params: { id } }} />;
  }
  if (status === 'failed') return <Redirect href={{ pathname: '/customer/payment/failed', params: { id } }} />;
  const p = query.data;
  return (
    <Screen back>
      <StatusHero tone="warning" icon="hourglass-outline" title="Confirming your payment" message="We activate your subscription only after the payment gateway confirms it. This usually takes a few seconds." />
      {p && (
        <Card tone="cream">
          <Txt variant="label">Amount {formatCurrency(p.amount)}</Txt>
          {p.linkUrl ? (
            <Button title="Open payment page" icon="open-outline" onPress={() => Linking.openURL(p.linkUrl)} />
          ) : (
            <Txt variant="small">This link is no longer active. Go back to generate a fresh link.</Txt>
          )}
        </Card>
      )}
      {query.isError && <Notice tone="error">{query.error.message}</Notice>}
    </Screen>
  );
}
