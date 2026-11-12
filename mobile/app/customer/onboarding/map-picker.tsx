import React, { useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Notice, RealMapPicker, type RealMapPickerRef, Screen, Txt } from '../../../src/components';
import { DEFAULT_CENTRE, usePickedLocation } from '../../../src/features/customer';
import { currentPosition } from '../../../src/features/tracking';
import type { LatLng } from '../../../src/types';
import { isWithinIndia } from '../../../src/utils';

/**
 * Real interactive Google Map address picker.
 * Allows tapping anywhere or dragging the marker pin onto building entrances,
 * with instant GPS "Use my current location" fly-to centering.
 */
export default function MapPicker() {
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const initial = params.lat && params.lng ? { lat: Number(params.lat), lng: Number(params.lng) } : DEFAULT_CENTRE;
  const [pin, setPin] = useState<LatLng>(initial);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapPickerRef = useRef<RealMapPickerRef>(null);
  const setPicked = usePickedLocation((s) => s.setPicked);
  const inIndia = isWithinIndia(pin.lat, pin.lng);

  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const p = await currentPosition();
      const next = { lat: p.lat, lng: p.lng };
      setPin(next);
      mapPickerRef.current?.flyTo(next.lat, next.lng);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <Screen
      title="Pin your location"
      subtitle="Tap the map or drag the pin onto your building entrance."
      footer={
        <Button
          title="Use this location"
          icon="checkmark"
          disabled={!inIndia}
          onPress={() => {
            if (inIndia) {
              setPicked(pin);
              router.back();
            }
          }}
        />
      }
    >
      <RealMapPicker
        ref={mapPickerRef}
        initialLocation={pin}
        onLocationChange={(newPin) => setPin(newPin)}
        height={380}
      />

      <Card>
        <Txt variant="label">Selected location</Txt>
        <Txt variant="bodyStrong">
          {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
        </Txt>
      </Card>

      <Button
        title="Use my current location"
        variant="secondary"
        icon="locate-outline"
        loading={locating}
        onPress={locate}
      />

      {error && <Notice tone="error">{error}</Notice>}
      {!inIndia && <Notice tone="error">Location must be within India.</Notice>}
      <Notice>The pin is saved with your address so your chef’s check-in and ETA use the exact spot.</Notice>
    </Screen>
  );
}
