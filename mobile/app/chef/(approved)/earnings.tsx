import React from 'react';
import { Linking, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, QueryView, Screen, Section, StatTile, Txt } from '../../../src/components';
import { chefService } from '../../../src/services';
import { formatCurrency, formatDate, humanize } from '../../../src/utils';

/** G4: this week's earnings, every booking with its pay status, and a CSV statement. */
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
              <StatTile label="Paid visits" value={e.visits} icon="restaurant-outline" />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatTile label="Held for review" value={formatCurrency(e.heldAmount)} icon="time-outline" />
              <StatTile label="Pending payout" value={formatCurrency(e.pendingPayout)} icon="hourglass-outline" highlight />
            </View>
            <Button
              title="Download statement (CSV)"
              icon="download-outline"
              variant="secondary"
              onPress={async () => Linking.openURL((await query.refetch()).data?.statementUrl ?? e.statementUrl)}
            />
            <Section title="This week's bookings">
              {e.entries.length === 0 ? (
                <Txt variant="small">No bookings this week yet.</Txt>
              ) : (
                e.entries.map((x) => (
                  <Card key={x.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Txt variant="bodyStrong">{x.customerName}</Txt>
                      <Txt variant="bodyStrong">{formatCurrency(x.amount)}</Txt>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Txt variant="small">{formatDate(x.date)} · {humanize(x.kind)}</Txt>
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
