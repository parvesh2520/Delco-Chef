import React from 'react';
import { router } from 'expo-router';
import { Button, Card, InfoRow, Screen, StatusHero, Txt } from '../../../src/components';
import { useSignOut } from '../../../src/features/authentication';

const STEPS = [
  'Our team verifies your documents and background check.',
  'A short call to understand your cooking style.',
  'Once approved, you start receiving trial assignments near you.',
];

/** Shown right after the application is submitted. */
export default function ChefApplicationPending() {
  const signOut = useSignOut();
  return (
    <Screen back={false}>
      <StatusHero celebrate tone="warning" icon="hourglass-outline" title="Application submitted" message="Thank you! Verification usually takes 2–3 working days." />
      <Card>
        <Txt variant="h3">What happens next</Txt>
        {STEPS.map((s, i) => <InfoRow key={s} label={`Step ${i + 1}`} value={s} />)}
      </Card>
      <Button title="Check application status" onPress={() => router.replace('/chef/register/status')} />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
