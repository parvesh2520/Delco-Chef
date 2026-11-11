import React from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Screen } from '../../../src/components';
import { RequestCard } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { adminService } from '../../../src/services';
import type { ServiceRequest } from '../../../src/types';

const needsAction = (r: ServiceRequest) => r.status === 'pending_assignment' || r.status === 'awaiting_decision';

/** Request queue: only requests needing ops action. */
export default function RequestQueue() {
  const query = useQuery({ queryKey: ['admin', 'requests'], queryFn: () => adminService.listRequests() });
  return (
    <Screen
      back={false}
      eyebrow="Request queue"
      title="Needs action"
      subtitle="New requests to assign and trials awaiting a customer decision."
      right={<Button title="All bookings" variant="ghost" small onPress={() => router.push('/admin/bookings')} />}
      refreshing={query.isRefetching}
      onRefresh={query.refetch}
    >
      <QueryView
        query={query}
        isEmpty={(rs) => !rs.some(needsAction)}
        empty={{ title: 'Queue is clear', message: 'No requests need action right now.', icon: 'checkmark-done-outline' }}
      >
        {(rs) => rs.filter(needsAction).map((r) => <RequestCard key={r.id} r={r} />)}
      </QueryView>
    </Screen>
  );
}
