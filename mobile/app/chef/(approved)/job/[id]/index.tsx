import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, InfoRow, ListGroup, ListRow, Screen, Txt } from '../../../../../src/components';
import { SERVICE_LABELS } from '../../../../../src/constants';
import { AllergyNotice, mealsText, nextVisitHref, VisitGate } from '../../../../../src/features/chef';
import { formatDate } from '../../../../../src/utils';

/** Job details for a visit, with the next action for its current status. */
export default function ChefJobDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <VisitGate id={id}>
      {(v) => {
        const cta = nextVisitHref(v);
        return (
          <Screen
            eyebrow={v.kind === 'trial' ? 'Trial visit' : SERVICE_LABELS[v.service]}
            title={v.customerName}
            footer={cta && <Button title={cta.label} variant="accent" icon="arrow-forward" onPress={() => router.push(cta.href)} />}
          >
            <Card>
              <Badge status={v.status} />
              <InfoRow icon="calendar-outline" label="Date" value={formatDate(v.date)} />
              <InfoRow icon="time-outline" label="Slot" value={v.slot} />
              <InfoRow icon="location-outline" label="Address" value={`${v.address.line1}${v.address.line2 ? `, ${v.address.line2}` : ''}, ${v.address.city} ${v.address.pincode}`} />
              <InfoRow icon="people-outline" label="Members" value={v.members} />
              <InfoRow icon="restaurant-outline" label="Meals" value={mealsText(v.meals)} />
            </Card>
            <AllergyNotice allergies={v.allergies} />
            <ListGroup>
              <ListRow icon="clipboard-outline" title="Customer requirements" subtitle="Diet, cuisines, allergies and instructions" onPress={() => router.push(`/chef/job/${v.id}/requirements`)} />
              {v.status !== 'completed' && v.status !== 'customer_unavailable' && (
                <ListRow icon="person-outline" title="Customer visit information" onPress={() => router.push(`/chef/visit/${v.id}/customer`)} />
              )}
            </ListGroup>
            {v.status === 'customer_unavailable' && <Txt variant="small">Reported as customer unavailable. Ops will follow up.</Txt>}
          </Screen>
        );
      }}
    </VisitGate>
  );
}
