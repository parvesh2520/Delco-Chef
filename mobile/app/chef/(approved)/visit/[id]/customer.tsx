import React from 'react';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Avatar, Button, Card, InfoRow, Screen, Section, Txt } from '../../../../../src/components';
import { DIET_LABELS } from '../../../../../src/constants';
import { useQuery } from '@tanstack/react-query';
import { AllergyNotice, mealsText, VisitGate } from '../../../../../src/features/chef';
import { visitService } from '../../../../../src/services';

/** Customer visit information at the door. */
export default function ChefVisitCustomer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Address & phone are released by the server only from 2 h before to 2 h after the visit.
  const contact = useQuery({ queryKey: ['visitContact', id], queryFn: () => visitService.getCustomerContact(id), retry: false });
  return (
    <VisitGate id={id}>
      {(v) => (
        <Screen eyebrow="At the customer" title="Customer information" footer={
          <>
            <Button title="Enter check-in code" icon="keypad-outline" onPress={() => router.push(`/chef/visit/${v.id}/check-in`)} />
            <Button title="Customer unavailable" variant="ghost" onPress={() => router.push(`/chef/visit/${v.id}/unavailable`)} />
          </>
        }>
          <Card tone="cream">
            <Avatar name={v.customerName} />
            <Txt variant="h2">{v.customerName}</Txt>
            {contact.data ? (
              <>
                <InfoRow icon="location-outline" label="Address" value={`${contact.data.address.line1}${contact.data.address.line2 ? `, ${contact.data.address.line2}` : ''}, ${contact.data.address.city} ${contact.data.address.pincode}`} />
                <Button title={`Call ${v.customerName.split(' ')[0]}`} variant="secondary" small icon="call-outline" onPress={() => Linking.openURL(`tel:${contact.data.phone}`)} />
              </>
            ) : (
              <Txt variant="small">{contact.isLoading ? 'Loading contact…' : contact.error?.message}</Txt>
            )}
          </Card>
          <AllergyNotice allergies={v.allergies} />
          <Card>
            <InfoRow icon="people-outline" label="Members" value={v.members} />
            <InfoRow icon="restaurant-outline" label="Meals" value={mealsText(v.meals)} />
            <InfoRow icon="leaf-outline" label="Diet" value={DIET_LABELS[v.diet]} />
          </Card>
          <Section title="Instructions">
            <Txt variant="body">{v.instructions || 'No special instructions.'}</Txt>
          </Section>
          <Txt variant="small">Ask the customer for the 4-digit check-in code shown in their app.</Txt>
        </Screen>
      )}
    </VisitGate>
  );
}
