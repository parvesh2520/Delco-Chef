import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, QueryView, Screen, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { paymentService } from '../../../src/services';
import { formatCurrency, formatDate } from '../../../src/utils';

/** Payment history. */
export default function Payments() {
  const query = useQuery({ queryKey: ['payments'], queryFn: paymentService.listMine });
  return (
    <Screen back={false} eyebrow="Payments" title="Payment history" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'No payments yet', message: 'Payments appear after you subscribe.', icon: 'card-outline' }}>
        {(items) =>
          items.map((p) => (
            <Card key={p.id} onPress={() => router.push({ pathname: '/customer/payment/[id]', params: { id: p.id } })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="h3">{formatCurrency(p.amount)}</Txt>
                <Badge status={p.status} />
              </View>
              <Txt variant="small">{SERVICE_LABELS[p.service]} · {formatDate(p.paidAt ?? p.createdAt)}</Txt>
            </Card>
          ))
        }
      </QueryView>
    </Screen>
  );
}
