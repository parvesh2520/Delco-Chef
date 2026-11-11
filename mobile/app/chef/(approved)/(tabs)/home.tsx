import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, ListGroup, ListRow, LoadingState, Screen, Section, StatTile } from '../../../../src/components';
import { AssignmentCard, isToday, nextVisitHref, useChefId, VisitCard } from '../../../../src/features/chef';
import { useSession } from '../../../../src/navigation';
import { chefService, visitService } from '../../../../src/services';

/** Chef dashboard: today's jobs, next job, open offers, quick links. */
export default function ChefHome() {
  const chefId = useChefId();
  const name = useSession()?.user.fullName.split(' ')[0] || 'Chef';
  const visits = useQuery({ queryKey: ['chefVisits', chefId], queryFn: () => visitService.listChefVisits(chefId) });
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: chefService.listAssignments });

  const today = (visits.data ?? []).filter((v) => isToday(v.date) && v.status !== 'completed');
  const next = [...today].sort((a, b) => a.date.localeCompare(b.date))[0];
  const offers = (assignments.data ?? []).filter((a) => a.status === 'offered');
  const cta = next ? nextVisitHref(next) : null;

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
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StatTile label="Jobs today" value={today.length} icon="restaurant-outline" onPress={() => router.push('/chef/jobs')} />
        <StatTile label="New offers" value={offers.length} icon="mail-unread-outline" highlight={offers.length > 0} onPress={() => router.push('/chef/upcoming')} />
      </View>

      <Section title="Next job">
        {visits.isPending ? (
          <LoadingState />
        ) : next ? (
          <>
            <VisitCard visit={next} />
            {cta && <Button title={cta.label} variant="accent" icon="arrow-forward" onPress={() => router.push(cta.href)} />}
          </>
        ) : (
          <EmptyState icon="cafe-outline" title="No more jobs today" message="Enjoy your break. New assignments appear here." />
        )}
      </Section>

      {offers.length > 0 && (
        <Section title="Assignment offers" eyebrow="Respond soon">
          {offers.map((a) => <AssignmentCard key={a.id} assignment={a} />)}
        </Section>
      )}

      <ListGroup>
        <ListRow icon="calendar-outline" title="Upcoming assignments" onPress={() => router.push('/chef/upcoming')} />
        <ListRow icon="calendar-clear-outline" title="Off-day calendar" onPress={() => router.push('/chef/off-days')} />
        <ListRow icon="wallet-outline" title="Earnings" onPress={() => router.push('/chef/earnings')} />
      </ListGroup>
    </Screen>
  );
}
