import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, ConfirmDialog, Notice, QueryView, Screen, Segmented, TextField, Txt } from '../../../../src/components';
import { useAdminInvalidate } from '../../../../src/features/admin';
import { adminService } from '../../../../src/services';
import { isNetworkError } from '../../../../src/utils';
import { useToast } from '../../../../src/store';

type Decision = 'approve' | 'reject';

/** D5: approve (optionally correcting worked minutes) or reject with a reason. The server records who, when and why. */
export default function ResolveAttendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useQuery({ queryKey: ['admin', 'attendance', id], queryFn: () => adminService.getAttendance(id) });
  return (
    <Screen title="Review attendance">
      <QueryView query={record} empty={{ title: 'Record not found' }}>
        {(a) => <ReviewForm id={id} checkedIn={!!a.checkInAt} worked={a.workedMinutes ?? null} scheduled={a.scheduledMinutes} />}
      </QueryView>
    </Screen>
  );
}

function ReviewForm({ id, checkedIn, worked, scheduled }: { id: string; checkedIn: boolean; worked: number | null; scheduled?: number }) {
  const [decision, setDecision] = useState<Decision>('approve');
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState(worked === null ? '' : String(worked));
  const [confirming, setConfirming] = useState(false);
  const invalidate = useAdminInvalidate();
  const minutesNum = minutes.trim() === '' ? undefined : Number(minutes);
  const minutesOk = decision === 'reject' || !checkedIn || (minutesNum !== undefined && Number.isInteger(minutesNum) && minutesNum >= 0 && minutesNum <= 600);
  const noteOk = note.trim().length >= (decision === 'reject' ? 5 : 1);
  const resolve = useMutation({
    mutationFn: () => adminService.resolveAttendance(id, note.trim(), decision === 'approve' && checkedIn ? minutesNum : undefined, decision),
    onSuccess: async () => {
      setConfirming(false);
      await invalidate();
      useToast.getState().show(decision === 'approve' ? 'Attendance approved' : 'Attendance rejected');
      router.back();
    },
    onError: () => setConfirming(false),
  });
  return (
    <>
      <Segmented<Decision>
        options={[{ value: 'approve', label: 'Approve' }, { value: 'reject', label: 'Reject' }]}
        value={decision}
        onChange={setDecision}
      />
      {decision === 'approve' && checkedIn && (
        <TextField
          label={`Worked minutes${scheduled ? ` (scheduled ${scheduled})` : ''}`}
          value={minutes}
          onChangeText={(t) => setMinutes(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          error={minutesOk ? undefined : 'Enter whole minutes between 0 and 600'}
        />
      )}
      {decision === 'reject' && (
        <Notice tone="warning">Rejecting counts this visit as 0 worked minutes, so it is not paid to the chef.</Notice>
      )}
      <TextField
        label={decision === 'reject' ? 'Reason for rejecting (required)' : 'Note (required)'}
        value={note}
        onChangeText={setNote}
        multiline
        placeholder="What happened and how you verified it"
        error={note.length > 0 && !noteOk ? 'Enter at least 5 characters' : undefined}
      />
      <Txt variant="caption">Your name, the time, the decision and this note are recorded and can’t be changed later.</Txt>
      {resolve.isError && (
        <Notice tone="error">{isNetworkError(resolve.error) ? 'You’re offline. Nothing was saved.' : resolve.error.message}</Notice>
      )}
      <Button title={decision === 'approve' ? 'Approve' : 'Reject'} variant={decision === 'reject' ? 'danger' : 'primary'}
        disabled={!noteOk || !minutesOk} loading={resolve.isPending} onPress={() => setConfirming(true)} />
      <ConfirmDialog
        visible={confirming}
        title={decision === 'approve' ? 'Approve this attendance?' : 'Reject this attendance?'}
        message={decision === 'approve' && checkedIn ? `Worked time will be ${minutesNum ?? worked} minutes.` : 'This decision is final.'}
        confirmLabel={decision === 'approve' ? 'Approve' : 'Reject'}
        destructive={decision === 'reject'}
        loading={resolve.isPending}
        onCancel={() => !resolve.isPending && setConfirming(false)}
        onConfirm={() => !resolve.isPending && resolve.mutate()}
      />
    </>
  );
}
