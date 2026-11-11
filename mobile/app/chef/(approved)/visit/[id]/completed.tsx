import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, InfoRow, Screen, StatusHero } from '../../../../../src/components';
import { timeOrDash, VisitGate } from '../../../../../src/features/chef';
import { formatDuration } from '../../../../../src/hooks';
import { formatDate } from '../../../../../src/utils';

/** Visit completed summary. */
export default function ChefVisitCompleted() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goHome = () => {
    if (router.canDismiss()) router.dismissAll();
    router.replace('/chef/home');
  };
  return (
    <VisitGate id={id}>
      {(v) => {
        const sec = v.checkInAt && v.checkOutAt ? Math.round((new Date(v.checkOutAt).getTime() - new Date(v.checkInAt).getTime()) / 1000) : undefined;
        return (
          <Screen back={false} footer={<Button title="Back to dashboard" onPress={goHome} />}>
            <StatusHero tone="success" icon="checkmark-done-circle-outline" title="Visit completed" message={`Great work! ${v.customerName} will be asked to rate this visit.`} />
            <Card>
              <InfoRow icon="calendar-outline" label="Date" value={formatDate(v.date)} />
              <InfoRow icon="log-in-outline" label="Checked in" value={timeOrDash(v.checkInAt)} />
              <InfoRow icon="log-out-outline" label="Checked out" value={timeOrDash(v.checkOutAt)} />
              <InfoRow icon="timer-outline" label="Duration" value={sec != null ? formatDuration(sec) : undefined} />
            </Card>
          </Screen>
        );
      }}
    </VisitGate>
  );
}
