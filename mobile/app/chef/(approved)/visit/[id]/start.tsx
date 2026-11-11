import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, InfoRow, Notice, Screen } from '../../../../../src/components';
import { AllergyNotice, VisitGate } from '../../../../../src/features/chef';
import { formatDate } from '../../../../../src/utils';

/** Start travel: confirm the job, then request location. */
export default function ChefStartTravel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <VisitGate id={id}>
      {(v) => (
        <Screen eyebrow="Start travel" title={`Heading to ${v.customerName}`} footer={
          <Button title="Start travel" variant="accent" icon="navigate" disabled={v.status !== 'scheduled'} onPress={() => router.push(`/chef/visit/${v.id}/location`)} />
        }>
          <Card>
            <InfoRow icon="calendar-outline" label="Date" value={formatDate(v.date)} />
            <InfoRow icon="time-outline" label="Slot" value={v.slot} />
            <InfoRow icon="location-outline" label="Address" value={`${v.address.line1}, ${v.address.line2 ?? ''} ${v.address.city}`} />
          </Card>
          <AllergyNotice allergies={v.allergies} />
          <Notice>Start travel about 30 minutes before the slot. The customer can see your live location until you arrive.</Notice>
          {v.status !== 'scheduled' && <Notice tone="warning">Travel has already started for this visit.</Notice>}
        </Screen>
      )}
    </VisitGate>
  );
}
