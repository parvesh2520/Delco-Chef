import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, InfoRow, ListGroup, ListRow, Notice, QueryView, Screen, Segmented, Txt } from '../../../../src/components';
import { bookingService, type ScheduleDay, type ScheduleVisit } from '../../../../src/services';
import { colors } from '../../../../src/theme';
import { formatDate, formatTime, toDateKey, type Tone } from '../../../../src/utils';

/** What each real visit status means to the customer. Never claims a chef the server hasn't assigned. */
const VISIT_STATUS: Record<string, { label: string; tone: Tone; waiting?: boolean }> = {
  scheduled: { label: 'Chef assigned', tone: 'info' },
  chef_travelling: { label: 'Chef on the way', tone: 'info' },
  checked_in: { label: 'Cooking', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  missed: { label: 'Missed by Delco', tone: 'error' },
  pending_assignment: { label: 'Waiting for a chef', tone: 'warning', waiting: true },
  needs_manual_assignment: { label: 'Delco is arranging a chef', tone: 'warning', waiting: true },
};

const DAY_KIND: Record<ScheduleDay['kind'], string> = {
  service: '', off: 'Your off-day', missed: 'Missed: your plan was extended', extension: 'Extra day for a missed visit', removed: 'No longer in your plan',
};

type Filter = 'upcoming' | 'past' | 'all';

/** C7: the plan's real schedule from the server (service dates, visits and their status, off / missed / extension days). */
export default function ScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['schedule', id], queryFn: () => bookingService.getSchedule(id) });
  const [filter, setFilter] = useState<Filter>('upcoming');
  const today = toDateKey(new Date());  // the phone's local (IST) date, like the server's service dates
  return (
    <Screen eyebrow="Subscription" title="Service schedule" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Schedule not found' }}>
        {(s) => {
          const days = s.days.filter((d) => (filter === 'all' ? true : filter === 'upcoming' ? d.date >= today : d.date < today));
          const waiting = s.days.filter((d) => d.date >= today && d.visits.some((v) => VISIT_STATUS[v.status]?.waiting)).length;
          const built = s.days.some((d) => d.visits.length > 0);
          return (
            <>
              <Card tone="cream">
                <Txt variant="h3">{s.visits} visit{s.visits === 1 ? '' : 's'} · ends {formatDate(s.endDate)}</Txt>
                {s.freeOffDaysLeft !== null && <InfoRow label="Free off-days left" value={s.freeOffDaysLeft} />}
                {s.forfeitedGuaranteedDays > 0 && <InfoRow label="Guaranteed days used as off-days" value={s.forfeitedGuaranteedDays} />}
                {s.extensionDays.length > 0 && <InfoRow label="Days added for missed visits" value={s.extensionDays.length} />}
              </Card>
              {!built && <Notice>Your visits are created once your payment is confirmed. The dates below are your plan.</Notice>}
              {waiting > 0 && (
                <Notice tone="warning" icon="hourglass-outline">
                  {waiting} upcoming day{waiting === 1 ? ' is' : 's are'} waiting for Delco to assign a chef. We’ll notify you when it’s confirmed.
                </Notice>
              )}
              <Segmented<Filter>
                options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]}
                value={filter}
                onChange={setFilter}
              />
              {days.length === 0 ? (
                <Txt variant="small" center>{filter === 'past' ? 'No past days yet.' : 'No upcoming days.'}</Txt>
              ) : (
                <ListGroup>
                  {days.map((d) => (
                    <DayRow key={d.date} d={d} />
                  ))}
                </ListGroup>
              )}
              <ListGroup>
                <ListRow icon="calendar-clear-outline" title="Manage off-days" onPress={() => router.push({ pathname: '/customer/subscriptions/[id]/off-days', params: { id } })} />
              </ListGroup>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function DayRow({ d }: { d: ScheduleDay }) {
  const title = `${d.weekday}, ${formatDate(d.date)}`;
  const note = DAY_KIND[d.kind];
  if (!d.visits.length) {
    return <ListRow icon="calendar-outline" title={title} subtitle={note || 'Visit not created yet'} />;
  }
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}>
      <Txt variant="bodyStrong">{title}</Txt>
      {!!note && <Txt variant="caption" color={d.kind === 'missed' ? colors.error : colors.textSecondary}>{note}</Txt>}
      {d.visits.map((v) => (
        <VisitLine key={v.id} v={v} />
      ))}
    </View>
  );
}

function VisitLine({ v }: { v: ScheduleVisit }) {
  const st = VISIT_STATUS[v.status] ?? { label: v.status, tone: 'neutral' as Tone };
  const who = st.waiting ? 'No chef assigned yet' : v.chefName ?? (v.status === 'cancelled' || v.status === 'missed' ? '' : 'No chef assigned yet');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Txt variant="small" style={{ width: 64 }}>{formatTime(v.startsAt)}</Txt>
      <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>{who}</Txt>
      <Badge label={st.label} tone={st.tone} />
    </View>
  );
}
