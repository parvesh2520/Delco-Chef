import React from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, QueryView, Screen } from '../../../../src/components';
import { isToday, useChefId, VisitCard } from '../../../../src/features/chef';
import { visitService } from '../../../../src/services';

/** Today's jobs. */
export default function ChefJobs() {
  const chefId = useChefId();
  const query = useQuery({
    queryKey: ['chefVisits', chefId],
    queryFn: () => visitService.listChefVisits(chefId),
    select: (vs) => vs.filter((v) => isToday(v.date)).sort((a, b) => a.date.localeCompare(b.date)),
  });
  return (
    <Screen
      back={false}
      title="Today’s jobs"
      right={<Button title="Upcoming" variant="ghost" small icon="calendar-outline" onPress={() => router.push('/chef/upcoming')} />}
      refreshing={query.isRefetching}
      onRefresh={query.refetch}
    >
      <QueryView query={query} empty={{ title: 'No jobs today', message: 'Check upcoming assignments for the days ahead.', icon: 'cafe-outline' }}>
        {(visits) => visits.map((v) => <VisitCard key={v.id} visit={v} />)}
      </QueryView>
    </Screen>
  );
}
