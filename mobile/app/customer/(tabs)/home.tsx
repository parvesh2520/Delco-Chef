import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, ListGroup, ListRow, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { useSession } from '../../../src/navigation';
import { bookingService, notificationService, visitService } from '../../../src/services';
import { colors } from '../../../src/theme';
import type { ServiceRequest } from '../../../src/types';
import { formatDate, formatDateTime } from '../../../src/utils';

function openRequestHref(r: ServiceRequest) {
  const pending = r.trials.find((t) => t.status === 'completed' && !t.decision);
  if (r.status === 'awaiting_decision' && pending) return { pathname: '/customer/trials/[id]/decision', params: { id: pending.id } } as const;
  if (r.status === 'awaiting_payment' && r.subscriptionId) return { pathname: '/customer/subscriptions/[id]', params: { id: r.subscriptionId } } as const;
  return { pathname: '/customer/trials/request/[id]', params: { id: r.id } } as const;
}

export default function CustomerHome() {
  const session = useSession();
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: bookingService.listMySubscriptions });
  const visits = useQuery({ queryKey: ['visits'], queryFn: visitService.listCustomerVisits });
  const reqs = useQuery({ queryKey: ['requests'], queryFn: bookingService.listMyRequests });
  const notes = useQuery({ queryKey: ['notifications', 'customer'], queryFn: () => notificationService.list('customer') });
  const unread = notes.data?.filter((n) => !n.read).length ?? 0;

  const upcoming = (visits.data ?? [])
    .filter((v) => !['completed', 'customer_unavailable'].includes(v.status))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const activeSub = subs.data?.find((s) => s.status === 'active' || s.status === 'pending_payment');
  const open = (reqs.data ?? []).filter((r) => r.isOpen);
  const firstName = session?.user.fullName.split(' ')[0] || 'there';

  const refetch = () => Promise.all([subs.refetch(), visits.refetch(), reqs.refetch(), notes.refetch()]);

  return (
    <Screen
      back={false}
      eyebrow="Delco Chefs"
      title={`Hello, ${firstName}`}
      subtitle="Your kitchen. Your food. Your way."
      refreshing={subs.isRefetching || visits.isRefetching}
      onRefresh={refetch}
      right={
        <Pressable onPress={() => router.push('/customer/notifications')} accessibilityLabel={`Notifications, ${unread} unread`} hitSlop={10}>
          <Ionicons name="notifications-outline" size={24} color={colors.primary} />
          {unread > 0 && <View style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />}
        </Pressable>
      }
    >
      {upcoming && (
        <Card tone="plum" onPress={() => router.push({ pathname: '/customer/visit/[id]', params: { id: upcoming.id } })}>
          <Txt variant="eyebrow">Upcoming visit</Txt>
          <Txt variant="h2" color={colors.textOnDark}>{formatDateTime(upcoming.date)}</Txt>
          <Txt variant="body" color={colors.accentLight}>{upcoming.chefName} · {upcoming.slot}</Txt>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <Button title={`Code ${upcoming.checkInCode}`} variant="accent" small icon="key-outline" onPress={() => router.push({ pathname: '/customer/visit/[id]/code', params: { id: upcoming.id } })} />
            <Button title="Track chef" variant="accent" small icon="navigate-outline" onPress={() => router.push({ pathname: '/customer/visit/[id]/track', params: { id: upcoming.id } })} />
          </View>
        </Card>
      )}

      {activeSub && (
        <Section eyebrow="Your plan">
          <Card onPress={() => router.push({ pathname: '/customer/subscriptions/[id]', params: { id: activeSub.id } })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt variant="h3">{SERVICE_LABELS[activeSub.service]}</Txt>
              <Badge status={activeSub.status} />
            </View>
            <Txt variant="small">{formatDate(activeSub.startDate)} – {formatDate(activeSub.endDate)} · {activeSub.slot}</Txt>
            {activeSub.status === 'pending_payment' && <Txt variant="small" color={colors.warning}>Complete payment to activate.</Txt>}
          </Card>
        </Section>
      )}

      {open.length > 0 && (
        <Section eyebrow="In progress">
          {open.map((r) => (
            <Card key={r.id} onPress={() => router.push(openRequestHref(r))}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Txt variant="h3" style={{ flex: 1 }}>{SERVICE_LABELS[r.service]}</Txt>
                <Badge status={r.status} />
              </View>
              <Txt variant="small">Trial {r.trials.length} · {r.assignedChefName ?? 'Delco is assigning your chef'}</Txt>
            </Card>
          ))}
        </Section>
      )}

      <Card tone="accent">
        <Txt variant="h2">Bring the chef home</Txt>
        <Txt variant="body">Start with a free trial. Delco assigns a verified chef matched to your needs.</Txt>
        <Button title="Book a Chef" icon="arrow-forward" onPress={() => router.push('/customer/services')} />
      </Card>

      <Section eyebrow="Quick links">
        <ListGroup>
          <ListRow icon="albums-outline" title="Trials" subtitle="Status of your free trials" onPress={() => router.push('/customer/trials')} />
          <ListRow icon="restaurant-outline" title="Our services" onPress={() => router.push('/customer/services')} />
          <ListRow icon="location-outline" title="Manage addresses" onPress={() => router.push('/customer/settings/addresses')} />
        </ListGroup>
      </Section>
    </Screen>
  );
}
