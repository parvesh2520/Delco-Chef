import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, PhotoCapture, Screen } from '../../../../../src/components';
import { useCheckoutProgress, useChefId } from '../../../../../src/features/chef';
import { visitService } from '../../../../../src/services';

/** Selfie capture for check-in (starts cooking) or check-out (completion selfie). */
export default function ChefSelfie() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: 'check_in' | 'check_out' }>();
  const isCheckIn = kind !== 'check_out';
  const chefId = useChefId();
  const qc = useQueryClient();
  const mark = useCheckoutProgress((s) => s.mark);
  const [captured, setCaptured] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      await visitService.uploadPhoto(id, isCheckIn ? 'check_in_selfie' : 'check_out_selfie');
      if (isCheckIn) await visitService.checkIn(id);
    },
    onSuccess: () => {
      if (isCheckIn) {
        qc.invalidateQueries({ queryKey: ['visit', id] });
        qc.invalidateQueries({ queryKey: ['chefVisits', chefId] });
        router.replace(`/chef/visit/${id}/cooking`);
      } else {
        mark(id, 'selfie');
        router.back();
      }
    },
  });

  return (
    <Screen eyebrow={isCheckIn ? 'Check in' : 'Check out'} title={isCheckIn ? 'Check-in selfie' : 'Completion selfie'} subtitle="Wear your Delco apron and make sure your face is clearly visible." footer={
      <Button title={isCheckIn ? 'Check in & start cooking' : 'Save selfie'} disabled={!captured} loading={submit.isPending} onPress={() => submit.mutate()} />
    }>
      <PhotoCapture label={isCheckIn ? 'Take a selfie in the customer’s kitchen' : 'Take a selfie after cleaning up'} icon="person-circle-outline" captured={captured} onCapture={() => setCaptured(true)} />
      {submit.isError && <Notice tone="error">{submit.error.message}</Notice>}
    </Screen>
  );
}
