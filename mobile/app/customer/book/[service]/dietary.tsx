import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, ChipGroup, Screen, Section, StepProgress, TextField, Txt } from '../../../../src/components';
import { CUISINES, DIET_LABELS, SERVICE_LABELS } from '../../../../src/constants';
import { BookingGate } from '../../../../src/features/bookings';
import { useBookingDraft } from '../../../../src/store';
import { colors } from '../../../../src/theme';
import type { BookableService, DietType } from '../../../../src/types';

/** Booking step 2 — dietary preferences. */
export default function Dietary() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <BookingGate service={service}>{(s) => <DietaryForm service={s} />}</BookingGate>;
}

function DietaryForm({ service }: { service: BookableService }) {
  const { draft, update } = useBookingDraft();
  const [touched, setTouched] = useState(false);
  const error = !draft.diet ? 'Choose a diet type' : !draft.cuisines?.length ? 'Choose at least one cuisine' : undefined;
  return (
    <Screen
      eyebrow={SERVICE_LABELS[service]}
      title="Dietary preferences"
      footer={<Button title="Next: allergies" onPress={() => (setTouched(true), !error && router.push({ pathname: '/customer/book/[service]/allergies', params: { service } }))} />}
    >
      <StepProgress step={2} total={5} label="Diet" />
      <Section title="Diet type">
        <ChipGroup options={(Object.keys(DIET_LABELS) as DietType[]).map((d) => ({ value: d, label: DIET_LABELS[d] }))} value={draft.diet} onChange={(v) => update({ diet: v as DietType })} />
      </Section>
      <Section title="Preferred cuisines">
        <ChipGroup multi options={CUISINES} value={draft.cuisines ?? []} onChange={(v) => update({ cuisines: v as string[] })} />
      </Section>
      <TextField label="Anything else about your diet? (optional)" multiline value={draft.dietaryNotes ?? ''} onChangeText={(dietaryNotes) => update({ dietaryNotes })} placeholder="e.g. No onion-garlic on Tuesdays, low salt for elders" />
      {touched && error && <Txt variant="small" color={colors.error}>{error}</Txt>}
    </Screen>
  );
}
