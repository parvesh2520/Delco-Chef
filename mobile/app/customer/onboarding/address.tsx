import React from 'react';
import { router } from 'expo-router';
import { Screen, StepProgress } from '../../../src/components';
import { AddressForm } from '../../../src/features/customer';

/** Onboarding 2/4 — first service address. */
export default function OnboardingAddress() {
  return (
    <Screen eyebrow="Get started" title="Where should the chef come?" subtitle="We’re currently serving Bengaluru.">
      <StepProgress step={2} total={4} label="Address" />
      <AddressForm submitLabel="Save & continue" onSaved={() => router.push('/customer/onboarding/consent')} />
    </Screen>
  );
}
