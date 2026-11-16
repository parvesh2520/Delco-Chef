import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Badge, BookingCard, Card, QueryView, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { paymentService } from '../../../src/services';
import { colors, fonts } from '../../../src/theme';
import type { Payment } from '../../../src/types';
import { formatCurrency, formatDate } from '../../../src/utils';

type Icon = keyof typeof Ionicons.glyphMap;
const DUE = ['link_created', 'pending', 'failed'];

const LOOK: Record<string, { icon: Icon; tint: 'green' | 'orange' | 'red' | 'plum' }> = {
  paid: { icon: 'receipt-outline', tint: 'green' },
  link_created: { icon: 'time-outline', tint: 'orange' },
  pending: { icon: 'time-outline', tint: 'orange' },
  failed: { icon: 'alert-circle-outline', tint: 'red' },
  refunded: { icon: 'return-down-back-outline', tint: 'plum' },
  partially_refunded: { icon: 'return-down-back-outline', tint: 'plum' },
  expired: { icon: 'close-circle-outline', tint: 'plum' },
};

function PaymentItem({ p }: { p: Payment }) {
  const look = LOOK[p.status] ?? LOOK.expired;
  const when = p.paidAt ? `Paid ${formatDate(p.paidAt)}` : `Created ${formatDate(p.createdAt)}`;
  return (
    <BookingCard
      icon={look.icon}
      tint={look.tint}
      title={SERVICE_LABELS[p.service]}
      subtitle={p.refundedAmount ? `${when} · ${formatCurrency(p.refundedAmount)} refunded` : when}
      right={
        <View style={styles.right}>
          <Txt style={styles.amount}>{formatCurrency(p.amount)}</Txt>
          <Badge status={p.status} />
        </View>
      }
      onPress={() => router.push({ pathname: '/customer/payment/[id]', params: { id: p.id } })}
    />
  );
}

/** Totals from the server's payment records: what was paid (net of refunds) and what is still due. */
function Summary({ items }: { items: Payment[] }) {
  const paid = items.filter((p) => ['paid', 'partially_refunded', 'refunded'].includes(p.status))
    .reduce((sum, p) => sum + p.amount - (p.refundedAmount ?? 0), 0);
  const due = items.filter((p) => DUE.includes(p.status));
  return (
    <Card tone="plum" style={styles.summary}>
      <Txt variant="eyebrow">Total paid</Txt>
      <Txt style={styles.total} color={colors.textOnDark}>{formatCurrency(paid)}</Txt>
      <View style={styles.summaryFoot}>
        <Txt variant="small" color={colors.accentLight}>{items.length} {items.length === 1 ? 'payment' : 'payments'}</Txt>
        {due.length > 0 && (
          <View style={styles.duePill}>
            <Ionicons name="time-outline" size={14} color={colors.primary} />
            <Txt variant="caption" color={colors.primary} style={{ fontFamily: fonts.medium }}>
              {formatCurrency(due.reduce((s, p) => s + p.amount, 0))} due
            </Txt>
          </View>
        )}
      </View>
    </Card>
  );
}

/** Payment history. */
export default function Payments() {
  const query = useQuery({ queryKey: ['payments'], queryFn: paymentService.listMine });
  return (
    <Screen back={false} eyebrow="Payments" title="Payment history" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'No payments yet', message: 'Payments appear after you subscribe.', icon: 'card-outline' }}>
        {(items) => {
          const due = items.filter((p) => DUE.includes(p.status));
          const rest = items.filter((p) => !DUE.includes(p.status));
          return (
            <>
              <Summary items={items} />
              {due.length > 0 && (
                <Section eyebrow="Needs attention">
                  <View style={styles.list}>{due.map((p) => <PaymentItem key={p.id} p={p} />)}</View>
                </Section>
              )}
              {rest.length > 0 && (
                <Section eyebrow="History">
                  <View style={styles.list}>{rest.map((p) => <PaymentItem key={p.id} p={p} />)}</View>
                </Section>
              )}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  right: { alignItems: 'flex-end', gap: 6 },
  amount: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 22, color: colors.text },
  summary: { gap: 4, padding: 20 },
  total: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 42 },
  summaryFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  duePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
