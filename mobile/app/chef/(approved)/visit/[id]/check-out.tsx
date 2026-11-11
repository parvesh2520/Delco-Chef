import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, ListGroup, ListRow, Notice, Screen } from '../../../../../src/components';
import { useCheckoutProgress, useChefId } from '../../../../../src/features/chef';
import { visitService } from '../../../../../src/services';

/** Check-out checklist: food photo + completion selfie, then confirm. */
export default function ChefCheckOut() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chefId = useChefId();
  const qc = useQueryClient();
  const progress = useCheckoutProgress((s) => s.byVisit[id]) ?? { food: false, selfie: false };
  const reset = useCheckoutProgress((s) => s.reset);
  const done = progress.food && progress.selfie;

  const checkOut = useMutation({
    mutationFn: () => visitService.checkOut(id),
    onSuccess: () => {
      reset(id);
      qc.invalidateQueries({ queryKey: ['visit', id] });
      qc.invalidateQueries({ queryKey: ['chefVisits', chefId] });
      router.replace(`/chef/visit/${id}/completed`);
    },
  });

  const status = (ok: boolean) => <Badge tone={ok ? 'success' : 'warning'} label={ok ? 'Done' : 'To do'} />;
  return (
    <Screen eyebrow="Check out" title="Before you leave" footer={
      <Button title="Confirm check-out" disabled={!done} loading={checkOut.isPending} onPress={() => checkOut.mutate()} />
    }>
      <ListGroup>
        <ListRow icon="fast-food-outline" title="Food photo" subtitle="Photo of the dishes you cooked" right={status(progress.food)} onPress={() => router.push(`/chef/visit/${id}/food-photo`)} />
        <ListRow icon="person-circle-outline" title="Completion selfie" subtitle="After cleaning the kitchen" right={status(progress.selfie)} onPress={() => router.push({ pathname: '/chef/visit/[id]/selfie', params: { id, kind: 'check_out' } })} />
      </ListGroup>
      {!done && <Notice>Complete both steps to check out.</Notice>}
      {checkOut.isError && <Notice tone="error">{checkOut.error.message}</Notice>}
    </Screen>
  );
}
