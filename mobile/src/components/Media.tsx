import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { PopIn, PulseDot } from '../motion';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker } from 'react-native-maps';
import { APP_CONFIG } from '../constants';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';
import { toDateKey } from '../utils';
import type { LatLng } from '../types';
import { Button } from './Button';
import { Txt } from './Txt';

/**
 * Google map with destination + chef markers (react-native-maps). When maps are disabled for a build
 * (EXPO_PUBLIC_MAPS_ENABLED=false, e.g. no API key yet) it falls back to a stylised relative-position view.
 */
export function MapPreview({ destination, chef, height = 220, label }: { destination?: LatLng; chef?: LatLng; height?: number; label?: string }) {
  if (APP_CONFIG.mapsEnabled && destination) {
    const lats = [destination.lat, ...(chef ? [chef.lat] : [])];
    const lngs = [destination.lng, ...(chef ? [chef.lng] : [])];
    const region = {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitudeDelta: Math.max(0.01, (Math.max(...lats) - Math.min(...lats)) * 1.8),
      longitudeDelta: Math.max(0.01, (Math.max(...lngs) - Math.min(...lngs)) * 1.8),
    };
    return (
      <View style={[styles.map, { height }]} accessibilityLabel={label ?? 'Map'}>
        <MapView style={StyleSheet.absoluteFill} region={region} toolbarEnabled={false}>
          <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title="Home" pinColor={colors.primary} />
          {chef && <Marker coordinate={{ latitude: chef.lat, longitude: chef.lng }} title="Your chef" pinColor={colors.accent} />}
        </MapView>
      </View>
    );
  }
  return <FallbackMap destination={destination} chef={chef} height={height} label={label} />;
}

/** Stylised map used when Google Maps is off. The chef marker glides to each new GPS fix and pulses while live. */
function FallbackMap({ destination, chef, height, label }: { destination?: LatLng; chef?: LatLng; height: number; label?: string }) {
  const last = useRef(chef ? `${chef.lat},${chef.lng}` : '');
  const key = chef ? `${chef.lat},${chef.lng}` : '';
  useEffect(() => {
    if (key !== last.current) last.current = key;
  }, [key]);
  if (key !== last.current && last.current) {
    LayoutAnimation.configureNext({ duration: 900, update: { type: LayoutAnimation.Types.easeInEaseOut } });
  }
  const pos = (p: LatLng) => {
    if (!destination) return { left: '50%', top: '50%' } as const;
    const dx = (p.lng - destination.lng) * 1800;
    const dy = (destination.lat - p.lat) * 1800;
    return { left: `${Math.min(88, Math.max(8, 50 + dx))}%`, top: `${Math.min(85, Math.max(10, 55 + dy))}%` } as const;
  };
  return (
    <View style={[styles.map, { height }]} accessibilityLabel={label ?? 'Map preview'}>
      {[20, 45, 70].map((t) => <View key={`h${t}`} style={[styles.road, { top: `${t}%`, left: 0, right: 0, height: 10 }]} />)}
      {[25, 60].map((l) => <View key={`v${l}`} style={[styles.road, { left: `${l}%`, top: 0, bottom: 0, width: 10 }]} />)}
      {destination && (
        <View style={[styles.pinBox, pos(destination)]}>
          <PopIn style={styles.pin}>
            <Ionicons name="home" size={18} color={colors.textOnDark} />
          </PopIn>
        </View>
      )}
      {chef && (
        <View style={[styles.pinBox, pos(chef)]}>
          <View style={styles.halo} pointerEvents="none">
            <PulseDot color={colors.accent} size={26} />
          </View>
          <PopIn delay={200} style={[styles.pin, styles.chefPin]}>
            <Ionicons name="bicycle" size={18} color={colors.primary} />
          </PopIn>
        </View>
      )}
    </View>
  );
}

export interface CapturedPhoto {
  uri: string;
  mimeType: string;
}

