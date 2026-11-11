import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Notice, Screen, StatusHero } from '../../../src/components';

/** Payment failure and retry. */
export default function PaymentFailed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen back={false}>
      <StatusHero tone="error" icon="close-circle" title="Payment failed" message="No money was taken, or any deducted amount will be refunded by your bank within 5–7 working days.">
        <Button title="Retry payment" icon="refresh" onPress={() => router.replace({ pathname: '/customer/payment/link', params: { id } })} />
        <Button title="View payment details" variant="ghost" onPress={() => router.replace({ pathname: '/customer/payment/[id]', params: { id } })} />
      </StatusHero>
      <Notice>Your subscription stays pending until a payment succeeds.</Notice>
    </Screen>
  );
}
