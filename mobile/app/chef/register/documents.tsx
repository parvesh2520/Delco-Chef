import React, { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Badge, Button, ListGroup, ListRow, Notice, Screen, StepProgress, TextField } from '../../../src/components';
import { useChefDraft } from '../../../src/store';

const DOCS = [
  { key: 'aadhaar', title: 'Aadhaar card', subtitle: 'Front and back' },
  { key: 'pan', title: 'PAN card', subtitle: 'For payouts' },
  { key: 'police_verification', title: 'Police verification', subtitle: 'Certificate or application receipt' },
  { key: 'photo', title: 'Profile photo', subtitle: 'Captured in the previous step' },
] as const;

/** Step 4: identity and verification documents (JPEG/PNG images, uploaded when the application is submitted). */
export default function ChefRegisterDocuments() {
  const { draft, update } = useChefDraft();
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (key: string) => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError('Allow photo access to attach documents.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!res.canceled && res.assets?.[0]) update({ documents: { ...docs, [key]: res.assets[0].uri } });
  };
  const docs = draft.documents ?? {};
  const allAttached = DOCS.every((d) => !!docs[d.key]);
  const idError = /^\d{12}$/.test((draft.idNumber ?? '').replace(/\s/g, '')) ? undefined : 'Enter the 12-digit Aadhaar number';
  const panError = /^[A-Z]{5}\d{4}[A-Z]$/.test(draft.taxNumber ?? '') ? undefined : 'Enter a valid PAN (ABCDE1234F)';
  const next = () => {
    setTried(true);
    if (allAttached && !idError && !panError) router.push('/chef/register/bank');
  };

  return (
    <Screen title="Documents" subtitle="Stored securely and only revealed to Super Admins during verification." footer={<Button title="Continue" onPress={next} />}>
      <StepProgress step={4} total={5} label="Documents" />
      <TextField label="Aadhaar number" value={draft.idNumber ?? ''} onChangeText={(t) => update({ idNumber: t.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={12} error={tried ? idError : undefined} secureTextEntry />
      <TextField label="PAN" value={draft.taxNumber ?? ''} onChangeText={(t) => update({ taxNumber: t.toUpperCase().trim() })} autoCapitalize="characters" maxLength={10} error={tried ? panError : undefined} />
      <ListGroup>
        {DOCS.map((d) => (
          <ListRow
            key={d.key}
            icon={docs[d.key] ? 'checkmark-circle' : 'document-attach-outline'}
            title={d.title}
            subtitle={docs[d.key] ? 'Image attached · tap to replace' : d.subtitle}
            right={docs[d.key] ? <Badge tone="success" label="Attached" /> : <Badge tone="warning" label="Upload" />}
            onPress={() => pick(d.key)}
          />
        ))}
      </ListGroup>
      {tried && !allAttached && <Notice tone="error">All four documents are required.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </Screen>
  );
}
