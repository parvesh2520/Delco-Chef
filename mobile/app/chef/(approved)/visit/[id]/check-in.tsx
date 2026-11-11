import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, CodeInput, Notice, Screen } from '../../../../../src/components';
import { useCheckoutProgress } from '../../../../../src/features/chef';
import { visitService } from '../../../../../src/services';

/** Check-in code entry. */
export default function ChefCheckInCode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [code, setCode] = useState('');
  const mark = useCheckoutProgress((s) => s.mark);
  const verify = useMutation({
    mutationFn: () => visitService.verifyCheckInCode(id, code),
    onSuccess: () => {
      mark(id, 'code', code);
      router.replace({ pathname: '/chef/visit/[id]/selfie', params: { id, kind: 'check_in' } });
    },
  });
  return (
    <Screen eyebrow="Check in" title="Enter the customer’s code" subtitle="The customer sees a 4-digit code in their app for this visit." footer={
      <Button title="Verify code" disabled={code.length !== 4} loading={verify.isPending} onPress={() => verify.mutate()} />
    }>
      <CodeInput length={4} value={code} onChange={setCode} error={verify.isError ? verify.error.message : undefined} />
      <Notice>Your location is checked when you submit the selfie: you must be within the check-in radius of the customer’s address.</Notice>
    </Screen>
  );
}
