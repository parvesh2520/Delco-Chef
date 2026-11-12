import React from 'react';
import { Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, Notice, QueryView, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { RefundList } from '../../../src/features/payments';
import { paymentService } from '../../../src/services';
import type { Payment } from '../../../src/types';
import { formatCurrency, formatDate, formatDateTime } from '../../../src/utils';

const RECEIPT_STATUSES = ['paid', 'refunded', 'partially_refunded'];

/** Receipt / payment details (F7). Everything shown comes from the server; refunds show their real gateway status. */
export default function PaymentDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['payment', id], queryFn: () => paymentService.get(id) });
  const hasReceipt = RECEIPT_STATUSES.includes(query.data?.status ?? '');
  const receipt = useQuery({ queryKey: ['payment', id, 'receipt'], queryFn: () => paymentService.getReceipt(id), enabled: hasReceipt });
  return (
    <Screen eyebrow="Payment" title={hasReceipt ? 'Receipt' : 'Payment'} refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Payment not found' }}>
        {(p) => (
          <>
            <Card tone="cream">
              <Txt variant="label">Amount</Txt>
              <Txt variant="h1">{formatCurrency(p.amount)}</Txt>
              <Badge status={p.status} />
            </Card>
            {p.status === 'failed' && (
              <Notice tone="error" icon="close-circle-outline">
                {p.failureReason ? `Your last attempt failed: ${p.failureReason}.` : 'Your last attempt failed.'} You can retry with the same link.
              </Notice>
            )}
            <Card>
              {receipt.data && <InfoRow label="Receipt no." value={receipt.data.receiptNo} />}
              <InfoRow label="Service" value={SERVICE_LABELS[p.service]} />
              <InfoRow label="Billed to" value={p.customerName} />
              {receipt.data && <InfoRow label="Plan period" value={`${formatDate(receipt.data.startDate)} – ${formatDate(receipt.data.endDate)}`} />}
              {receipt.data && <InfoRow label="Visits" value={receipt.data.visits} />}
              <InfoRow label="Created" value={formatDateTime(p.createdAt)} />
              <InfoRow label="Paid on" value={p.paidAt ? formatDateTime(p.paidAt) : undefined} />
              <InfoRow label="Method" value={p.method} />
              <InfoRow label="Reference" value={p.reference} />
              <InfoRow label="Attempts" value={p.attempts} />
              {!!p.refundedAmount && <InfoRow label="Refunded" value={formatCurrency(p.refundedAmount)} />}
            </Card>
            {!!p.refunds?.length && (
              <Section title="Refunds">
                <RefundList refunds={p.refunds} />
              </Section>
            )}
            {(p.status === 'link_created' || p.status === 'failed' || p.status === 'pending') && (
              <Button title={p.status === 'failed' ? 'Retry payment' : 'Complete payment'} variant="accent"
                onPress={() => router.push({ pathname: '/customer/payment/link', params: { id: p.id } })} />
            )}
            {p.status === 'expired' && p.subscriptionStatus === 'pending_payment' && (
              <Button title="Get a new payment link" variant="accent"
                onPress={() => router.push({ pathname: '/customer/payment/link', params: { id: p.id } })} />
            )}
            {receipt.data && (
              <Button title="Share receipt" variant="secondary" icon="share-outline" onPress={() => shareReceipt(p, receipt.data!)} />
            )}
            <Button title="View subscription" variant="ghost" onPress={() => router.push({ pathname: '/customer/subscriptions/[id]', params: { id: p.subscriptionId } })} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}

function shareReceipt(p: Payment, r: { receiptNo: string; startDate: string; endDate: string; visits: number }) {
  const lines = [
    `Delco Chefs receipt ${r.receiptNo}`,
    `${SERVICE_LABELS[p.service]} · ${formatDate(r.startDate)} – ${formatDate(r.endDate)} · ${r.visits} visits`,
    `Amount paid: ${formatCurrency(p.amount)}`,
    p.paidAt ? `Paid on: ${formatDateTime(p.paidAt)}` : '',
    p.reference ? `Payment reference: ${p.reference}` : '',
    p.refundedAmount ? `Refunded: ${formatCurrency(p.refundedAmount)}` : '',
  ].filter(Boolean);
  Share.share({ title: `Receipt ${r.receiptNo}`, message: lines.join('\n') }).catch(() => undefined);
}
