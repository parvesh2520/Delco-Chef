import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';
import { toDateKey } from '../utils';
import type { LatLng } from '../types';
import { Button } from './Button';
import { Txt } from './Txt';

/**
 * Stylised map placeholder. A real map (react-native-maps + Google Maps API key) is a
 * pending integration; this shows pins in relative positions so layouts are final.
 */
export function MapPreview({ destination, chef, height = 220, label }: { destination?: LatLng; chef?: LatLng; height?: number; label?: string }) {
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
        <View style={[styles.pin, pos(destination)]}>
          <Ionicons name="home" size={18} color={colors.textOnDark} />
        </View>
      )}
      {chef && (
        <View style={[styles.pin, styles.chefPin, pos(chef)]}>
          <Ionicons name="bicycle" size={18} color={colors.primary} />
        </View>
      )}
      <View style={styles.mapTag}>
        <Txt variant="caption" color={colors.purple}>Map preview · live map pending</Txt>
      </View>
    </View>
  );
}

/** Camera placeholder: shows a frame and simulates capture. Real capture uses expo-camera / expo-image-picker. */
export function PhotoCapture({ label, captured, onCapture, icon = 'camera-outline' }: { label: string; captured: boolean; onCapture: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.frame, captured && { borderColor: colors.success, backgroundColor: colors.successLight }]}>
        <Ionicons name={captured ? 'checkmark-circle' : icon} size={64} color={captured ? colors.success : colors.purple} />
        <Txt variant="bodyStrong" center>{captured ? 'Photo captured' : label}</Txt>
        <Txt variant="caption" center>Camera integration pending — capture is simulated.</Txt>
      </View>
      <Button title={captured ? 'Retake' : 'Capture photo'} icon="camera" variant={captured ? 'secondary' : 'accent'} onPress={onCapture} />
    </View>
  );
}

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Month calendar with selectable days (off-day pickers). Past days are disabled. */
export function Calendar({ selected, onToggle, marked = [], minDate = new Date(), maxDate }: { selected: string[]; onToggle?: (key: string) => void; marked?: string[]; minDate?: Date; maxDate?: Date }) {
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
          const disabled = key < minKey || (!!maxKey && key > maxKey) || !onToggle;
          const on = selected.includes(key);
          const mark = marked.includes(key);
          return (
            <Pressable key={i} disabled={disabled} onPress={() => onToggle?.(key)} accessibilityLabel={`${d.toDateString()}${on ? ', selected' : ''}`} style={styles.cell}>
              <View style={[styles.day, on && { backgroundColor: colors.accent }, mark && !on && { borderWidth: 1.5, borderColor: colors.purple }]}>
                <Txt variant="label" color={disabled && !on ? colors.textMuted : colors.primary}>{d.getDate()}</Txt>
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
  pin: { position: 'absolute', width: 36, height: 36, borderRadius: 18, marginLeft: -18, marginTop: -18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  chefPin: { backgroundColor: colors.accent },
  mapTag: { position: 'absolute', bottom: 8, left: 8, backgroundColor: colors.card, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  frame: { height: 280, borderRadius: radius.xl, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.purple, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center', gap: 8, padding: spacing.md },
  cal: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  calHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
