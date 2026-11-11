import React, { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, Checkbox, Notice, Screen, StepProgress, Txt } from '../../../src/components';
import { customerService } from '../../../src/services';

/** Onboarding 3/4 — terms and location consent (both required). */
export default function Consent() {
  const [terms, setTerms] = useState(false);
  const [location, setLocation] = useState(false);
  const accept = useMutation({ mutationFn: customerService.acceptConsent, onSuccess: () => router.push('/customer/onboarding/complete') });
  return (
    <Screen
      eyebrow="Almost there"
      title="Terms & location consent"
      footer={<Button title="Agree & continue" disabled={!terms || !location} loading={accept.isPending} onPress={() => accept.mutate()} />}
    >
      <StepProgress step={3} total={4} label="Consent" />
      <Card tone="cream">
        <Txt variant="h3">How we use your information</Txt>
        <Txt variant="body">• Your address and pin are shared with your assigned chef only for scheduled visits.</Txt>
        <Txt variant="body">• While a chef is travelling to you, their live location is shown to you; your location is never tracked.</Txt>
        <Txt variant="body">• You can download or delete your data anytime from Profile.</Txt>
      </Card>
      <Checkbox checked={terms} onChange={setTerms} label="I agree to the Terms & Conditions and Refund Policy." />
      <Checkbox checked={location} onChange={setLocation} label="I consent to Delco using my address location to assign nearby chefs and verify visits." />
      {accept.isError && <Notice tone="error">{accept.error.message}</Notice>}
    </Screen>
  );
}
