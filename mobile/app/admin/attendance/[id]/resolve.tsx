import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, ChipGroup, Notice, Screen, TextField, Txt } from '../../../../src/components';
import { useAdminInvalidate } from '../../../../src/features/admin';
import { adminService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import { colors } from '../../../../src/theme';

const OUTCOMES = ['Approved as valid visit', 'Marked as late', 'Payout deducted', 'Escalated to chef manager'];

export default function ResolveAttendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [outcome, setOutcome] = useState<string>();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const invalidate = useAdminInvalidate();
  const valid = !!outcome && note.trim().length >= 5;
  const resolve = useMutation({
    mutationFn: () => adminService.resolveAttendance(id, `${outcome}: ${note.trim()}`),
    onSuccess: async () => {
      await invalidate();
      useToast.getState().show('Exception resolved');
      router.back();
    },
  });
  return (
    <Screen
      title="Resolve exception"
      footer={<Button title="Resolve" loading={resolve.isPending} onPress={() => (setTouched(true), valid && resolve.mutate())} />}
    >
      <Txt variant="label">Outcome</Txt>
      <ChipGroup options={OUTCOMES} value={outcome} onChange={(v) => setOutcome(v as string)} />
      {touched && !outcome && <Txt variant="caption" color={colors.error}>Choose an outcome</Txt>}
      <TextField label="Resolution note" value={note} onChangeText={setNote} multiline placeholder="What happened and how it was verified" error={touched && note.trim().length < 5 ? 'Enter at least 5 characters' : undefined} />
      {resolve.isError && <Notice tone="error">{resolve.error.message}</Notice>}
    </Screen>
  );
}
