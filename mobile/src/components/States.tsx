import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { FadeInUp, haptic, PopIn, SkeletonList, useCelebrate, useLoop, useShake } from '../motion';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { UseQueryResult } from '@tanstack/react-query';
import { colors, spacing } from '../theme';
import { isNetworkError, toneColors, type Tone } from '../utils';
import { Button } from './Button';
import { Txt } from './Txt';

type IconName = keyof typeof Ionicons.glyphMap;

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <FadeInUp style={styles.center}>
      <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: spacing.sm }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Txt variant="small">{label}</Txt>
      </View>
    </FadeInUp>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, message, action }: { icon?: IconName; title: string; message?: string; action?: React.ReactNode }) {
  // The icon gently floats, with a soft shadow that breathes underneath it.
  const v = useLoop(2600);
  return (
    <FadeInUp style={styles.center}>
      <Animated.View style={[styles.iconCircle, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]}>
        <Ionicons name={icon} size={30} color={colors.purple} />
      </Animated.View>
      <Animated.View style={[styles.floatShadow, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.08] }), transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }) }] }]} />
      <Txt variant="h3" center>{title}</Txt>
      {message && <Txt variant="small" center>{message}</Txt>}
      {action}
    </FadeInUp>
  );
}

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const offline = isNetworkError(error);
  const message = offline ? 'Check your internet connection.' : error instanceof Error ? error.message : 'Something went wrong.';
  const [x, shake] = useShake();
  useEffect(() => {
    shake();
    haptic.warning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);
  return (
    <View style={styles.center}>
      <Animated.View style={[styles.iconCircle, { backgroundColor: colors.errorLight, transform: [{ translateX: x }] }]}>
        <Ionicons name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={30} color={colors.error} />
      </Animated.View>
      <Txt variant="h3" center>{offline ? 'You’re offline' : 'Couldn’t load this'}</Txt>
      <Txt variant="small" center>{message}</Txt>
      {onRetry && <Button title="Try again" variant="secondary" small icon="refresh" onPress={onRetry} />}
      {offline && <Button title="Connection help" variant="ghost" small onPress={() => router.push('/offline')} />}
    </View>
  );
}

/**
 * Renders loading / error / empty states for a react-query result, else children(data).
 * Keeps every screen's async handling consistent.
 */
export function QueryView<T>({
  query, children, isEmpty, empty, loadingLabel,
}: {
  query: UseQueryResult<T>;
  children: (data: NonNullable<T>) => React.ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: { title: string; message?: string; icon?: IconName; action?: React.ReactNode };
  loadingLabel?: string;
}) {
  if (query.isPending) return loadingLabel ? <LoadingState label={loadingLabel} /> : <SkeletonList />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data as T;
  const emptyNow = data == null || (isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0);
  if (emptyNow) return <EmptyState title={empty?.title ?? 'Nothing here yet'} message={empty?.message} icon={empty?.icon} action={empty?.action} />;
  return <>{children(data as NonNullable<T>)}</>;
}

/** Large icon + title + message, used for success, pending, failure and "coming soon" screens. */
/** `celebrate` adds a confetti burst for the big moments (onboarding done, payment success, application sent). */
export function StatusHero({ tone = 'success', icon, title, message, children, celebrate }: { tone?: Tone; icon: IconName; title: string; message?: string; children?: React.ReactNode; celebrate?: boolean }) {
  const t = toneColors[tone];
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (celebrate) setTimeout(() => useCelebrate.getState().celebrate(), 250);
    else if (tone === 'success') haptic.success();
    else if (tone === 'error') haptic.error();
    Animated.timing(ring, { toValue: 1, duration: 900, delay: 180, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tone, ring]);
  return (
    <View style={[styles.center, { paddingVertical: spacing.xl }]}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.heroCircle,
            styles.heroRing,
            { borderColor: t.fg, opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.6] }) }] },
          ]}
        />
        <PopIn style={[styles.heroCircle, { backgroundColor: t.bg }]}>
          <PopIn delay={160}>
            <Ionicons name={icon} size={46} color={t.fg} />
          </PopIn>
        </PopIn>
      </View>
      <Txt variant="h1" center>{title}</Txt>
      {message && <Txt variant="body" color={colors.textSecondary} center>{message}</Txt>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroCircle: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  heroRing: { position: 'absolute', top: 0, borderWidth: 3 },
  floatShadow: { width: 40, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: -6 },
});
