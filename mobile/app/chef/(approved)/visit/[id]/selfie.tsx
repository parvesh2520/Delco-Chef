import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, PhotoCapture, Screen, type CapturedPhoto } from '../../../../../src/components';
import { useCheckoutProgress, useChefId } from '../../../../../src/features/chef';
import { currentPosition } from '../../../../../src/features/tracking';
import { visitService } from '../../../../../src/services';

/** Selfie capture for check-in (starts cooking) or check-out (completion selfie). */
export default function ChefSelfie() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: 'check_in' | 'check_out' }>();
  const isCheckIn = kind !== 'check_out';
  const chefId = useChefId();
  const qc = useQueryClient();
  const mark = useCheckoutProgress((s) => s.mark);
  const code = useCheckoutProgress((s) => s.byVisit[id]?.code);
  const [captured, setCaptured] = useState<CapturedPhoto | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (!captured) throw new Error('Take a selfie first.');
      const pos = isCheckIn ? await currentPosition() : null; // GPS first, so a weak fix doesn't waste the upload
      const photo = await visitService.uploadPhoto(id, isCheckIn ? 'check_in_selfie' : 'check_out_selfie', captured.uri, captured.mimeType);
      if (isCheckIn && pos) {
        if (!code) throw new Error('Enter the customer’s check-in code first.');
        await visitService.checkIn(id, { ...pos, code, selfiePhotoId: photo.id });
      }
      return photo.id;
    },
    onSuccess: (photoId) => {
      if (isCheckIn) {
        qc.invalidateQueries({ queryKey: ['visit', id] });
        qc.invalidateQueries({ queryKey: ['chefVisits', chefId] });
        router.replace(`/chef/visit/${id}/cooking`);
      } else {
        mark(id, 'selfie', photoId);
        router.back();
      }
    },
  });

  return (
    <Screen eyebrow={isCheckIn ? 'Check in' : 'Check out'} title={isCheckIn ? 'Check-in selfie' : 'Completion selfie'} subtitle="Wear your Delco apron and make sure your face is clearly visible." footer={
      <Button title={isCheckIn ? 'Check in & start cooking' : 'Save selfie'} disabled={!captured} loading={submit.isPending} onPress={() => submit.mutate()} />
    }>
      <PhotoCapture label={isCheckIn ? 'Take a selfie in the customer’s kitchen' : 'Take a selfie after cleaning up'} icon="person-circle-outline" captured={captured} onCapture={setCaptured} front />
      {submit.isError && <Notice tone="error">{submit.error.message}</Notice>}
    </Screen>
  );
}
