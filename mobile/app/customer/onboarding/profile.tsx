import React, { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, Screen, StepProgress, Stepper, TextField } from '../../../src/components';
import { useSignOut } from '../../../src/features/authentication';
import { useSession } from '../../../src/navigation';
import { customerService } from '../../../src/services';
import { useAuthStore } from '../../../src/store';
import { isValidEmail, required } from '../../../src/utils';

/** Onboarding 1/4 — customer profile setup. */
export default function OnboardingProfile() {
  const session = useSession();
  const setName = useAuthStore((s) => s.setName);
  const signOut = useSignOut();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(session?.user.fullName ?? '');
  const [email, setEmail] = useState('');
  const [household, setHousehold] = useState(2);
  const [touched, setTouched] = useState(false);
  const errors = {
    name: required(fullName) && fullName.trim().length >= 2 ? undefined : 'Enter your full name',
    email: !email || isValidEmail(email) ? undefined : 'Enter a valid email or leave it blank',
  };
  const save = useMutation({
    mutationFn: () => customerService.updateProfile({ fullName: fullName.trim(), email: email || undefined, householdSize: household }),
    onSuccess: () => {
      setName(fullName.trim());
      qc.invalidateQueries({ queryKey: ['profile'] });
      router.push('/customer/onboarding/address');
    },
  });
  const valid = !errors.name && !errors.email;
  return (
    <Screen
      back={false}
      right={<Button title="Sign out" variant="ghost" small onPress={signOut} />}
      eyebrow="Get started"
      title="Tell us about you"
      subtitle="This helps your chef plan meals for your household."
      footer={<Button title="Continue" loading={save.isPending} onPress={() => (setTouched(true), valid && save.mutate())} />}
    >
      <StepProgress step={1} total={4} label="Profile" />
      <TextField label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" error={touched ? errors.name : undefined} />
      <TextField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={touched ? errors.email : undefined} hint="For receipts and data exports." />
      <Stepper label="People in household" value={household} onChange={setHousehold} min={1} max={15} />
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
    </Screen>
  );
}
