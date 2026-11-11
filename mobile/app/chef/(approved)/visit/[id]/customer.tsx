import React from 'react';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Avatar, Button, Card, InfoRow, Screen, Section, Txt } from '../../../../../src/components';
import { DIET_LABELS } from '../../../../../src/constants';
import { AllergyNotice, mealsText, VisitGate } from '../../../../../src/features/chef';

/** Customer visit information at the door. */
export default function ChefVisitCustomer() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
            <InfoRow icon="location-outline" label="Address" value={`${v.address.line1}${v.address.line2 ? `, ${v.address.line2}` : ''}, ${v.address.city} ${v.address.pincode}`} />
            <Button title={`Call ${v.customerName.split(' ')[0]}`} variant="secondary" small icon="call-outline" onPress={() => Linking.openURL(`tel:${v.customerPhone}`)} />
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
