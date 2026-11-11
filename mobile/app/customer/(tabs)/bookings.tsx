import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, QueryView, Screen, Txt } from '../../../src/components';
import { bookingService } from '../../../src/services';
import { formatCurrency, formatDate } from '../../../src/utils';

/** Booking history: requests and subscriptions. */
export default function Bookings() {
  const query = useQuery({ queryKey: ['history'], queryFn: bookingService.listBookingHistory });
  return (
    <Screen back={false} eyebrow="History" title="Your bookings" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView
        query={query}
        empty={{ title: 'No bookings yet', message: 'Request a free trial to get started.', icon: 'calendar-outline', action: <Button title="Book a Chef" small onPress={() => router.push('/customer/services')} /> }}
      >
        {(items) =>
          items.map((b) => (
            <Card key={`${b.kind}-${b.id}`} onPress={() => router.push({ pathname: '/customer/booking/[id]', params: { id: b.id, kind: b.kind } })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Txt variant="h3" style={{ flex: 1 }}>{b.title}</Txt>
                <Badge status={b.status} />
              </View>
              <Txt variant="small">{formatDate(b.date)}{b.amount ? ` · ${formatCurrency(b.amount)}` : ''}</Txt>
            </Card>
          ))
        }
      </QueryView>
    </Screen>
  );
}
