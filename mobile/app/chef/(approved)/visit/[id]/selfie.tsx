import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, PhotoCapture, Screen, type CapturedPhoto } from '../../../../../src/components';
import { useCheckoutProgress, useChefId } from '../../../../../src/features/chef';
import { currentPosition, LocationDeniedError } from '../../../../../src/features/tracking';
import { ApiError, visitService } from '../../../../../src/services';

/** Selfie capture for check-in (starts cooking) or check-out (completion selfie). */
export default function ChefSelfie() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: 'check_in' | 'check_out' }>();
  const isCheckIn = kind !== 'check_out';
  const chefId = useChefId();
  const qc = useQueryClient();
  const mark = useCheckoutProgress((s) => s.mark);
  const code = useCheckoutProgress((s) => s.byVisit[id]?.code);
  const [captured, setCaptured] = useState<CapturedPhoto | null>(null);
  // The selfie already uploaded for this capture. If check-in is then refused (weak GPS, too far, too early), a retry
  // re-uses it: uploading the same picture again would be refused as a reused photo.
  const [uploaded, setUploaded] = useState<{ uri: string; id: string } | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (!captured) throw new Error('Take a selfie first.');
      if (isCheckIn && !code) throw new Error('Enter the customer’s check-in code first.');
      const pos = isCheckIn ? await currentPosition({ precise: true }) : null; // GPS first, so a weak fix doesn't waste the upload
      let photoId = uploaded?.uri === captured.uri ? uploaded.id : undefined;
      if (!photoId) {
        const photo = await visitService.uploadPhoto(id, isCheckIn ? 'check_in_selfie' : 'check_out_selfie', captured.uri, captured.mimeType);
        photoId = photo.id;
        setUploaded({ uri: captured.uri, id: photo.id });
      }
      if (isCheckIn && pos) await visitService.checkIn(id, { ...pos, code: code!, selfiePhotoId: photoId });
      return photoId;
    },
    onError: (e) => {
      if (e instanceof LocationDeniedError) router.push({ pathname: '/permission-denied', params: { kind: 'location' } });
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
      {submit.isError && !(submit.error instanceof LocationDeniedError) && (
        <Notice tone="error">
          {submit.error.message}
          {submit.error instanceof ApiError && submit.error.code === 'GPS_ACCURACY_POOR' ? ' Then tap the button again; your selfie is kept.' : ''}
        </Notice>
      )}
      {submit.error instanceof ApiError && ['CHECKIN_CODE_INVALID', 'CHECKIN_CODE_USED'].includes(submit.error.code) && (
        <Button title="Re-enter the code" variant="secondary" onPress={() => router.replace({ pathname: '/chef/visit/[id]/check-in', params: { id } })} />
      )}
    </Screen>
  );
}
