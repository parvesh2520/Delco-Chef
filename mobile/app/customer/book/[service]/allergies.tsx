import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, ChipGroup, Notice, Screen, Section, StepProgress, TextField } from '../../../../src/components';
import { COMMON_ALLERGENS, SERVICE_LABELS } from '../../../../src/constants';
import { BookingGate } from '../../../../src/features/bookings';
import { useBookingDraft } from '../../../../src/store';
import type { BookableService } from '../../../../src/types';

/** Booking step 3 — allergy information. */
export default function Allergies() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <BookingGate service={service}>{(s) => <AllergyForm service={s} />}</BookingGate>;
}

function AllergyForm({ service }: { service: BookableService }) {
  const { draft, update } = useBookingDraft();
  return (
    <Screen
      eyebrow={SERVICE_LABELS[service]}
      title="Allergy information"
      subtitle="Your chef sees this before every visit."
      footer={<Button title="Next: special instructions" onPress={() => router.push({ pathname: '/customer/book/[service]/instructions', params: { service } })} />}
    >
      <StepProgress step={3} total={5} label="Allergies" />
      <Notice tone="warning" icon="medkit-outline">Tell us about every allergy in your household, even mild ones.</Notice>
      <Section title="Allergens (select all that apply)">
        <ChipGroup multi options={COMMON_ALLERGENS} value={draft.allergies ?? []} onChange={(v) => update({ allergies: v as string[] })} />
      </Section>
      <TextField label="Details (optional)" multiline value={draft.allergyNotes ?? ''} onChangeText={(allergyNotes) => update({ allergyNotes })} placeholder="Who is allergic, severity, ingredients to avoid…" />
    </Screen>
  );
}
