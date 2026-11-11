import React from 'react';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, Notice, QueryView, Screen, Txt } from '../../../src/components';
import { paymentService } from '../../../src/services';
import { useToast } from '../../../src/store';
import { formatCurrency, formatDateTime } from '../../../src/utils';

/** Payment link screen. */
export default function PaymentLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['payment', id], queryFn: () => paymentService.get(id) });
  const renew = useMutation({
    mutationFn: (subscriptionId: string) => paymentService.createLink(subscriptionId),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      router.replace({ pathname: '/customer/payment/link', params: { id: p.id } });
    },
  });
  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      useToast.getState().show('Couldn’t open the payment link', 'error');
    }
  };
  return (
    <Screen eyebrow="Payment" title="Pay securely">
      <QueryView query={query} empty={{ title: 'Payment not found' }}>
        {(p) => {
          const expired = p.status === 'expired' || new Date(p.linkExpiresAt) < new Date();
          if (p.status === 'paid') {
            return <Button title="View receipt" onPress={() => router.replace({ pathname: '/customer/payment/[id]', params: { id: p.id } })} />;
          }
          return (
            <>
              <Card tone="cream">
                <Txt variant="label">Amount</Txt>
                <Txt variant="h1">{formatCurrency(p.amount)}</Txt>
                <Badge status={expired ? 'expired' : p.status} />
                <InfoRow label="Link" value={p.linkUrl} />
                <InfoRow label={expired ? 'Expired' : 'Valid until'} value={formatDateTime(p.linkExpiresAt)} />
              </Card>
              {expired ? (
                <>
                  <Notice tone="warning">This link has expired. Generate a fresh one to continue.</Notice>
                  <Button title="Generate new link" loading={renew.isPending} onPress={() => renew.mutate(p.subscriptionId)} />
                </>
              ) : (
                <>
                  <Button title="Open payment link" variant="accent" icon="open-outline" onPress={() => open(p.linkUrl)} />
                  <Button title="I’ve completed the payment" variant="secondary" onPress={() => paymentService.markAttempted(p.id).then(() => router.push({ pathname: '/customer/payment/pending', params: { id: p.id } }))} />
                  <Notice>Pay by UPI, card or net banking on the secure payment page. Return here when done.</Notice>
                </>
              )}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
