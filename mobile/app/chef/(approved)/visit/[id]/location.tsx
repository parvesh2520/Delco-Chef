import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, Screen, StatusHero } from '../../../../../src/components';
import { useChefId } from '../../../../../src/features/chef';
import { currentPosition, LocationDeniedError } from '../../../../../src/features/tracking';
import { visitService } from '../../../../../src/services';

/** Asks the OS for location permission, then starts travel on the server. */
export default function ChefLocationPermission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chefId = useChefId();
  const qc = useQueryClient();
  const start = useMutation({
    mutationFn: async () => {
      await currentPosition(); // triggers the OS permission prompt
      return visitService.startTravel(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit', id] });
      qc.invalidateQueries({ queryKey: ['chefVisits', chefId] });
      router.replace(`/chef/visit/${id}/travelling`);
    },
    onError: (e) => {
      if (e instanceof LocationDeniedError) router.push({ pathname: '/permission-denied', params: { kind: 'location' } });
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
      <StatusHero art="map" tone="info" icon="location-outline" title="Share your location" message="Delco uses your location while you travel so the customer can see your ETA, and to confirm you’re at the address at check-in." />
      <Notice>Location is only shared from start of travel until check-out.</Notice>
      {start.isError && <Notice tone="error">{start.error.message}</Notice>}
    </Screen>
  );
}
