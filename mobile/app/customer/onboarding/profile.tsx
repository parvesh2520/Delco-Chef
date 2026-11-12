import React, { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, QueryView, Screen, StepProgress, Stepper, TextField } from '../../../src/components';
import { useSignOut } from '../../../src/features/authentication';
import { DietPicker, LanguagePicker } from '../../../src/features/customer';
import { useSession } from '../../../src/navigation';
import { customerService } from '../../../src/services';
import { useAuthStore } from '../../../src/store';
import type { CustomerProfile, DietType } from '../../../src/types';
import { isValidEmail, required } from '../../../src/utils';

/** Onboarding 1/4 — customer profile setup (A5). Re-opening it shows what was saved. */
export default function OnboardingProfile() {
  const signOut = useSignOut();
  const query = useQuery({ queryKey: ['profile'], queryFn: customerService.getProfile });
  return (
    <Screen
      back={false}
      right={<Button title="Sign out" variant="ghost" small onPress={signOut} />}
      eyebrow="Get started"
      title="Tell us about you"
      subtitle="This helps your chef plan meals for your household."
    >
      <StepProgress step={1} total={4} label="Profile" />
      <QueryView query={query}>{(p) => <ProfileForm profile={p} />}</QueryView>
    </Screen>
  );
}

function ProfileForm({ profile }: { profile: CustomerProfile }) {
  const session = useSession();
  const setName = useAuthStore((s) => s.setName);
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(profile.fullName || session?.user.fullName || '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [household, setHousehold] = useState(profile.householdSize ?? 2);
  const [language, setLanguage] = useState(profile.preferredLanguage ?? 'en');
  const [diet, setDiet] = useState<DietType | undefined>(profile.diet ?? undefined);
  const [touched, setTouched] = useState(false);
  const name = fullName.trim();
  const errors = {
    name: required(name) && name.length >= 2 && name.length <= 80 ? undefined : 'Enter your full name (2 to 80 characters)',
    email: !email || isValidEmail(email) ? undefined : 'Enter a valid email or leave it blank',
    language: language ? undefined : 'Choose a language',
    diet: diet ? undefined : 'Choose a dietary preference',
  };
  const save = useMutation({
    mutationFn: () =>
      customerService.updateProfile({ fullName: name, email: email || undefined, householdSize: household, preferredLanguage: language, diet }),
    onSuccess: (p) => {
      setName(name);
      qc.setQueryData(['profile'], p);
      router.push('/customer/onboarding/address');
    },
  });
  const valid = !Object.values(errors).some(Boolean);
  const fieldErr = (k: string) => (save.error as { fields?: Record<string, string> } | null)?.fields?.[k];
  return (
    <>
      <TextField label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" maxLength={80} error={touched ? errors.name : fieldErr('fullName')} />
      <TextField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={touched ? errors.email : fieldErr('email')} hint="For receipts and data exports." />
      <Stepper label="People in household" value={household} onChange={setHousehold} min={1} max={15} />
      <LanguagePicker value={language} onChange={setLanguage} error={touched ? errors.language : fieldErr('preferredLanguage')} />
      <DietPicker value={diet} onChange={setDiet} />
      {touched && errors.diet && <Notice tone="error">{errors.diet}</Notice>}
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <Button title="Continue" loading={save.isPending} disabled={save.isPending} onPress={() => (setTouched(true), valid && !save.isPending && save.mutate())} />
    </>
  );
}
