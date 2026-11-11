import React, { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Button, Screen, StepProgress, TextField } from '../../../src/components';
import { useSession } from '../../../src/navigation';
import { useChefDraft } from '../../../src/store';
import { isValidEmail, required } from '../../../src/utils';
import { useSignOut } from '../../../src/features/authentication';

/** Chef registration — step 1: basic details. */
export default function ChefRegister() {
  const session = useSession();
  const { draft, update } = useChefDraft();
  const signOut = useSignOut();
  const [tried, setTried] = useState(false);
  if (session?.chefStatus && session.chefStatus !== 'draft') return <Redirect href="/chef/register/status" />;

  const errors = {
    fullName: required(draft.fullName) ? undefined : 'Enter your full name',
    email: draft.email && isValidEmail(draft.email) ? undefined : 'Enter a valid email',
    city: required(draft.city) ? undefined : 'Enter your city',
    area: required(draft.area) ? undefined : 'Enter your locality / sector',
  };
  const valid = Object.values(errors).every((e) => !e);
  const show = (k: keyof typeof errors) => (tried ? errors[k] : undefined);
  const next = () => {
    setTried(true);
    if (valid) router.push('/chef/register/profile');
  };

  return (
    <Screen
      back={false}
      eyebrow="Become a chef"
      title="Join Delco Chefs"
      subtitle="Cook for verified households near you. Your application takes about 10 minutes."
      right={<Button title="Sign out" variant="ghost" small onPress={signOut} />}
      footer={<Button title="Continue" onPress={next} />}
    >
      <StepProgress step={1} total={5} label="Basic details" />
      <TextField label="Full name" value={draft.fullName ?? ''} onChangeText={(fullName) => update({ fullName })} error={show('fullName')} autoCapitalize="words" />
      <TextField label="Email" value={draft.email ?? ''} onChangeText={(email) => update({ email: email.trim() })} error={show('email')} keyboardType="email-address" autoCapitalize="none" />
      <TextField label="City" value={draft.city ?? ''} onChangeText={(city) => update({ city })} error={show('city')} placeholder="Noida" />
      <TextField label="Locality / sector" value={draft.area ?? ''} onChangeText={(area) => update({ area })} error={show('area')} placeholder="Sector 76" />
    </Screen>
  );
}
