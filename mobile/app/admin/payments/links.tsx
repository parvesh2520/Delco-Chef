import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChipGroup, Screen } from '../../../src/components';
import { PaymentCard } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { paymentService } from '../../../src/services';
import type { PaymentStatus } from '../../../src/types';
import { humanize } from '../../../src/utils';

type Filter = 'all' | PaymentStatus;
const FILTERS: Filter[] = ['all', 'link_created', 'pending', 'paid', 'failed', 'expired'];

export default function PaymentLinks() {
  const [filter, setFilter] = useState<Filter>('all');
  const query = useQuery({ queryKey: ['admin', 'payments'], queryFn: paymentService.listAll });
  const match = (s: PaymentStatus) => filter === 'all' || s === filter;
  return (
    <Screen title="Payment links" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <ChipGroup options={FILTERS.map((f) => ({ value: f, label: f === 'all' ? 'All' : humanize(f) }))} value={filter} onChange={(v) => setFilter(v as Filter)} />
      <QueryView query={query} isEmpty={(ps) => !ps.some((p) => match(p.status))} empty={{ title: 'No payment links', icon: 'link-outline' }}>
        {(ps) => ps.filter((p) => match(p.status)).map((p) => <PaymentCard key={p.id} p={p} />)}
      </QueryView>
    </Screen>
  );
}
