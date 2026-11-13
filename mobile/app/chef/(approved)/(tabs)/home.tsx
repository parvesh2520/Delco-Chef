import React from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ListGroup, ListRow, NextActionCard, Screen, Section, StatTile, type NextAction } from '../../../../src/components';
import { AssignmentCard, isToday, nextVisitHref, useChefId, VisitCard } from '../../../../src/features/chef';
import { Skeleton } from '../../../../src/motion';
import { useSession } from '../../../../src/navigation';
import { chefService, visitService } from '../../../../src/services';
import type { Assignment, Visit } from '../../../../src/types';
import { formatDate, formatTime } from '../../../../src/utils';

const ACTIVE = ['chef_travelling', 'arrived', 'checked_in', 'cooking'];

/** Most urgent first: a job already under way, then offers waiting for an answer, then today's next job. */
function nextAction(active: Visit | undefined, offers: Assignment[], next: Visit | undefined): NextAction {
  const jobCard = (v: Visit, eyebrow: string): NextAction => {
    const cta = nextVisitHref(v);
    return {
      eyebrow, icon: v.status === 'scheduled' ? 'time-outline' : 'flame-outline', title: v.customerName,
      detail: `${formatTime(v.date)} · ${v.slot} · ${v.address.line1}`,
      note: v.allergies.length > 0 ? `Allergies: ${v.allergies.join(', ')}` : undefined,
      onPress: () => router.push(`/chef/job/${v.id}` as Href),
      actions: cta ? [{ title: cta.label, icon: 'arrow-forward', onPress: () => router.push(cta.href) }] : [],
    };
  };
  if (active) return jobCard(active, 'In progress');
  if (offers.length > 0) {
    const a = offers[0];
    return {
      eyebrow: 'Respond soon', icon: 'mail-unread-outline',
      title: offers.length === 1 ? 'New assignment offer' : `${offers.length} new assignment offers`,
      detail: `${a.kind === 'trial' ? 'Trial' : 'Subscription'} · ${formatDate(a.date)} · ${a.area}`,
      actions: [{ title: offers.length === 1 ? 'Review offer' : 'Review offers', icon: 'arrow-forward',
        onPress: () => router.push((offers.length === 1 ? `/chef/assignment/${a.id}` : '/chef/upcoming') as Href) }],
    };
  }
  if (next) return jobCard(next, 'Next job');
  return { eyebrow: 'All done', icon: 'cafe-outline', title: 'No more jobs today', detail: 'Enjoy your break. New assignments appear here.', calm: true,
    actions: [{ title: 'Upcoming assignments', icon: 'calendar-outline', onPress: () => router.push('/chef/upcoming') }] };
}

/** Chef dashboard: one "what's next" card, then today's numbers, then the rest. */
export default function ChefHome() {
  const chefId = useChefId();
  const name = useSession()?.user.fullName.split(' ')[0] || 'Chef';
  const visits = useQuery({ queryKey: ['chefVisits', chefId], queryFn: () => visitService.listChefVisits(chefId) });
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: chefService.listAssignments });

  const today = (visits.data ?? []).filter((v) => isToday(v.date) && v.status !== 'completed');
  const sorted = [...today].sort((a, b) => a.date.localeCompare(b.date));
  const active = (visits.data ?? []).find((v) => ACTIVE.includes(v.status));
  const next = sorted.find((v) => v.id !== active?.id);
  const offers = (assignments.data ?? []).filter((a) => a.status === 'offered');
  const hero = nextAction(active, offers, next);
  const heroIsOffers = !active && offers.length > 0;
  const heroVisitId = active?.id ?? (heroIsOffers ? undefined : next?.id);
  const laterJob = sorted.find((v) => v.id !== heroVisitId);

  return (
    <Screen
      back={false}
      eyebrow="Today"
      title={`Hello, ${name}`}
      refreshing={visits.isRefetching}
      onRefresh={() => {
        visits.refetch();
        assignments.refetch();
      }}
    >
      {visits.isPending || assignments.isPending ? <Skeleton height={168} radius={20} /> : <NextActionCard {...hero} />}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StatTile label="Jobs today" value={today.length} icon="restaurant-outline" onPress={() => router.push('/chef/jobs')} />
        <StatTile label="New offers" value={offers.length} icon="mail-unread-outline" highlight={offers.length > 0} onPress={() => router.push('/chef/upcoming')} />
      </View>

      {laterJob && (
        <Section eyebrow={heroIsOffers ? 'Next job' : 'Later today'}>
          <VisitCard visit={laterJob} />
        </Section>
      )}

      {!heroIsOffers && offers.length > 0 && (
        <Section eyebrow="Offers waiting for you">
          {offers.map((a) => <AssignmentCard key={a.id} assignment={a} />)}
        </Section>
      )}

      <Section eyebrow="Quick links">
        <ListGroup>
          <ListRow icon="calendar-outline" title="Upcoming assignments" onPress={() => router.push('/chef/upcoming')} />
          <ListRow icon="calendar-clear-outline" title="Off-day calendar" onPress={() => router.push('/chef/off-days')} />
          <ListRow icon="wallet-outline" title="Earnings" onPress={() => router.push('/chef/earnings')} />
        </ListGroup>
      </Section>
    </Screen>
  );
}
