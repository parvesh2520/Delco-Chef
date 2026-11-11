import React from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, MapPreview, Notice, Screen, Txt } from '../../../../../src/components';
import { useChefId, VisitGate } from '../../../../../src/features/chef';
import { visitService } from '../../../../../src/services';

/** Travelling status with active navigation / tracking. */
export default function ChefTravelling() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chefId = useChefId();
  const qc = useQueryClient();
  const tracking = useQuery({ queryKey: ['tracking', id], queryFn: () => visitService.getTracking(id), refetchInterval: 20000 });
  const arrive = useMutation({
    mutationFn: () => visitService.markArrived(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit', id] });
      qc.invalidateQueries({ queryKey: ['chefVisits', chefId] });
      router.replace(`/chef/visit/${id}/customer`);
    },
  });
  const t = tracking.data;

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
            <MapPreview destination={t?.destination ?? v.address} chef={t?.chefLocation} height={260} label="Route to customer" />
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="h3">{t?.etaMinutes != null ? `${t.etaMinutes} min away` : 'Calculating ETA…'}</Txt>
                <Badge status={v.status} />
              </View>
              <InfoRow icon="speedometer-outline" label="Distance" value={t?.distanceKm != null ? `${t.distanceKm} km` : undefined} />
              <InfoRow icon="time-outline" label="Slot" value={v.slot} />
              <InfoRow icon="location-outline" label="Address" value={`${v.address.line1}, ${v.address.city}`} />
            </Card>
            <Notice icon="radio-outline">Live location is shared with the customer. Location updates are simulated in this build.</Notice>
            {arrive.isError && <Notice tone="error">{arrive.error.message}</Notice>}
          </Screen>
        );
      }}
    </VisitGate>
  );
}
