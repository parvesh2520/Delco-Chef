import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, MockTag, Notice, Screen, StatusHero } from '../../../../../src/components';
import { useChefId } from '../../../../../src/features/chef';
import { visitService } from '../../../../../src/services';

/** Location permission handling before travel starts. Permission prompt is simulated. */
export default function ChefLocationPermission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chefId = useChefId();
  const qc = useQueryClient();
  const start = useMutation({
    mutationFn: () => visitService.startTravel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit', id] });
      qc.invalidateQueries({ queryKey: ['chefVisits', chefId] });
      router.replace(`/chef/visit/${id}/travelling`);
    },
  });
  return (
    <Screen
      footer={
        <>
          <Button title="Allow location" icon="location" loading={start.isPending} onPress={() => start.mutate()} />
          <Button title="Don’t allow" variant="ghost" onPress={() => router.push({ pathname: '/permission-denied', params: { kind: 'location' } })} />
        </>
      }
    >
      <StatusHero tone="info" icon="location-outline" title="Share your location" message="Delco uses your location while you travel so the customer can see your ETA, and to confirm you’re at the address at check-in." />
      <Notice>Location is only shared from start of travel until check-out.</Notice>
      {start.isError && <Notice tone="error">{start.error.message}</Notice>}
      <MockTag>OS permission prompt pending (expo-location)</MockTag>
    </Screen>
  );
}
