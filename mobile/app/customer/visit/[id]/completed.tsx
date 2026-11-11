import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, InfoRow, QueryView, Screen, StatusHero } from '../../../../src/components';
import { visitService } from '../../../../src/services';
import { formatDateTime, formatTime } from '../../../../src/utils';

/** Visit completed screen. */
export default function VisitCompleted() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['visit', id], queryFn: () => visitService.get(id) });
  return (
    <Screen>
      <QueryView query={query} empty={{ title: 'Visit not found' }}>
        {(v) => (
          <>
            <StatusHero icon="checkmark-done-circle" title="Visit completed" message={`${v.chefName} has finished cooking. Enjoy your meal!`} />
            <Card>
              <InfoRow label="Date" value={formatDateTime(v.date)} />
              <InfoRow label="Checked in" value={v.checkInAt ? formatTime(v.checkInAt) : undefined} />
              <InfoRow label="Checked out" value={v.checkOutAt ? formatTime(v.checkOutAt) : undefined} />
            </Card>
            {v.kind === 'trial' && (
              <Button title="Trial complete — decide next step" variant="accent" onPress={() => router.push({ pathname: '/customer/trials/[id]/complete', params: { id: v.refId } })} />
            )}
            <Button title="Back to home" variant="secondary" onPress={() => { if (router.canDismiss()) router.dismissAll(); router.navigate('/customer/home'); }} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
