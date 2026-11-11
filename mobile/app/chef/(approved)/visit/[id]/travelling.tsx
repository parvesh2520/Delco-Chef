import React from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, MapPreview, Notice, Screen, Txt } from '../../../../../src/components';
import { useChefId, VisitGate } from '../../../../../src/features/chef';
import { useLocationSharing } from '../../../../../src/features/tracking';
import { visitService } from '../../../../../src/services';

/** Travelling status with active navigation / tracking. */
export default function ChefTravelling() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chefId = useChefId();
  const qc = useQueryClient();
  const visit = useQuery({ queryKey: ['visit', id], queryFn: () => visitService.get(id) });
  const sharing = useLocationSharing(id, visit.data?.status === 'chef_travelling');
  const arrive = useMutation({
    mutationFn: () => visitService.stopTravel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit', id] });
      qc.invalidateQueries({ queryKey: ['chefVisits', chefId] });
      router.replace(`/chef/visit/${id}/customer`);
    },
  });

  return (
    <VisitGate id={id}>
      {(v) => {
        const dest = `${v.address.lat},${v.address.lng}`;
        return (
          <Screen eyebrow="On the way" title={v.customerName} footer={
            <>
              <Button title="I’ve arrived" variant="accent" icon="flag" loading={arrive.isPending} onPress={() => arrive.mutate()} />
              <Button title="Open in Google Maps" variant="secondary" icon="navigate-outline" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`)} />
            </>
          }>
            <MapPreview destination={v.address} height={260} label="Route to customer" />
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="h3">{sharing.lastSentAt ? 'Sharing live location' : 'Starting GPS…'}</Txt>
                <Badge status={v.status} />
              </View>
              <InfoRow icon="time-outline" label="Slot" value={v.slot} />
              <InfoRow icon="location-outline" label="Address" value={`${v.address.line1}, ${v.address.city}`} />
            </Card>
            <Notice icon="radio-outline">Your location is sent every 5 seconds and is visible to this customer only, from 15 minutes before the visit until you check in. Keep the app open while travelling.</Notice>
            {sharing.error && <Notice tone="warning">{sharing.error}</Notice>}
            {arrive.isError && <Notice tone="error">{arrive.error.message}</Notice>}
          </Screen>
        );
      }}
    </VisitGate>
  );
}
