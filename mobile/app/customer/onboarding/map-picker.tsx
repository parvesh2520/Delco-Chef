import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE, type MapPressEvent } from 'react-native-maps';
import { Button, Card, MapPreview, Notice, Screen, Txt } from '../../../src/components';
import { APP_CONFIG } from '../../../src/constants';
import { DEFAULT_CENTRE, usePickedLocation } from '../../../src/features/customer';
import { currentPosition } from '../../../src/features/tracking';
import { colors, radius } from '../../../src/theme';
import type { LatLng } from '../../../src/types';
import { isWithinIndia } from '../../../src/utils';

/** Map-based address picker: tap or drag the pin, or use the device's current location. Used by onboarding and Manage addresses. */
export default function MapPicker() {
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const initial = params.lat && params.lng ? { lat: Number(params.lat), lng: Number(params.lng) } : DEFAULT_CENTRE;
  const [pin, setPin] = useState<LatLng>(initial);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const setPicked = usePickedLocation((s) => s.setPicked);
  const inIndia = isWithinIndia(pin.lat, pin.lng);

  const onPress = (e: MapPressEvent) => {
    const next = { lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude };
    setPin(next);
  };

  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const p = await currentPosition();
      const next = { lat: p.lat, lng: p.lng };
      setPin(next);
      mapRef.current?.animateToRegion(
        {
          latitude: next.lat,
          longitude: next.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        800
      );
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
      footer={<Button title="Use this location" icon="checkmark" disabled={!inIndia} onPress={() => inIndia && (setPicked(pin), router.back())} />}
    >
      {APP_CONFIG.mapsEnabled ? (
        <View style={styles.map}>
          <MapView
            ref={mapRef}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            style={StyleSheet.absoluteFill}
            showsUserLocation
            showsMyLocationButton
            showsCompass
            initialRegion={{
              latitude: pin.lat,
              longitude: pin.lng,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            }}
            onPress={onPress}
          >
            <Marker
              draggable
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              title="Delivery Entrance"
              description="Drag to adjust exact location"
              pinColor={colors.accent}
              onDragEnd={(e) => setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
            />
          </MapView>
        </View>
      ) : (
        <MapPreview destination={pin} height={380} label="Selected location" />
      )}
      <Card>
        <Txt variant="label">Selected location</Txt>
        <Txt variant="bodyStrong">{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</Txt>
      </Card>
      <Button title="Use my current location" variant="secondary" icon="locate-outline" loading={locating} onPress={locate} />
      {error && <Notice tone="error">{error}</Notice>}
      {!inIndia && <Notice tone="error">Location must be within India.</Notice>}
      <Notice>The pin is saved with your address so your chef’s check-in and ETA use the exact spot.</Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 380, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
