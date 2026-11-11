import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
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
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Txt variant="small">{label}</Txt>
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, message, action }: { icon?: IconName; title: string; message?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.center}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={30} color={colors.purple} />
      </View>
      <Txt variant="h3" center>{title}</Txt>
      {message && <Txt variant="small" center>{message}</Txt>}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const offline = isNetworkError(error);
  const message = offline ? 'Check your internet connection.' : error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <View style={styles.center}>
      <View style={[styles.iconCircle, { backgroundColor: colors.errorLight }]}>
        <Ionicons name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={30} color={colors.error} />
      </View>
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
  if (query.isPending) return <LoadingState label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data as T;
  const emptyNow = data == null || (isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0);
  if (emptyNow) return <EmptyState title={empty?.title ?? 'Nothing here yet'} message={empty?.message} icon={empty?.icon} action={empty?.action} />;
  return <>{children(data as NonNullable<T>)}</>;
}

/** Large icon + title + message, used for success, pending, failure and "coming soon" screens. */
export function StatusHero({ tone = 'success', icon, title, message, children }: { tone?: Tone; icon: IconName; title: string; message?: string; children?: React.ReactNode }) {
  const t = toneColors[tone];
  return (
    <View style={[styles.center, { paddingVertical: spacing.xl }]}>
      <View style={[styles.heroCircle, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={46} color={t.fg} />
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
});