/** Opens the device camera (expo-image-picker). Gallery picking is not offered for attendance photos. */
export async function takePhoto(front = false): Promise<CapturedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission is needed. Allow it in Settings and try again.');
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'], quality: 0.6, exif: false, cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg' };
}

/** Camera capture with preview. `onCapture` receives the photo; the screen uploads it to the API. */
export function PhotoCapture({ label, captured, onCapture, icon = 'camera-outline', front = false }: { label: string; captured: CapturedPhoto | null; onCapture: (p: CapturedPhoto) => void; icon?: keyof typeof Ionicons.glyphMap; front?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const capture = async () => {
    setError(null);
    try {
      const p = await takePhoto(front);
      if (p) onCapture(p);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.frame, captured && { borderColor: colors.success, backgroundColor: colors.successLight, padding: 0, overflow: 'hidden' }]}>
        {captured ? (
          <Image source={{ uri: captured.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Captured photo" />
        ) : (
          <>
            <Ionicons name={icon} size={64} color={colors.purple} />
            <Txt variant="bodyStrong" center>{label}</Txt>
          </>
        )}
      </View>
      {error && <Txt variant="small" color={colors.error}>{error}</Txt>}
      <Button title={captured ? 'Retake' : 'Capture photo'} icon="camera" variant={captured ? 'secondary' : 'accent'} onPress={capture} />
    </View>
  );
}

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Month calendar with selectable days (off-day pickers). Past days are disabled.
 * Pass `allowedDates` to restrict selection to valid service dates only. */
export function Calendar({
  selected,
  onToggle,
  marked = [],
  minDate = new Date(),
  maxDate,
  allowedDates,
}: {
  selected: string[];
  onToggle?: (key: string) => void;
  marked?: string[];
  minDate?: Date;
  maxDate?: Date;
  allowedDates?: string[];
}) {
  const [cursor, setCursor] = useState(() => new Date(minDate.getFullYear(), minDate.getMonth(), 1));
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  }, [cursor]);
  const minKey = toDateKey(minDate);
  const maxKey = maxDate ? toDateKey(maxDate) : undefined;
  return (
    <View style={styles.cal}>
      <View style={styles.calHead}>
        <Pressable accessibilityLabel="Previous month" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <Txt variant="h3">{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Txt>
        <Pressable accessibilityLabel="Next month" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} hitSlop={10}>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEK.map((w, i) => <Txt key={i} variant="caption" center style={styles.cell}>{w}</Txt>)}
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={styles.cell} />;
          const key = toDateKey(d);
          const isAllowed = !allowedDates || allowedDates.includes(key);
          const inRange = key >= minKey && (!maxKey || key <= maxKey);
          const disabled = !inRange || !isAllowed || !onToggle;
          const on = selected.includes(key);
          const mark = marked.includes(key);
          return (
            <Pressable
              key={i}
              disabled={disabled}
              onPress={() => onToggle?.(key)}
              accessibilityLabel={`${d.toDateString()}${on ? ', marked as day off' : disabled ? ', not a service day' : ', service day'}`}
              style={styles.cell}
            >
              <View
                style={[
                  styles.day,
                  on && { backgroundColor: colors.accent },
                  mark && !on && { borderWidth: 1.5, borderColor: colors.purple },
                ]}
              >
                <Txt
                  variant="label"
                  color={on ? '#FFFFFF' : disabled ? colors.textMuted : colors.primary}
                  style={on && { fontWeight: '700' }}
                >
                  {d.getDate()}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { borderRadius: radius.lg, backgroundColor: '#EFE7DA', overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  road: { position: 'absolute', backgroundColor: '#FFFFFF', opacity: 0.8 },
  pin: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  chefPin: { backgroundColor: colors.accent },
  pinBox: { position: 'absolute', width: 36, height: 36, marginLeft: -18, marginTop: -18, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', opacity: 0.6 },
  frame: { height: 280, borderRadius: radius.xl, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.purple, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center', gap: 8, padding: spacing.md },
  cal: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  calHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
