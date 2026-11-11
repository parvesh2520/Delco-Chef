import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, CodeInput, MockTag, Screen } from '../../../../../src/components';
import { visitService } from '../../../../../src/services';

/** Check-in code entry. */
export default function ChefCheckInCode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [code, setCode] = useState('');
  const verify = useMutation({
    mutationFn: () => visitService.verifyCheckInCode(id, code),
    onSuccess: () => router.replace({ pathname: '/chef/visit/[id]/selfie', params: { id, kind: 'check_in' } }),
  });
  return (
    <Screen eyebrow="Check in" title="Enter the customer’s code" subtitle="The customer sees a 4-digit code in their app for this visit." footer={
      <Button title="Verify code" disabled={code.length !== 4} loading={verify.isPending} onPress={() => verify.mutate()} />
    }>
      <CodeInput length={4} value={code} onChange={setCode} error={verify.isError ? verify.error.message : undefined} />
      <MockTag>Geofence check pending — code is checked against mock data</MockTag>
    </Screen>
  );
}
