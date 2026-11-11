import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Notice, Screen, Section, StatusHero, TextField } from '../../../../../src/components';
import { useChefId } from '../../../../../src/features/chef';
import { visitService } from '../../../../../src/services';
import { useToast } from '../../../../../src/store';

const STEPS = ['Rang the doorbell / knocked', 'Called the customer', 'Waited at least 10 minutes'] as const;

/** Customer unavailable: record what was tried and report to Ops. */
export default function ChefCustomerUnavailable() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chefId = useChefId();
  const qc = useQueryClient();
  const [tried, setTried] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const valid = tried.length === STEPS.length && note.trim().length >= 5;
  const report = useMutation({
    mutationFn: () => visitService.markCustomerUnavailable(id, `${tried.join('; ')}. ${note.trim()}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit', id] });
      qc.invalidateQueries({ queryKey: ['chefVisits', chefId] });
      useToast.getState().show('Reported to Ops');
      if (router.canDismiss()) router.dismissAll();
      router.replace('/chef/home');
    },
  });
  return (
    <Screen footer={<Button title="Report customer unavailable" variant="danger" disabled={!valid} loading={report.isPending} onPress={() => report.mutate()} />}>
      <StatusHero tone="warning" icon="person-remove-outline" title="Customer unavailable?" message="Before reporting, please make sure you’ve tried to reach the customer." />
      <Section title="What you tried">
        {STEPS.map((s) => (
          <Checkbox key={s} label={s} checked={tried.includes(s)} onChange={(on) => setTried((t) => (on ? [...t, s] : t.filter((x) => x !== s)))} />
        ))}
      </Section>
      <TextField label="Note for Ops" multiline value={note} onChangeText={setNote} placeholder="e.g. Gate locked, guard says family is out of town" />
      <Notice>Ops will contact the customer and decide whether the visit counts.</Notice>
      {report.isError && <Notice tone="error">{report.error.message}</Notice>}
    </Screen>
  );
}
