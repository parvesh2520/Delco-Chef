import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, QueryView, Screen, Section, StatTile, Txt } from '../../../src/components';
import { chefService } from '../../../src/services';
import { formatCurrency, formatDate } from '../../../src/utils';

/** Earnings (optional feature). Payout amounts come from the backend once available. */
export default function ChefEarnings() {
  const query = useQuery({ queryKey: ['earnings'], queryFn: chefService.getEarnings });
  return (
    <Screen title="Earnings" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query}>
        {(e) => (
          <>
            <Txt variant="eyebrow">— {e.period} —</Txt>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatTile label="Earned" value={formatCurrency(e.total)} icon="wallet-outline" />
              <StatTile label="Visits" value={e.visits} icon="restaurant-outline" />
            </View>
            <StatTile label="Pending payout" value={formatCurrency(e.pendingPayout)} icon="hourglass-outline" highlight />
            <Section title="Recent visits">
              {e.entries.length === 0 ? (
                <Txt variant="small">No completed visits yet.</Txt>
              ) : (
                e.entries.map((x) => (
                  <Card key={x.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Txt variant="bodyStrong">{x.customerName}</Txt>
                      <Txt variant="bodyStrong">{formatCurrency(x.amount)}</Txt>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Txt variant="small">{formatDate(x.date)}</Txt>
                      <Badge status={x.status} />
                    </View>
                  </Card>
                ))
              )}
            </Section>
          </>
        )}
      </QueryView>
    </Screen>
  );
}
