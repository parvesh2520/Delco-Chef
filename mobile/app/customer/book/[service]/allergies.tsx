import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, ChipGroup, Notice, Screen, Section, Segmented, StepProgress, TextField, Txt } from '../../../../src/components';
import { COMMON_ALLERGENS, SERVICE_LABELS } from '../../../../src/constants';
import { BookingGate } from '../../../../src/features/bookings';
import { useBookingDraft } from '../../../../src/store';
import { colors } from '../../../../src/theme';
import type { BookableService } from '../../../../src/types';

const NOTES_MAX = 500;

/** Booking step 3 — allergy information (A7: explicit Yes/No; if Yes, the detail is required). */
export default function Allergies() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <BookingGate service={service}>{(s) => <AllergyForm service={s} />}</BookingGate>;
}

function AllergyForm({ service }: { service: BookableService }) {
  const { draft, update } = useBookingDraft();
  const [touched, setTouched] = useState(false);
  const answer = draft.hasAllergies === undefined ? undefined : draft.hasAllergies ? 'yes' : 'no';
  const notes = draft.allergyNotes ?? '';
  const error =
    answer === undefined ? 'Answer Yes or No' : answer === 'yes' && !notes.trim() ? 'Describe the allergy: this detail is required when the answer is Yes' : undefined;
  const next = () => {
    setTouched(true);
    if (error) return;
    router.push({ pathname: '/customer/book/[service]/instructions', params: { service } });
  };
  return (
    <Screen eyebrow={SERVICE_LABELS[service]} title="Allergy information" subtitle="Your chef sees this before every visit." footer={<Button title="Next: special instructions" onPress={next} />}>
      <StepProgress step={3} total={5} label="Allergies" />
      <Section title="Does anyone in your household have a food allergy?">
        <Segmented
          options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]}
          value={answer as 'yes' | 'no'}
          onChange={(v) => update(v === 'yes' ? { hasAllergies: true } : { hasAllergies: false, allergies: [], allergyNotes: undefined })}
        />
      </Section>
      {answer === 'yes' && (
        <>
          <Notice tone="warning" icon="medkit-outline">Tell us about every allergy in your household, even mild ones.</Notice>
          <Section title="Allergens (select all that apply)">
            <ChipGroup multi options={COMMON_ALLERGENS} value={draft.allergies ?? []} onChange={(v) => update({ allergies: v as string[] })} />
          </Section>
          <TextField
            label="Allergy details (required)"
            multiline
            maxLength={NOTES_MAX}
            value={notes}
            onChangeText={(allergyNotes) => update({ allergyNotes })}
            placeholder="Who is allergic, severity, ingredients to avoid…"
            error={touched && error && answer === 'yes' ? error : undefined}
            hint={`${notes.length}/${NOTES_MAX}`}
          />
        </>
      )}
      {touched && error && answer === undefined && <Txt variant="small" color={colors.error}>{error}</Txt>}
    </Screen>
  );
}
