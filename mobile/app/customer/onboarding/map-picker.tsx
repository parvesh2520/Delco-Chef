import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, type MapPressEvent } from 'react-native-maps';
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
  const setPicked = usePickedLocation((s) => s.setPicked);
  const inIndia = isWithinIndia(pin.lat, pin.lng);
  const onPress = (e: MapPressEvent) => setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude });
  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const p = await currentPosition();
      setPin({ lat: p.lat, lng: p.lng });
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
            style={StyleSheet.absoluteFill}
            initialRegion={{ latitude: pin.lat, longitude: pin.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
            region={{ latitude: pin.lat, longitude: pin.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
            onPress={onPress}
          >
            <Marker draggable coordinate={{ latitude: pin.lat, longitude: pin.lng }} pinColor={colors.primary}
              onDragEnd={(e) => setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })} />
          </MapView>
        </View>
      ) : (
        <MapPreview destination={pin} height={300} label="Selected location" />
      )}
      <Card>
        <Txt variant="label">Selected</Txt>
        <Txt variant="bodyStrong">{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</Txt>
      </Card>
      <Button title="Use my current location" variant="secondary" icon="locate-outline" loading={locating} onPress={locate} />
      {error && <Notice tone="error">{error}</Notice>}
      {!inIndia && <Notice tone="error">Location must be within India.</Notice>}
      {!APP_CONFIG.mapsEnabled && (
        <Notice tone="warning" icon="map-outline">
          The interactive map is off in this build (no Google Maps key configured), so the pin can’t be dragged. Use your current location here, or search for your address on the previous screen.
        </Notice>
      )}
      <Notice>The pin is saved with your address so your chef’s check-in and ETA use the exact spot. Locations must be within India.</Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 300, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
