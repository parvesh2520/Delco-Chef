import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Badge, ListGroup, ListRow, NextActionCard, Screen, Section, type NextAction } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { Skeleton } from '../../../src/motion';
import { useSession } from '../../../src/navigation';
import { bookingService, notificationService, visitService } from '../../../src/services';
import { colors } from '../../../src/theme';
import type { ServiceRequest, Subscription, Visit } from '../../../src/types';
import { formatDate, formatDateTime } from '../../../src/utils';

function openRequestHref(r: ServiceRequest) {
  const pending = r.trials.find((t) => t.status === 'completed' && !t.decision);
  if (r.status === 'awaiting_decision' && pending) return { pathname: '/customer/trials/[id]/decision', params: { id: pending.id } } as const;
  if (r.status === 'awaiting_payment' && r.subscriptionId) return { pathname: '/customer/subscriptions/[id]', params: { id: r.subscriptionId } } as const;
  return { pathname: '/customer/trials/request/[id]', params: { id: r.id } } as const;
}

const subHref = (s: Subscription) => ({ pathname: '/customer/subscriptions/[id]', params: { id: s.id } }) as const;
const visitHref = (v: Visit) => ({ pathname: '/customer/visit/[id]', params: { id: v.id } }) as const;

/** The single most important thing for this customer right now, most urgent first. */
function nextAction(decision: ServiceRequest | undefined, unpaid: Subscription | undefined, upcoming: Visit | undefined, open: ServiceRequest[]): NextAction {
  if (decision) {
    return {
      eyebrow: 'Action needed', icon: 'restaurant-outline', title: 'How was your trial?',
      detail: `${SERVICE_LABELS[decision.service]} · tell us if you’d like to subscribe.`,
      actions: [{ title: 'Decide now', icon: 'arrow-forward', onPress: () => router.push(openRequestHref(decision)) }],
    };
  }
  if (unpaid) {
    return {
      eyebrow: 'Action needed', icon: 'card-outline', title: 'Complete your payment',
      detail: `${SERVICE_LABELS[unpaid.service]} · your plan starts once it’s paid.`,
      actions: [{ title: 'Pay now', icon: 'arrow-forward', onPress: () => router.push(subHref(unpaid)) }],
      onPress: () => router.push(subHref(unpaid)),
    };
  }
  if (upcoming) {
    return {
      eyebrow: 'Next visit', icon: 'time-outline', title: formatDateTime(upcoming.date),
      detail: `${upcoming.chefName} · ${upcoming.slot}`,
      onPress: () => router.push(visitHref(upcoming)),
      actions: [
        { title: 'Track chef', icon: 'navigate-outline', onPress: () => router.push({ pathname: '/customer/visit/[id]/track', params: { id: upcoming.id } }) },
        ...(upcoming.checkInCode
          ? [{ title: `Code ${upcoming.checkInCode}`, icon: 'key-outline' as const, onPress: () => router.push({ pathname: '/customer/visit/[id]/code', params: { id: upcoming.id } }) }]
          : []),
      ],
    };
  }
  const r = open[0];
  if (r) {
    return {
      eyebrow: 'In progress', icon: 'hourglass-outline',
      title: r.assignedChefName ? `${r.assignedChefName} is your chef` : 'We’re matching your chef',
      detail: `${SERVICE_LABELS[r.service]} · we’ll notify you at every step.`,
      actions: [{ title: 'View request', icon: 'arrow-forward', onPress: () => router.push(openRequestHref(r)) }],
    };
  }
  return {
    eyebrow: 'Get started', icon: 'sparkles-outline', title: 'Bring the chef home',
    detail: 'Start with a free trial. Delco assigns a verified chef matched to your needs.',
    actions: [{ title: 'Book a chef', icon: 'arrow-forward', onPress: () => router.push('/customer/services') }],
  };
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
  const activeSubs = (subs.data ?? []).filter((s) => s.status === 'active' || s.status === 'pending_payment');
  const open = (reqs.data ?? []).filter((r) => r.isOpen);
  const decision = open.find((r) => r.status === 'awaiting_decision');
  const unpaid = activeSubs.find((s) => s.status === 'pending_payment');
  const loading = subs.isPending || visits.isPending || reqs.isPending;
  const hero = nextAction(decision, unpaid, upcoming, open);
  const hasBookings = activeSubs.length > 0 || open.length > 0;
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
      {/* 1. The one thing to do next */}
      {loading ? <Skeleton height={168} radius={20} /> : <NextActionCard {...hero} />}

      {/* 2. Everything else in progress, as compact rows */}
      {hasBookings && (
        <Section eyebrow="Your bookings">
          <ListGroup>
            {activeSubs.map((s) => (
              <ListRow key={s.id} icon="repeat-outline" title={SERVICE_LABELS[s.service]} subtitle={`${formatDate(s.startDate)} – ${formatDate(s.endDate)} · ${s.slot}`}
                right={<Badge status={s.status} />} onPress={() => router.push(subHref(s))} />
            ))}
            {open.map((r) => (
              <ListRow key={r.id} icon="albums-outline" title={SERVICE_LABELS[r.service]} subtitle={`Trial ${r.trials.length} · ${r.assignedChefName ?? 'Delco is assigning your chef'}`}
                right={<Badge status={r.status} />} onPress={() => router.push(openRequestHref(r))} />
            ))}
          </ListGroup>
        </Section>
      )}

      {/* 3. Shortcuts */}
      <Section eyebrow="Quick links">
        <ListGroup>
          {hasBookings && <ListRow icon="add-circle-outline" title="Book another chef" onPress={() => router.push('/customer/services')} />}
          <ListRow icon="albums-outline" title="Trials" subtitle="Status of your free trials" onPress={() => router.push('/customer/trials')} />
          <ListRow icon="restaurant-outline" title="Our services" onPress={() => router.push('/customer/services')} />
          <ListRow icon="location-outline" title="Manage addresses" onPress={() => router.push('/customer/settings/addresses')} />
        </ListGroup>
      </Section>
    </Screen>
  );
}
