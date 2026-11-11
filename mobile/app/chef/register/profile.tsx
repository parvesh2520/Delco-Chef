import React, { useState } from 'react';
import { router } from 'expo-router';
import { Button, ChipGroup, Notice, PhotoCapture, Screen, Section, StepProgress, TextField } from '../../../src/components';
import { useRegistrationExtras } from '../../../src/features/chef';
import { useChefDraft } from '../../../src/store';

const LANGUAGES = ['Hindi', 'English', 'Punjabi', 'Bengali', 'Tamil', 'Marathi'];

/** Step 2: profile information (photo, about, languages). */
export default function ChefRegisterProfile() {
  const { draft, update } = useChefDraft();
  const extras = useRegistrationExtras();
  const [tried, setTried] = useState(false);
  const hasPhoto = !!draft.documents?.photo;
  const aboutError = extras.about.trim().length < 20 ? 'Tell customers a little about yourself (20+ characters)' : undefined;
  const valid = hasPhoto && !aboutError && extras.languages.length > 0;
  const next = () => {
    setTried(true);
    if (valid) router.push('/chef/register/cuisine');
  };

  return (
    <Screen title="Profile information" footer={<Button title="Continue" onPress={next} />}>
      <StepProgress step={2} total={5} label="Profile" />
      <Section title="Profile photo">
        <PhotoCapture label="Clear, front-facing photo" icon="person-circle-outline" captured={draft.documents?.photo ? { uri: draft.documents.photo, mimeType: 'image/jpeg' } : null} onCapture={(ph) => update({ documents: { ...draft.documents, photo: ph.uri } })} front />
        {tried && !hasPhoto && <Notice tone="error">Add a profile photo.</Notice>}
      </Section>
      <TextField label="About you" multiline value={extras.about} onChangeText={(about) => extras.update({ about })} error={tried ? aboutError : undefined} placeholder="Years in home kitchens, the food you love cooking…" />
      <Section title="Languages spoken">
        <ChipGroup multi options={LANGUAGES} value={extras.languages} onChange={(v) => extras.update({ languages: v as string[] })} />
        {tried && extras.languages.length === 0 && <Notice tone="error">Pick at least one language.</Notice>}
      </Section>
    </Screen>
  );
}
