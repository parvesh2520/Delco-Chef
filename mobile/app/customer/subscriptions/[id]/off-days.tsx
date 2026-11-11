import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Calendar, Notice, QueryView, Screen, Txt } from '../../../../src/components';
import { bookingService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import type { Subscription } from '../../../../src/types';

/** Customer off-day calendar. */
export default function OffDays() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['subscription', id], queryFn: () => bookingService.getSubscription(id) });
  if (query.data) return <OffDayEditor sub={query.data} />;
  return (
    <Screen title="Off-days">
      <QueryView query={query} empty={{ title: 'Subscription not found' }}>
        {() => null}
      </QueryView>
    </Screen>
  );
}

function OffDayEditor({ sub }: { sub: Subscription }) {
  const qc = useQueryClient();
  const [days, setDays] = useState<string[]>(sub.offDays);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(sub.startDate);
  const min = start > tomorrow ? start : tomorrow;
  const save = useMutation({
    mutationFn: () => bookingService.saveOffDays(sub.id, days),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription', sub.id] });
      useToast.getState().show('Off-days updated');
      router.back();
    },
  });
  const toggle = (k: string) => setDays((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));
  return (
    <Screen eyebrow="Subscription" title="Off-days" subtitle="Tap days when you don’t need the chef." footer={<Button title="Save off-days" loading={save.isPending} onPress={() => save.mutate()} />}>
      <Calendar selected={days} onToggle={toggle} minDate={min} maxDate={new Date(sub.endDate)} />
      <Txt variant="small">{days.length} off-day(s) selected</Txt>
      <Notice>Off-days can be marked from tomorrow onwards. Your chef is notified automatically.</Notice>
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
    </Screen>
  );
}
