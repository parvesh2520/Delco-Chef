import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChipGroup, Screen } from '../../src/components';
import { RequestCard } from '../../src/features/admin';
import { QueryView } from '../../src/components';
import { adminService } from '../../src/services';
import type { RequestStatus } from '../../src/types';
import { humanize } from '../../src/utils';

type Filter = 'all' | RequestStatus;
const FILTERS: Filter[] = ['all', 'pending_assignment', 'chef_assigned', 'trial_scheduled', 'awaiting_decision', 'awaiting_payment', 'converted', 'rejected'];

/** All booking requests with a status filter. */
export default function Bookings() {
  const [filter, setFilter] = useState<Filter>('all');
  const query = useQuery({ queryKey: ['admin', 'requests'], queryFn: () => adminService.listRequests() });
  const match = (s: RequestStatus) => filter === 'all' || s === filter;
  return (
    <Screen title="Booking requests" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <ChipGroup options={FILTERS.map((f) => ({ value: f, label: f === 'all' ? 'All' : humanize(f) }))} value={filter} onChange={(v) => setFilter(v as Filter)} />
      <QueryView query={query} isEmpty={(rs) => !rs.some((r) => match(r.status))} empty={{ title: 'No requests', message: 'No booking requests match this filter.' }}>
        {(rs) => rs.filter((r) => match(r.status)).map((r) => <RequestCard key={r.id} r={r} />)}
      </QueryView>
    </Screen>
  );
}
