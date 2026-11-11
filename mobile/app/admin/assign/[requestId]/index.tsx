import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Notice, Screen, Segmented } from '../../../../src/components';
import { SuggestionCard } from '../../../../src/features/admin';
import { QueryView } from '../../../../src/components';
import { adminService } from '../../../../src/services';

/** Ranked chef suggestions: eligible (approved, in radius, slot free) vs ineligible with reasons. */
export default function ChefSuggestions() {
  const { requestId, reason } = useLocalSearchParams<{ requestId: string; reason?: string }>();
  const [tab, setTab] = useState<'eligible' | 'ineligible'>('eligible');
  const query = useQuery({ queryKey: ['admin', 'suggestions', requestId], queryFn: () => adminService.getSuggestions(requestId) });
  const eligible = (query.data ?? []).filter((s) => s.eligible).sort((a, b) => b.score - a.score);
  const ineligible = (query.data ?? []).filter((s) => !s.eligible);
  return (
    <Screen eyebrow={reason ? 'Reassign' : 'Assign'} title="Choose a chef" subtitle="Ranked by distance, rating, workload and cuisine match." refreshing={query.isRefetching} onRefresh={query.refetch}>
      <Segmented
        options={[
          { value: 'eligible', label: `Eligible (${eligible.length})` },
          { value: 'ineligible', label: `Ineligible (${ineligible.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'ineligible' && <Notice tone="warning">Ineligible chefs can’t be assigned. Only approved chefs inside the assignment radius with a free slot qualify.</Notice>}
      <QueryView
        query={query}
        isEmpty={() => (tab === 'eligible' ? eligible : ineligible).length === 0}
        empty={{ title: tab === 'eligible' ? 'No eligible chefs' : 'No exclusions', message: tab === 'eligible' ? 'Try widening the assignment radius in Settings.' : undefined, icon: 'people-outline' }}
      >
        {() =>
          tab === 'eligible'
            ? eligible.map((s, i) => (
                <SuggestionCard key={s.chefId} s={s} rank={i + 1} onPress={() => router.push({ pathname: '/admin/assign/[requestId]/chef/[chefId]', params: { requestId, chefId: s.chefId, ...(reason ? { reason } : {}) } })} />
              ))
            : ineligible.map((s) => <SuggestionCard key={s.chefId} s={s} />)
        }
      </QueryView>
    </Screen>
  );
}
