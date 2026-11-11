import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card, InfoRow, Notice, Screen } from '../../../../src/components';
import { SERVICE_LABELS } from '../../../../src/constants';
import { useAdminInvalidate } from '../../../../src/features/admin';
import { QueryView } from '../../../../src/components';
import { adminService, bookingService } from '../../../../src/services';
import { useToast } from '../../../../src/store';

/** Final confirmation before assigning / reassigning a chef. */
export default function ConfirmAssignment() {
  const { requestId, chefId, reason } = useLocalSearchParams<{ requestId: string; chefId: string; reason?: string }>();
  const invalidate = useAdminInvalidate();
  const request = useQuery({ queryKey: ['admin', 'request', requestId], queryFn: () => bookingService.getRequest(requestId) });
  const suggestions = useQuery({ queryKey: ['admin', 'suggestions', requestId], queryFn: () => adminService.getSuggestions(requestId) });
  const chef = suggestions.data?.find((s) => s.chefId === chefId);
  const assign = useMutation({
    mutationFn: () => adminService.assignChef(requestId, chefId, reason),
    onSuccess: async () => {
      await invalidate();
      useToast.getState().show(reason ? 'Chef reassigned' : 'Chef assigned');
      router.dismissTo(`/admin/request/${requestId}`);
    },
  });
  return (
    <Screen
      eyebrow={reason ? 'Reassign' : 'Assign'}
      title="Confirm assignment"
      footer={<Button title={reason ? 'Confirm reassignment' : 'Confirm assignment'} loading={assign.isPending} disabled={!chef?.eligible} onPress={() => assign.mutate()} />}
    >
      <QueryView query={request} empty={{ title: 'Request not found' }}>
        {(r) => (
          <Card>
            <InfoRow label="Customer" value={r.customerName} icon="person-outline" />
            <InfoRow label="Service" value={SERVICE_LABELS[r.service]} icon="restaurant-outline" />
            <InfoRow label="Slot" value={r.requirements.slot} icon="time-outline" />
            <InfoRow label="Current chef" value={r.assignedChefName ?? 'None'} icon="swap-horizontal-outline" />
            <InfoRow label="New chef" value={chef ? `${chef.chefName} · score ${chef.score}` : '—'} icon="checkmark-circle-outline" />
            {reason && <InfoRow label="Reason" value={reason} icon="chatbox-ellipses-outline" />}
          </Card>
        )}
      </QueryView>
      <Notice>The chef will be notified and must accept the assignment. Customers never pick their chef.</Notice>
      {assign.isError && <Notice tone="error">{assign.error.message}</Notice>}
    </Screen>
  );
}
