import React from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Notice, QueryView, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { RefundList } from '../../../src/features/payments';
import { paymentService } from '../../../src/services';
import type { Payment } from '../../../src/types';
import { colors, fonts, radius, shadow, spacing } from '../../../src/theme';
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
            <View style={styles.receipt}>
              <View style={styles.head}>
                <Txt variant="label" color={colors.textSecondary}>{hasReceipt ? 'Amount paid' : 'Amount due'}</Txt>
                <Txt style={styles.amount}>{formatCurrency(p.amount)}</Txt>
                <Badge status={p.status} />
              </View>
              <View style={styles.perf}>
                <View style={[styles.notch, { left: -12 }]} />
                <View style={styles.dash} />
                <View style={[styles.notch, { right: -12 }]} />
              </View>
              <View style={styles.rows}>
                {receipt.data && <Row label="Receipt no." value={receipt.data.receiptNo} />}
                <Row label="Service" value={SERVICE_LABELS[p.service]} />
                <Row label="Billed to" value={p.customerName} />
                {receipt.data && <Row label="Plan period" value={`${formatDate(receipt.data.startDate)} – ${formatDate(receipt.data.endDate)}`} />}
                {receipt.data && <Row label="Visits" value={receipt.data.visits} />}
                <Row label="Created" value={formatDateTime(p.createdAt)} />
                <Row label="Paid on" value={p.paidAt ? formatDateTime(p.paidAt) : undefined} />
                <Row label="Method" value={p.method} />
                <Row label="Reference" value={p.reference} />
                <Row label="Attempts" value={p.attempts} />
                {!!p.refundedAmount && <Row label="Refunded" value={formatCurrency(p.refundedAmount)} strong />}
              </View>
            </View>
            {p.status === 'failed' && (
              <Notice tone="error" icon="close-circle-outline">
                {p.failureReason ? `Your last attempt failed: ${p.failureReason}.` : 'Your last attempt failed.'} You can retry with the same link.
              </Notice>
            )}
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

function Row({ label, value, strong }: { label: string; value?: string | number | null; strong?: boolean }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.row}>
      <Txt variant="small">{label}</Txt>
      <Txt variant={strong ? 'bodyStrong' : 'body'} style={styles.rowValue} numberOfLines={2}>{String(value)}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  receipt: { backgroundColor: colors.card, borderRadius: radius.xl, ...shadow },
  head: { alignItems: 'center', gap: 8, paddingTop: spacing.lg, paddingBottom: spacing.md, paddingHorizontal: 20 },
  amount: { fontFamily: fonts.heading, fontSize: 40, lineHeight: 48, color: colors.text },
  perf: { height: 24, justifyContent: 'center' },
  notch: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: colors.background },
  dash: { marginHorizontal: 20, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border },
  rows: { paddingHorizontal: 20, paddingTop: spacing.sm, paddingBottom: 20, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowValue: { flex: 1, textAlign: 'right' },
});
