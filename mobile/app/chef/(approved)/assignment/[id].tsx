import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, ConfirmDialog, InfoRow, Notice, QueryView, Screen } from '../../../../src/components';
import { DIET_LABELS, SERVICE_LABELS } from '../../../../src/constants';
import { AllergyNotice, mealsText } from '../../../../src/features/chef';
import { chefService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import { formatDate } from '../../../../src/utils';

/** Assignment details with accept / decline. */
export default function ChefAssignment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [declining, setDeclining] = useState(false);
  const query = useQuery({ queryKey: ['assignment', id], queryFn: () => chefService.getAssignment(id) });
  const respond = useMutation({
    mutationFn: (v: { accept: boolean; reason?: string }) => chefService.respondAssignment(id, v.accept, v.reason),
    onSuccess: (a) => {
      setDeclining(false);
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['assignment', id] });
      useToast.getState().show(a.status === 'accepted' ? 'Assignment accepted' : 'Assignment declined');
      if (a.status === 'accepted' && a.visitId) router.replace(`/chef/job/${a.visitId}`);
    },
  });

  if (!query.data) {
    return (
      <Screen>
        <QueryView query={query} empty={{ title: 'Assignment not found' }}>{() => null}</QueryView>
      </Screen>
    );
  }
  const a = query.data;
  return (
        <Screen
          eyebrow={`${a.kind === 'trial' ? 'Trial' : 'Subscription'} assignment`}
          title={a.customerName}
          footer={
            a.status === 'offered' ? (
              <>
                <Button title="Accept assignment" icon="checkmark" loading={respond.isPending && !declining} onPress={() => respond.mutate({ accept: true })} />
                <Button title="Decline" variant="secondary" onPress={() => setDeclining(true)} />
              </>
            ) : undefined
          }
        >
          <Card>
            <Badge status={a.status} />
            <InfoRow icon="briefcase-outline" label="Service" value={SERVICE_LABELS[a.service]} />
            <InfoRow icon="calendar-outline" label="Date" value={formatDate(a.date)} />
            <InfoRow icon="time-outline" label="Slot" value={a.slot} />
            <InfoRow icon="location-outline" label="Area" value={`${a.area} · ${a.distanceKm} km away`} />
            <InfoRow icon="people-outline" label="Members" value={a.members} />
            <InfoRow icon="restaurant-outline" label="Meals" value={mealsText(a.meals)} />
            <InfoRow icon="leaf-outline" label="Diet" value={DIET_LABELS[a.diet]} />
            {a.instructions && <InfoRow icon="document-text-outline" label="Instructions" value={a.instructions} />}
          </Card>
          <AllergyNotice allergies={a.allergies} />
          {a.status !== 'offered' && <Notice>This assignment is {a.status}. No action needed.</Notice>}
          {respond.isError && <Notice tone="error">{respond.error.message}</Notice>}
          <ConfirmDialog
            visible={declining}
            title="Decline assignment?"
            message="Ops will reassign this job to another chef."
            inputLabel="Reason"
            confirmLabel="Decline"
            destructive
            loading={respond.isPending}
            onConfirm={(reason) => respond.mutate({ accept: false, reason })}
            onCancel={() => setDeclining(false)}
          />
        </Screen>
  );
}
