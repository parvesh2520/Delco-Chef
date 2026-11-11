import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Notice, PhotoCapture, Screen } from '../../../../../src/components';
import { useCheckoutProgress } from '../../../../../src/features/chef';
import { visitService } from '../../../../../src/services';

/** Food photo capture before check-out. */
export default function ChefFoodPhoto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mark = useCheckoutProgress((s) => s.mark);
  const [captured, setCaptured] = useState(false);
  const save = useMutation({
    mutationFn: () => visitService.uploadPhoto(id, 'food'),
    onSuccess: () => {
      mark(id, 'food');
      router.back();
    },
  });
  return (
    <Screen eyebrow="Check out" title="Food photo" subtitle="Plate or arrange the dishes so they’re all visible." footer={
      <Button title="Save photo" disabled={!captured} loading={save.isPending} onPress={() => save.mutate()} />
    }>
      <PhotoCapture label="Photograph today’s dishes" icon="fast-food-outline" captured={captured} onCapture={() => setCaptured(true)} />
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
    </Screen>
  );
}
