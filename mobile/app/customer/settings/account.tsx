import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Notice, QueryView, Screen, Section, TextField, Txt } from '../../../src/components';
import { DietPicker, LanguagePicker } from '../../../src/features/customer';
import { customerService } from '../../../src/services';
import { useAuthStore, useToast } from '../../../src/store';
import { colors } from '../../../src/theme';
import type { CustomerProfile, DietType } from '../../../src/types';
import { isValidEmail, maskPhone, required } from '../../../src/utils';

/** Account settings. */
export default function Account() {
  const query = useQuery({ queryKey: ['profile'], queryFn: customerService.getProfile });
  return (
    <Screen eyebrow="Account" title="Account settings">
      <QueryView query={query}>{(p) => <AccountForm profile={p} />}</QueryView>
    </Screen>
  );
}

const PREFS = [
  ['visits', 'Visit updates & chef arrival'],
  ['payments', 'Payment reminders & receipts'],
  ['offers', 'Offers and new services'],
] as const;

function AccountForm({ profile }: { profile: CustomerProfile }) {
  const qc = useQueryClient();
  const setName = useAuthStore((s) => s.setName);
  const [fullName, setFullName] = useState(profile.fullName);
  const [email, setEmail] = useState(profile.email ?? '');
  const [language, setLanguage] = useState(profile.preferredLanguage ?? 'en');
  const [diet, setDiet] = useState<DietType | undefined>(profile.diet ?? undefined);
  // Notification preferences are local-only until a preferences endpoint exists.
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ visits: true, payments: true, offers: false });
  const errors = { name: required(fullName) ? undefined : 'Name is required', email: !email || isValidEmail(email) ? undefined : 'Enter a valid email' };
  const save = useMutation({
    mutationFn: () => customerService.updateProfile({ fullName: fullName.trim(), email: email || undefined, preferredLanguage: language, ...(diet ? { diet } : {}) }),
    onSuccess: (p) => {
      setName(fullName.trim());
      qc.setQueryData(['profile'], p);
      useToast.getState().show('Account updated');
      router.back();
    },
  });
  return (
    <>
      <TextField label="Full name" value={fullName} onChangeText={setFullName} error={errors.name} />
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
      <LanguagePicker value={language} onChange={setLanguage} />
      <DietPicker value={diet} onChange={setDiet} />
      <Card tone="cream">
        <Txt variant="label">Mobile number</Txt>
        <Txt variant="bodyStrong">{maskPhone(profile.phone)}</Txt>
        <Txt variant="caption">Changing your number requires OTP re-verification (coming with backend auth).</Txt>
      </Card>
      <Section title="Notifications">
        <Card>
          {PREFS.map(([key, label]) => (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Txt variant="body" style={{ flex: 1 }}>{label}</Txt>
              <Switch
                value={prefs[key]}
                onValueChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))}
                trackColor={{ true: colors.purple, false: colors.border }}
                accessibilityLabel={label}
              />
            </View>
          ))}
        </Card>
      </Section>
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <Button title="Save changes" loading={save.isPending} disabled={save.isPending || !!errors.name || !!errors.email} onPress={() => !save.isPending && save.mutate()} />
    </>
  );
}
