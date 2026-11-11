import React from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationService, type NotificationAudience } from '../services';
import { colors } from '../theme';
import { formatDateTime } from '../utils';
import { Button } from './Button';
import { Card } from './Card';
import { Screen } from './Screen';
import { QueryView } from './States';
import { Txt } from './Txt';

/** Shared notification centre screen used by customer, chef and admin routes. */
export function NotificationCentre({ audience, back = true }: { audience: NotificationAudience; back?: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['notifications', audience], queryFn: () => notificationService.list(audience) });
  const markAll = useMutation({
    mutationFn: () => notificationService.markAllRead(audience),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', audience] }),
  });
  return (
    <Screen
      title="Notifications"
      back={back}
      right={<Button title="Mark all read" variant="ghost" small onPress={() => markAll.mutate()} loading={markAll.isPending} />}
      refreshing={query.isRefetching}
      onRefresh={query.refetch}
    >
      <QueryView query={query} empty={{ title: 'No notifications', message: 'Updates about your bookings will appear here.', icon: 'notifications-off-outline' }}>
        {(items) =>
          items.map((n) => (
            <Card key={n.id} onPress={n.href ? () => router.push(n.href as Href) : undefined} tone={n.read ? 'default' : 'cream'}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />}
                <Txt variant="h3" style={{ flex: 1 }}>{n.title}</Txt>
              </View>
              <Txt variant="body">{n.body}</Txt>
              <Txt variant="caption">{formatDateTime(n.at)}</Txt>
            </Card>
          ))
        }
      </QueryView>
    </Screen>
  );
}
