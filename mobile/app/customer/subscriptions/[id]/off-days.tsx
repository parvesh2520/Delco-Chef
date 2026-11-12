import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Calendar, Card, InfoRow, Notice, QueryView, Screen, Txt } from '../../../../src/components';
import { bookingService, type Schedule } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import { colors, spacing } from '../../../../src/theme';
import type { Subscription } from '../../../../src/types';
import { isNetworkError } from '../../../../src/utils';

/** C8: customer off-day calendar, with the free-days counter for monthly plans. The assigned chef is told on save. */
export default function OffDays() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['subscription', id], queryFn: () => bookingService.getSubscription(id) });
  const schedule = useQuery({ queryKey: ['schedule', id], queryFn: () => bookingService.getSchedule(id) });
  if (query.data && schedule.data) return <OffDayEditor sub={query.data} schedule={schedule.data} />;
  return (
    <Screen title="Off-days">
      {!query.data ? (
        <QueryView query={query} empty={{ title: 'Subscription not found' }}>{() => null}</QueryView>
      ) : (
        <QueryView query={schedule} empty={{ title: 'Schedule not found' }}>{() => null}</QueryView>
      )}
    </Screen>
  );
}

function OffDayEditor({ sub, schedule }: { sub: Subscription; schedule: Schedule }) {
  const qc = useQueryClient();
  const [days, setDays] = useState<string[]>(sub.offDays);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(sub.startDate);
  const min = start > tomorrow ? start : tomorrow;
  const monthly = schedule.freeOffDaysLeft !== null;

  // Only dates that are actual scheduled service days (or current off-days) can be selected.
  const serviceable = useMemo(
    () => Array.from(new Set([...schedule.serviceDates, ...schedule.offDays])),
    [schedule.serviceDates, schedule.offDays]
  );

  // The plan's flexible-day allowance, recovered from the server's own numbers (free left + used − forfeited).
  const flexible = monthly ? schedule.offDays.length + (schedule.freeOffDaysLeft ?? 0) - schedule.forfeitedGuaranteedDays : 0;
  const freeLeft = Math.max(0, flexible - days.length);
  const forfeits = Math.max(0, days.length - flexible);
  const changed = days.length !== sub.offDays.length || days.some((d) => !sub.offDays.includes(d));
  const save = useMutation({
    mutationFn: () => bookingService.saveOffDays(sub.id, days),
    onSuccess: () => {
      ['subscription', 'subscriptions', 'schedule'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      useToast.getState().show('Off-days updated. Your chef has been told.');
      router.back();
    },
  });
  const toggle = (k: string) => setDays((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));
  return (
    <Screen
      eyebrow="Subscription"
      title="Off-days"
      subtitle="Tap scheduled service days when you don’t need the chef."
      footer={<Button title="Save off-days" loading={save.isPending} disabled={!changed} onPress={() => !save.isPending && save.mutate()} />}
    >
      <Calendar
        selected={days}
        onToggle={toggle}
        minDate={min}
        maxDate={new Date(schedule.endDate)}
        allowedDates={serviceable}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginVertical: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.purple }} />
          <Txt variant="caption">Service day</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent }} />
          <Txt variant="caption">Off-day</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted, opacity: 0.4 }} />
          <Txt variant="caption">No service</Txt>
        </View>
      </View>

      {sub.service === 'custom_time' && (
        <Notice icon="information-circle-outline">
          In your Custom Time plan, only days with scheduled chef visits are selectable. Days not selected during booking have no visits scheduled.
        </Notice>
      )}

      {monthly ? (
        <Card tone={forfeits ? 'accent' : 'cream'}>
          <InfoRow label="Off-days selected" value={days.length} />
          <InfoRow label="Free off-days left" value={freeLeft} />
          {forfeits > 0 && <InfoRow label="Guaranteed days used" value={forfeits} />}
        </Card>
      ) : (
        <Txt variant="small">{days.length} off-day(s) selected</Txt>
      )}
      {monthly ? (
        <Notice tone={forfeits ? 'warning' : 'info'}>
          The first {flexible} off-days in a cycle are free. Each one after that uses up a guaranteed day, with no extension or refund.
        </Notice>
      ) : (
        <Notice>An off-day removes that visit, with no refund and no extension.</Notice>
      )}
      <Notice>Off-days can be marked from tomorrow onwards. Your chef is notified automatically.</Notice>
      {save.isError && <Notice tone="error">{isNetworkError(save.error) ? 'You’re offline. Nothing was saved.' : save.error.message}</Notice>}
    </Screen>
  );
}
