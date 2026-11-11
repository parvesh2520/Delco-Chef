import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, ListGroup, ListRow, QueryView, Screen, Txt } from '../../../../src/components';
import { bookingService } from '../../../../src/services';
import type { Subscription } from '../../../../src/types';
import { toDateKey } from '../../../../src/utils';

function scheduleDays(s: Subscription) {
  const days: { key: string; date: Date }[] = [];
  const end = new Date(s.endDate);
  for (let d = new Date(s.startDate); d <= end; d.setDate(d.getDate() + 1)) {
    const key = toDateKey(d);
    if (!s.offDays.includes(key)) days.push({ key, date: new Date(d) });
  }
  return days;
}

/** Subscription service schedule (excludes off-days). */
export default function Schedule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['subscription', id], queryFn: () => bookingService.getSubscription(id) });
  const today = toDateKey(new Date());
  return (
    <Screen eyebrow="Subscription" title="Service schedule">
      <QueryView query={query} empty={{ title: 'Subscription not found' }}>
        {(s) => {
          const days = scheduleDays(s);
          return (
            <>
              <Card tone="cream">
                <Txt variant="h3">{days.length} service days · {s.slot}</Txt>
                <Txt variant="small">{s.offDays.length} off-day(s) excluded</Txt>
              </Card>
              <ListGroup>
                {days.map(({ key, date }) => (
                  <ListRow
                    key={key}
                    icon="restaurant-outline"
                    title={date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    subtitle={s.chefName}
                    right={<Badge status={key < today ? 'completed' : key === today ? 'scheduled' : 'upcoming'} label={key < today ? 'Done' : key === today ? 'Today' : 'Upcoming'} />}
                  />
                ))}
              </ListGroup>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
