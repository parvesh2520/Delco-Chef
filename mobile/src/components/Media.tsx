import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { WebView as NativeWebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';
import { toDateKey } from '../utils';
import type { LatLng } from '../types';
import { Button } from './Button';
import { Txt } from './Txt';

const WebView = NativeWebView as unknown as React.ComponentType<any>;

/**
 * Real Google Map preview with destination (customer home) + live chef markers.
 */
export function MapPreview({ destination, chef, height = 220, label }: { destination?: LatLng; chef?: LatLng; height?: number; label?: string }) {
  const destLat = destination?.lat || 12.9716;
  const destLng = destination?.lng || 77.5946;
  const chefLat = chef?.lat;
  const chefLng = chef?.lng;

  const html = useMemo(() => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #FAF4E8; overflow: hidden; }
    .home-pin {
      width: 32px; height: 32px; background: ${colors.primary};
      border: 3px solid #FFFFFF; border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg); box-shadow: 0 4px 10px rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
    }
    .home-dot { width: 10px; height: 10px; background: #FFFFFF; border-radius: 50%; }
    .chef-pin {
      width: 36px; height: 36px; background: ${colors.accent};
      border: 3px solid #FFFFFF; border-radius: 50%;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
    }
    .leaflet-control-attribution { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var bounds = [];
    bounds.push([${destLat}, ${destLng}]);
    ${chefLat && chefLng ? `bounds.push([${chefLat}, ${chefLng}]);` : ''}

    var map = L.map('map', { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(map);

    var homeIcon = L.divIcon({
      className: '',
      html: '<div class="home-pin"><div class="home-dot"></div></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
    L.marker([${destLat}, ${destLng}], { icon: homeIcon }).addTo(map);

    ${chefLat && chefLng ? `
      var chefIcon = L.divIcon({
        className: '',
        html: '<div class="chef-pin">👨‍🍳</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      L.marker([${chefLat}, ${chefLng}], { icon: chefIcon }).addTo(map);
    ` : ''}

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([${destLat}, ${destLng}], 16);
    }
  </script>
</body>
</html>
    `;
  }, [destLat, destLng, chefLat, chefLng]);

  return (
    <View style={[styles.map, { height }]} accessibilityLabel={label ?? 'Map preview'}>
      <WebView
        source={{ html }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
      />
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
