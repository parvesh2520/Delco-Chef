import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PressableScale } from '../motion';
import { notificationService, type NotificationAudience } from '../services';
import { colors, fonts, radius, shadow, spacing } from '../theme';
import type { AppNotification } from '../types';
import { formatDateTime, formatTime } from '../utils';
import { TINTS, type Tint } from './Card';
import { Section } from './Display';
import { Screen } from './Screen';
import { QueryView } from './States';
import { Txt } from './Txt';

type Icon = keyof typeof Ionicons.glyphMap;

/** Icon and colour from what the notification is about (its title/body), so the list scans at a glance. */
function lookOf(n: AppNotification): { icon: Icon; tint: Tint } {
  const t = `${n.title} ${n.body}`.toLowerCase();
  if (/refund/.test(t)) return { icon: 'return-down-back-outline', tint: 'plum' };
  if (/fail|declin|missed|cancel|reject/.test(t)) return { icon: 'alert-circle-outline', tint: 'red' };
  if (/pay|receipt|paid/.test(t)) return { icon: 'receipt-outline', tint: 'green' };
  if (/trial/.test(t)) return { icon: 'albums-outline', tint: 'plum' };
  if (/on the way|travel|arriv|track/.test(t)) return { icon: 'navigate-outline', tint: 'accent' };
  if (/chef|assign|visit|cook/.test(t)) return { icon: 'restaurant-outline', tint: 'orange' };
  return { icon: 'notifications-outline', tint: 'orange' };
}

/** "Just now", "5 min ago", "3 h ago", then the clock time today, then the date. */
function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 6 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toDateString() === new Date().toDateString() ? formatTime(iso) : formatDateTime(iso);
}

function NotificationItem({ n }: { n: AppNotification }) {
  const look = lookOf(n);
  const t = TINTS[look.tint];
  const body = (
    <>
      <View style={[styles.tile, { backgroundColor: t.bg }]}>
        <Ionicons name={look.icon} size={20} color={t.fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.titleRow}>
          <Txt variant={n.read ? 'bodyStrong' : 'h3'} style={{ flex: 1 }} numberOfLines={2}>{n.title}</Txt>
          {!n.read && <View style={styles.dot} accessibilityLabel="Unread" />}
        </View>
        <Txt variant="small" color={n.read ? colors.textMuted : colors.textSecondary}>{n.body}</Txt>
        <Txt variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>{ago(n.at)}</Txt>
      </View>
    </>
  );
  const style = [styles.item, !n.read && styles.unread];
  return n.href ? (
    <PressableScale onPress={() => router.push(n.href as Href)} to={0.98} feedback="select" accessibilityRole="button" style={style}>{body}</PressableScale>
  ) : (
    <View style={style}>{body}</View>
  );
}

/** Shared notification centre screen used by customer, chef and admin routes. */
export function NotificationCentre({ audience, back = true }: { audience: NotificationAudience; back?: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['notifications', audience], queryFn: () => notificationService.list(audience) });
  const markAll = useMutation({
    mutationFn: () => notificationService.markAllRead(audience),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', audience] }),
  });
  const unread = query.data?.filter((n) => !n.read).length ?? 0;
  return (
    <Screen
      eyebrow={unread ? `${unread} unread` : query.data?.length ? 'All caught up' : undefined}
      title="Notifications"
      back={back}
      right={unread > 0 ? (
        <PressableScale onPress={() => !markAll.isPending && markAll.mutate()} to={0.95} accessibilityRole="button" accessibilityLabel="Mark all as read" style={styles.markAll}>
          {markAll.isPending ? <ActivityIndicator size="small" color={colors.purple} /> : <Ionicons name="checkmark-done" size={18} color={colors.purple} />}
          <Txt style={styles.markAllText} color={colors.purple}>Mark all read</Txt>
        </PressableScale>
      ) : undefined}
      refreshing={query.isRefetching}
      onRefresh={query.refetch}
    >
      <QueryView query={query} empty={{ title: 'No notifications', message: 'Updates about your bookings will appear here.', icon: 'notifications-off-outline' }}>
        {(items) => {
          const today = new Date().toDateString();
          const fresh = items.filter((n) => new Date(n.at).toDateString() === today);
          const earlier = items.filter((n) => new Date(n.at).toDateString() !== today);
          return (
            <>
              {fresh.length > 0 && (
                <Section eyebrow="Today">
                  <View style={styles.list}>{fresh.map((n) => <NotificationItem key={n.id} n={n} />)}</View>
                </Section>
              )}
              {earlier.length > 0 && (
                <Section eyebrow="Earlier">
                  <View style={styles.list}>{earlier.map((n) => <NotificationItem key={n.id} n={n} />)}</View>
                </Section>
              )}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  item: { flexDirection: 'row', gap: 12, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border },
  unread: { backgroundColor: colors.card, borderColor: 'transparent', ...shadow },
  tile: { width: 40, height: 40, borderRadius: radius.md - 2, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 7 },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primaryLight },
  markAllText: { fontFamily: fonts.medium, fontSize: 15 },
});
