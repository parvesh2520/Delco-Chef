import React, { useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APP_CONFIG } from '../constants';
import { useAuthStore } from '../store';
import { colors, fonts, radius, shadow, spacing } from '../theme';
import type { ChefCard as ChefCardData } from '../types';
import { Card } from './Card';
import { Avatar } from './Display';
import { Txt } from './Txt';

/** An image served by the API (chef photo, dish photo), fetched with the session token. */
export function ApiImage({ path, style, onError }: { path: string; style: StyleProp<ImageStyle>; onError?: () => void }) {
  const token = useAuthStore((s) => s.session?.token);
  return (
    <Image
      source={{ uri: `${APP_CONFIG.apiBaseUrl}${path}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
      style={style}
      onError={onError}
      accessibilityIgnoresInvertColors
    />
  );
}

/** Chef photo with a verified tick; falls back to initials when there is no photo or it fails to load. */
export function ChefPhoto({ chef, size = 64 }: { chef: Pick<ChefCardData, 'name' | 'photoUrl' | 'verified'>; size?: number }) {
  const [failed, setFailed] = useState(false);
  const tick = Math.max(18, Math.round(size * 0.32));
  return (
    <View style={[styles.photoRing, { width: size + 6, height: size + 6, borderRadius: (size + 6) / 2 }]}>
      {chef.photoUrl && !failed ? (
        <ApiImage path={chef.photoUrl} style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setFailed(true)} />
      ) : (
        <Avatar name={chef.name} size={size} />
      )}
      {chef.verified && (
        <View style={[styles.tick, { width: tick, height: tick, borderRadius: tick / 2 }]} accessibilityLabel="Verified chef">
          <Ionicons name="checkmark" size={tick * 0.62} color={colors.textOnDark} />
        </View>
      )}
    </View>
  );
}

function RatingPill({ chef, onDark }: { chef: ChefCardData; onDark?: boolean }) {
  const isNew = chef.ratingCount === 0;
  return (
    <View style={[styles.pill, { backgroundColor: onDark ? 'rgba(255,248,239,0.12)' : colors.accentLight }]}>
      <Ionicons name="star" size={12} color={colors.accent} />
      <Txt variant="caption" color={onDark ? colors.textOnDark : colors.primary} style={{ fontFamily: fonts.medium }}>
        {isNew ? 'New chef' : `${chef.rating.toFixed(1)} · ${chef.ratingCount} ${chef.ratingCount === 1 ? 'review' : 'reviews'}`}
      </Txt>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Txt style={styles.statValue}>{value}</Txt>
      <Txt variant="caption">{label}</Txt>
    </View>
  );
}

/**
 * Who is coming to cook. `full`: photo, stats, cuisines and specialities (visit and plan screens).
 * `compact`: one row for tight spaces such as live tracking.
 */
export function ChefCard({ chef, variant = 'full', caption = 'Your Delco chef', onPress }: { chef: ChefCardData; variant?: 'full' | 'compact'; caption?: string; onPress?: () => void }) {
  if (variant === 'compact') {
    return (
      <Card onPress={onPress} style={styles.compact} accessibilityLabel={`${caption}: ${chef.name}`}>
        <ChefPhoto chef={chef} size={48} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="caption">{caption}</Txt>
          <Txt variant="h3" numberOfLines={1}>{chef.name}</Txt>
        </View>
        <RatingPill chef={chef} />
      </Card>
    );
  }
  const years = chef.experienceYears;
  return (
    <Card onPress={onPress} style={styles.full} accessibilityLabel={`${caption}: ${chef.name}`}>
      <View style={styles.head}>
        <ChefPhoto chef={chef} size={72} />
        <View style={{ flex: 1, gap: 6 }}>
          <Txt variant="caption">{caption}{chef.city ? ` · ${chef.city}` : ''}</Txt>
          <Txt variant="h2" numberOfLines={1}>{chef.name}</Txt>
          <RatingPill chef={chef} />
        </View>
      </View>
      <View style={styles.stats}>
        <Stat value={chef.ratingCount ? chef.rating.toFixed(1) : '—'} label="Rating" />
        <View style={styles.vr} />
        <Stat value={years > 0 ? `${years} yr${years === 1 ? '' : 's'}` : 'New'} label="Experience" />
        <View style={styles.vr} />
        <Stat value={String(chef.completedVisits)} label="Visits" />
      </View>
      {chef.cuisines.length > 0 && (
        <View style={styles.chips}>
          {chef.cuisines.map((c) => (
            <View key={c} style={styles.chip}>
              <Txt variant="caption" color={colors.text}>{c}</Txt>
            </View>
          ))}
        </View>
      )}
      {!!chef.specialities && (
        <View style={styles.known}>
          <Ionicons name="restaurant-outline" size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
          <Txt variant="small" style={{ flex: 1 }}>Known for {chef.specialities}</Txt>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  photoRing: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, ...shadow },
  tick: { position: 'absolute', right: -2, bottom: -2, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md },
  full: { gap: spacing.md, padding: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stats: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: radius.md, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.text },
  vr: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  known: { flexDirection: 'row', gap: 8 },
});
