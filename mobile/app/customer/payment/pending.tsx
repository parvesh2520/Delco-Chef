import React from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, MockTag, Screen, StatusHero, Txt } from '../../../src/components';
import { paymentService } from '../../../src/services';
import { spacing } from '../../../src/theme';

/** Payment pending — polls status until the gateway confirms. */
export default function PaymentPending() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['payment', id], queryFn: () => paymentService.get(id), refetchInterval: 5000 });
  const simulate = useMutation({
    mutationFn: (success: boolean) => paymentService.simulateResult(id, success),
    onSuccess: () => ['payment', 'payments', 'subscription', 'subscriptions', 'requests', 'request', 'history'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
  const status = query.data?.status;
  if (status === 'paid') return <Redirect href={{ pathname: '/customer/payment/success', params: { id } }} />;
  if (status === 'failed') return <Redirect href={{ pathname: '/customer/payment/failed', params: { id } }} />;
  return (
    <Screen back>
      <StatusHero tone="warning" icon="hourglass-outline" title="Confirming your payment" message="This usually takes a few seconds. You can leave this screen — we’ll notify you once it’s confirmed." />
      <Card tone="cream">
        <Txt variant="label">Demo controls</Txt>
        <Txt variant="small">No payment gateway is connected in this build. Simulate the gateway result:</Txt>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button title="Simulate success" small style={{ flex: 1 }} loading={simulate.isPending && simulate.variables === true} onPress={() => simulate.mutate(true)} />
          <Button title="Simulate failure" small variant="danger" style={{ flex: 1 }} loading={simulate.isPending && simulate.variables === false} onPress={() => simulate.mutate(false)} />
        </View>
        <MockTag>Mock payment result</MockTag>
      </Card>
    </Screen>
  );
}
