import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, ChipGroup, InfoRow, Screen, TextField, Txt } from '../../../src/components';
import { QueryView } from '../../../src/components';
import { bookingService } from '../../../src/services';

const QUICK = ['Chef declined', 'Chef unavailable', 'Customer feedback', 'Schedule change'];

/** Capture a reassignment reason, then pick a new chef from suggestions. */
export default function Reassign() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const query = useQuery({ queryKey: ['admin', 'request', requestId], queryFn: () => bookingService.getRequest(requestId) });
  const valid = reason.trim().length >= 5;
  return (
    <Screen
      title="Reassign chef"
      subtitle="A reason is required and saved in assignment history."
      footer={
        <Button
          title="Choose new chef"
          onPress={() => {
            setTouched(true);
            if (valid) router.push({ pathname: '/admin/assign/[requestId]', params: { requestId, reason: reason.trim() } });
          }}
        />
      }
    >
      <QueryView query={query} empty={{ title: 'Request not found' }}>
        {(r) => (
          <Card>
            <InfoRow label="Customer" value={r.customerName} icon="person-outline" />
            <InfoRow label="Current chef" value={r.assignedChefName ?? 'None'} icon="restaurant-outline" />
          </Card>
        )}
      </QueryView>
      <Txt variant="label">Quick reasons</Txt>
      <ChipGroup options={QUICK} value={QUICK.find((q) => q === reason)} onChange={(v) => setReason(v as string)} />
      <TextField label="Reassignment reason" value={reason} onChangeText={setReason} multiline placeholder="Why is this chef being changed?" error={touched && !valid ? 'Enter at least 5 characters' : undefined} />
    </Screen>
  );
}
