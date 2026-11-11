import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, ChipGroup, MapPreview, MockTag, Notice, Screen, Txt } from '../../../src/components';
import { NOIDA_CENTRE, usePickedLocation } from '../../../src/features/customer';
import type { LatLng } from '../../../src/types';

// Mock pin positions until a real map (react-native-maps + Places) is integrated.
const PRESETS: Record<string, LatLng> = {
  'Sector 18': { lat: 28.5708, lng: 77.3261 },
  'Sector 50': { lat: 28.5703, lng: 77.3651 },
  'Sector 62': { lat: 28.6208, lng: 77.3633 },
  'Sector 74': { lat: 28.5733, lng: 77.3881 },
  'Sector 137': { lat: 28.5089, lng: 77.4085 },
};

/** Map-based address picker. Used by onboarding and Manage addresses. */
export default function MapPicker() {
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const initial = params.lat && params.lng ? { lat: Number(params.lat), lng: Number(params.lng) } : NOIDA_CENTRE;
  const [pin, setPin] = useState<LatLng>(initial);
  const [area, setArea] = useState<string>();
  const setPicked = usePickedLocation((s) => s.setPicked);
  return (
    <Screen
      title="Pin your location"
      subtitle="Place the pin on your building entrance."
      footer={<Button title="Use this location" icon="checkmark" onPress={() => (setPicked(pin), router.back())} />}
    >
      <MapPreview destination={pin} height={300} label="Selected location" />
      <Card>
        <Txt variant="label">Selected</Txt>
        <Txt variant="bodyStrong">{area ?? 'Custom pin'} · {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}</Txt>
      </Card>
      <Txt variant="label">Move pin to</Txt>
      <ChipGroup options={Object.keys(PRESETS)} value={area} onChange={(v) => { const a = v as string; setArea(a); setPin(PRESETS[a]); }} />
      <Notice>Search, drag-to-pin and current-location detection arrive with the maps SDK integration.</Notice>
      <MockTag>Mock map — preset locations only</MockTag>
    </Screen>
  );
}
