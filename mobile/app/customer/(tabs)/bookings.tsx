import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, BookingCard, Button, QueryView, Screen, Section, Txt } from '../../../src/components';
import { bookingService } from '../../../src/services';
import { colors, fonts } from '../../../src/theme';
import type { BookingSummary } from '../../../src/types';
import { formatCurrency, formatDate } from '../../../src/utils';

const PAST = ['completed', 'cancelled', 'rejected', 'expired', 'closed'];

function BookingItem({ b }: { b: BookingSummary }) {
  const sub = b.kind === 'subscription';
  return (
    <BookingCard
      icon={sub ? 'repeat-outline' : 'albums-outline'}
      tint={sub ? 'orange' : 'plum'}
      title={b.title}
      subtitle={`${sub ? 'Starts' : 'Requested'} ${formatDate(b.date)}`}
      right={
        <View style={styles.right}>
          {!!b.amount && <Txt style={styles.amount}>{formatCurrency(b.amount)}</Txt>}
          <Badge status={b.status} />
        </View>
      }
      onPress={() => router.push({ pathname: '/customer/booking/[id]', params: { id: b.id, kind: b.kind } })}
    />
  );
}

/** Booking history: plans and trial requests, active first. */
export default function Bookings() {
  const query = useQuery({ queryKey: ['history'], queryFn: bookingService.listBookingHistory });
  return (
    <Screen back={false} eyebrow="History" title="Your bookings" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView
        query={query}
        empty={{ title: 'No bookings yet', message: 'Request a free trial to get started.', icon: 'calendar-outline', action: <Button title="Book a chef" small onPress={() => router.push('/customer/services')} /> }}
      >
        {(items) => {
          const active = items.filter((b) => !PAST.includes(b.status));
          const past = items.filter((b) => PAST.includes(b.status));
          return (
            <>
              {active.length > 0 && (
                <Section eyebrow={`Active · ${active.length}`}>
                  <View style={styles.list}>{active.map((b) => <BookingItem key={`${b.kind}-${b.id}`} b={b} />)}</View>
                </Section>
              )}
              {past.length > 0 && (
                <Section eyebrow={`Past · ${past.length}`}>
                  <View style={styles.list}>{past.map((b) => <BookingItem key={`${b.kind}-${b.id}`} b={b} />)}</View>
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
});
