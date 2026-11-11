import React, { useState } from 'react';
import { router } from 'expo-router';
import { Button, ChipGroup, Notice, Screen, Section, StepProgress, TextField } from '../../../src/components';
import { CUISINES } from '../../../src/constants';
import { useChefDraft } from '../../../src/store';

/** Step 3: cuisine and experience. */
export default function ChefRegisterCuisine() {
  const { draft, update } = useChefDraft();
  const [tried, setTried] = useState(false);
  const years = Number(draft.experienceYears);
  const yearsError = draft.experienceYears && years >= 0 && years <= 50 ? undefined : 'Enter years of experience (0–50)';
  const cuisines = draft.cuisines ?? [];
  const valid = !yearsError && cuisines.length > 0;
  const next = () => {
    setTried(true);
    if (valid) router.push('/chef/register/documents');
  };

  return (
    <Screen title="Cuisine & experience" footer={<Button title="Continue" onPress={next} />}>
      <StepProgress step={3} total={5} label="Cuisine" />
      <TextField label="Years of cooking experience" keyboardType="number-pad" maxLength={2} value={draft.experienceYears ?? ''} onChangeText={(t) => update({ experienceYears: t.replace(/\D/g, '') })} error={tried ? yearsError : undefined} />
      <Section title="Cuisines you cook">
        <ChipGroup multi options={CUISINES} value={cuisines} onChange={(v) => update({ cuisines: v as string[] })} />
        {tried && cuisines.length === 0 && <Notice tone="error">Pick at least one cuisine.</Notice>}
      </Section>
      <TextField label="Signature dishes (optional)" multiline value={draft.specialities ?? ''} onChangeText={(specialities) => update({ specialities })} placeholder="Rajma chawal, appam and stew, millet rotis…" />
    </Screen>
  );
}
