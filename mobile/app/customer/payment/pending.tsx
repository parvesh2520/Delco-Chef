import React, { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Notice, Screen, StatusHero, Txt } from '../../../src/components';
import { paymentService } from '../../../src/services';
import type { PaymentStatus } from '../../../src/types';
import { formatCurrency } from '../../../src/utils';

const POLL_MS = 4000;
const POLL_FOR_MS = 10 * 60 * 1000; // stop polling after 10 minutes; the customer can still refresh by hand
const FINAL: PaymentStatus[] = ['paid', 'failed', 'expired', 'refunded', 'partially_refunded'];

/** Payment pending: polls the server until the gateway's verified webhook confirms (or fails) the payment. The app never
 * decides the outcome itself. Polling runs only while this screen is open, stops at a final state or after 10 minutes,
 * and resumes when the app returns to the foreground. */
export default function PaymentPending() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (timedOut) return;
    const t = setTimeout(() => setTimedOut(true), POLL_FOR_MS);
    return () => clearTimeout(t);
  }, [timedOut]);
  const query = useQuery({
    queryKey: ['payment', id],
    queryFn: () => paymentService.get(id),
    refetchOnWindowFocus: 'always',
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return (s && FINAL.includes(s)) || timedOut ? false : POLL_MS;
    },
  });
  const status = query.data?.status;
  if (status === 'paid') {
    ['payments', 'subscription', 'subscriptions', 'requests', 'request', 'history'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    return <Redirect href={{ pathname: '/customer/payment/success', params: { id } }} />;
  }
  if (status === 'failed') return <Redirect href={{ pathname: '/customer/payment/failed', params: { id } }} />;
  const p = query.data;
  const waitedTooLong = timedOut && !!p && !FINAL.includes(p.status);
  const restart = () => {
    setTimedOut(false);
    query.refetch();
  };
  return (
    <Screen back refreshing={query.isRefetching} onRefresh={restart}>
      <StatusHero art="receipt" tone="warning" icon="hourglass-outline" title="Confirming your payment" message="We activate your subscription only after the payment gateway confirms it. This usually takes a few seconds." />
      {waitedTooLong && (
        <Notice tone="warning">
          We haven’t received a confirmation yet. If you paid, it will appear here once the gateway confirms it. Nothing is charged twice.
        </Notice>
      )}
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
      {waitedTooLong && <Button title="Check again" variant="secondary" icon="refresh-outline" onPress={restart} />}
      {p && FINAL.includes(p.status) && (
        <Button title="View payment" variant="secondary" onPress={() => router.replace({ pathname: '/customer/payment/[id]', params: { id: p.id } })} />
      )}
      {query.isError && <Notice tone="error">{query.error.message}</Notice>}
    </Screen>
  );
}
