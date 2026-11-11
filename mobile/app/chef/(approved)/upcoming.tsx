import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, LoadingState, Screen, Section } from '../../../src/components';
import { AssignmentCard, isFuture, useChefId, VisitCard } from '../../../src/features/chef';
import { chefService, visitService } from '../../../src/services';

/** Upcoming assignments: open offers, accepted assignments and future visits. */
export default function ChefUpcoming() {
  const chefId = useChefId();
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: chefService.listAssignments });
  const visits = useQuery({ queryKey: ['chefVisits', chefId], queryFn: () => visitService.listChefVisits(chefId) });

  if (assignments.isPending || visits.isPending) return <Screen title="Upcoming"><LoadingState /></Screen>;
  const offers = (assignments.data ?? []).filter((a) => a.status === 'offered');
  const accepted = (assignments.data ?? []).filter((a) => a.status === 'accepted' && (isFuture(a.date) || !a.visitId));
  const future = (visits.data ?? []).filter((v) => isFuture(v.date) && v.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Screen
      title="Upcoming"
      subtitle="Offers to respond to and confirmed visits."
      refreshing={assignments.isRefetching}
      onRefresh={() => {
        assignments.refetch();
        visits.refetch();
      }}
    >
      {offers.length + accepted.length + future.length === 0 && <EmptyState icon="calendar-outline" title="Nothing upcoming" message="New assignments will appear here." />}
      {offers.length > 0 && <Section title="Offers" eyebrow="Awaiting your response">{offers.map((a) => <AssignmentCard key={a.id} assignment={a} />)}</Section>}
      {accepted.length > 0 && <Section title="Accepted assignments">{accepted.map((a) => <AssignmentCard key={a.id} assignment={a} />)}</Section>}
      {future.length > 0 && <Section title="Scheduled visits">{future.map((v) => <VisitCard key={v.id} visit={v} />)}</Section>}
    </Screen>
  );
}
