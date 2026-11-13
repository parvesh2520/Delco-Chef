import React from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, MapPreview, Notice, Screen, Txt } from '../../../../../src/components';
import { useChefId, VisitGate } from '../../../../../src/features/chef';
import { LocationDeniedError, stopSharing, useLocationSharing } from '../../../../../src/features/tracking';
import { visitService } from '../../../../../src/services';
import { formatTime } from '../../../../../src/utils';

/** Travelling status: shares location every 5 s (also in the background on Android) until arrival or check-in. */
export default function ChefTravelling() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chefId = useChefId();
  const qc = useQueryClient();
  const visit = useQuery({ queryKey: ['visit', id], queryFn: () => visitService.get(id) });
  const sharing = useLocationSharing(id, visit.data?.status === 'chef_travelling');
  const arrive = useMutation({
    mutationFn: async () => {
      const v = await visitService.stopTravel(id);
      await stopSharing(null);
      return v;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit', id] });
      qc.invalidateQueries({ queryKey: ['chefVisits', chefId] });
      router.replace(`/chef/visit/${id}/customer`);
    },
  });
  const denied = sharing.startError instanceof LocationDeniedError ? sharing.startError : null;
  const title = !sharing.sharingThisVisit ? 'Location sharing is off'
    : sharing.lastSentAt ? 'Sharing live location' : 'Starting GPS…';

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
                <Txt variant="h3">{title}</Txt>
                <Badge status={v.status} />
              </View>
              <InfoRow icon="time-outline" label="Slot" value={v.slot} />
              <InfoRow icon="location-outline" label="Address" value={`${v.address.line1}, ${v.address.city}`} />
              {sharing.lastSentAt && <InfoRow icon="radio-outline" label="Last sent" value={formatTime(sharing.lastSentAt)} />}
              {sharing.queued > 1 && <InfoRow icon="cloud-upload-outline" label="Waiting to send" value={`${sharing.queued} updates`} />}
            </Card>
            {sharing.mode === 'background' && (
              <Notice icon="radio-outline">Your location is sent every 5 seconds — also when you switch to Maps or lock the phone (see the “Sharing your location” notification). Only this customer sees it, from 15 minutes before the visit until you check in. Don’t swipe the app away while travelling.</Notice>
            )}
            {sharing.mode === 'foreground' && (
              <Notice tone="warning" icon="phone-portrait-outline">Background sharing isn’t available in this build, so your location is only sent while this app is open. Keep it on screen while travelling.</Notice>
            )}
            {denied && (
              <Notice tone="error" icon="location-outline">{denied.message}</Notice>
            )}
            {denied && (denied.permanent
              ? <Button title="Open settings" variant="secondary" icon="settings-outline" onPress={() => Linking.openSettings()} />
              : <Button title="Allow location" variant="secondary" icon="location" onPress={() => sharing.retry()} />)}
            {sharing.startError && !denied && <Notice tone="error">{sharing.startError.message}</Notice>}
            {sharing.error && <Notice tone="warning" icon="cloud-offline-outline">{sharing.error}</Notice>}
            {sharing.ended && <Notice tone="info">{sharing.ended}</Notice>}
            {arrive.isError && <Notice tone="error">{arrive.error.message}</Notice>}
          </Screen>
        );
      }}
    </VisitGate>
  );
}
