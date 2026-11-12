import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Screen, StepProgress, TextField } from '../../../../src/components';
import { SERVICE_LABELS } from '../../../../src/constants';
import { BookingGate } from '../../../../src/features/bookings';
import { useBookingDraft } from '../../../../src/store';
import type { BookableService } from '../../../../src/types';

/** Booking step 4 — special instructions. */
export default function Instructions() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <BookingGate service={service}>{(s) => <InstructionsForm service={s} />}</BookingGate>;
}

function InstructionsForm({ service }: { service: BookableService }) {
  const { draft, update } = useBookingDraft();
  return (
    <Screen
      eyebrow={SERVICE_LABELS[service]}
      title="Special instructions"
      footer={<Button title="Review booking" onPress={() => router.push({ pathname: '/customer/book/[service]/confirm', params: { service } })} />}
    >
      <StepProgress step={4} total={5} label="Instructions" />
      <TextField
        label="Instructions for your chef (optional)"
        multiline
        maxLength={300}
        value={draft.instructions ?? ''}
        onChangeText={(instructions) => update({ instructions })}
        placeholder="Spice level, oil preference, kitchen tips, gate/parking info…"
        hint={`${(draft.instructions ?? '').length}/300`}
      />
    </Screen>
  );
}
