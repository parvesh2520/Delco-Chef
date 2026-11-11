import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, QueryView, Screen, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { paymentService } from '../../../src/services';
import { formatCurrency, formatDateTime } from '../../../src/utils';

/** Receipt / payment details. */
export default function PaymentDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['payment', id], queryFn: () => paymentService.get(id) });
  return (
    <Screen eyebrow="Payment" title="Receipt">
      <QueryView query={query} empty={{ title: 'Payment not found' }}>
        {(p) => (
          <>
            <Card tone="cream">
              <Txt variant="label">Amount</Txt>
              <Txt variant="h1">{formatCurrency(p.amount)}</Txt>
              <Badge status={p.status} />
            </Card>
            <Card>
              <InfoRow label="Service" value={SERVICE_LABELS[p.service]} />
              <InfoRow label="Billed to" value={p.customerName} />
              <InfoRow label="Payment ID" value={p.id.toUpperCase()} />
              <InfoRow label="Created" value={formatDateTime(p.createdAt)} />
              <InfoRow label="Paid on" value={p.paidAt ? formatDateTime(p.paidAt) : undefined} />
              <InfoRow label="Method" value={p.method} />
              <InfoRow label="Reference" value={p.reference} />
              <InfoRow label="Attempts" value={p.attempts} />
            </Card>
            {(p.status === 'link_created' || p.status === 'failed' || p.status === 'pending') && (
              <Button title="Complete payment" variant="accent" onPress={() => router.push({ pathname: '/customer/payment/link', params: { id: p.id } })} />
            )}
            <Button title="View subscription" variant="secondary" onPress={() => router.push({ pathname: '/customer/subscriptions/[id]', params: { id: p.subscriptionId } })} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
