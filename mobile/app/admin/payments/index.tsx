import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Screen, Section, StatTile } from '../../../src/components';
import { PaymentCard } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { paymentService } from '../../../src/services';
import { formatCurrency } from '../../../src/utils';

/** Payment dashboard. */
export default function PaymentDashboard() {
  const query = useQuery({ queryKey: ['admin', 'payments'], queryFn: paymentService.listAll });
  return (
    <Screen eyebrow="Payments" title="Payment dashboard" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'No payments yet', icon: 'card-outline' }}>
        {(ps) => {
          const sum = (f: (s: string) => boolean) => ps.filter((p) => f(p.status)).reduce((a, p) => a + p.amount, 0);
          const count = (s: string) => ps.filter((p) => p.status === s).length;
          return (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <StatTile label="Collected" value={formatCurrency(sum((s) => s === 'paid'))} icon="checkmark-circle-outline" />
                <StatTile label="Outstanding" value={formatCurrency(sum((s) => s !== 'paid'))} icon="hourglass-outline" highlight />
                <StatTile label="Links active" value={count('link_created') + count('pending')} icon="link-outline" onPress={() => router.push('/admin/payments/links')} />
                <StatTile label="Failed / expired" value={count('failed') + count('expired')} icon="alert-circle-outline" onPress={() => router.push('/admin/payments/links')} />
              </View>
              <Button title="All payment links" variant="secondary" icon="link-outline" onPress={() => router.push('/admin/payments/links')} />
              <Section title="Recent">
                {ps.slice(0, 5).map((p) => <PaymentCard key={p.id} p={p} />)}
              </Section>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
