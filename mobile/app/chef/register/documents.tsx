import React, { useState } from 'react';
import { router } from 'expo-router';
import { Badge, Button, ListGroup, ListRow, MockTag, Notice, Screen, StepProgress } from '../../../src/components';
import { useChefDraft } from '../../../src/store';

const DOCS = [
  { key: 'aadhaar', title: 'Aadhaar card', subtitle: 'Front and back' },
  { key: 'pan', title: 'PAN card', subtitle: 'For payouts' },
  { key: 'police_verification', title: 'Police verification', subtitle: 'Certificate or application receipt' },
  { key: 'photo', title: 'Profile photo', subtitle: 'Captured in the previous step' },
] as const;

/** Step 4: identity and verification documents. Upload is simulated. */
export default function ChefRegisterDocuments() {
  const { draft, update } = useChefDraft();
  const [tried, setTried] = useState(false);
  const docs = draft.documents ?? {};
  const allAttached = DOCS.every((d) => !!docs[d.key]);
  const next = () => {
    setTried(true);
    if (allAttached) router.push('/chef/register/bank');
  };

  return (
    <Screen title="Documents" subtitle="Stored securely and only revealed to Super Admins during verification." footer={<Button title="Continue" onPress={next} />}>
      <StepProgress step={4} total={5} label="Documents" />
      <ListGroup>
        {DOCS.map((d) => (
          <ListRow
            key={d.key}
            icon={docs[d.key] ? 'checkmark-circle' : 'document-attach-outline'}
            title={d.title}
            subtitle={docs[d.key] ? `Attached · ${docs[d.key]}` : d.subtitle}
            right={docs[d.key] ? <Badge tone="success" label="Attached" /> : <Badge tone="warning" label="Upload" />}
            onPress={() => update({ documents: { ...docs, [d.key]: `${d.key}.jpg` } })}
          />
        ))}
      </ListGroup>
      {tried && !allAttached && <Notice tone="error">All four documents are required.</Notice>}
      <MockTag>File picker pending — tapping marks the document attached</MockTag>
    </Screen>
  );
}
