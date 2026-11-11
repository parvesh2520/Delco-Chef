import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, ConfirmDialog, InfoRow, Notice, Screen, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { Row, useAdminInvalidate } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { paymentService } from '../../../src/services';
import { useToast } from '../../../src/store';
import { formatCurrency, formatDateTime } from '../../../src/utils';

type Action = 'resend' | 'regenerate' | null;

/** Payment details & status with resend / regenerate link actions. */
export default function PaymentDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [action, setAction] = useState<Action>(null);
  const invalidate = useAdminInvalidate();
  const query = useQuery({ queryKey: ['admin', 'payment', id], queryFn: () => paymentService.get(id) });
  const run = useMutation({
    mutationFn: (a: Exclude<Action, null>) => (a === 'resend' ? paymentService.resendLink(id) : paymentService.regenerateLink(id)),
    onSuccess: async (_, a) => {
      setAction(null);
      await invalidate();
      useToast.getState().show(a === 'resend' ? 'Payment link resent' : 'New payment link generated');
    },
  });
  return (
    <Screen title="Payment details" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Payment not found' }}>
        {(p) => (
          <>
            <Card tone="cream">
              <Row>
                <Txt variant="h1" style={{ flex: 1 }}>{formatCurrency(p.amount)}</Txt>
                <Badge status={p.status} />
              </Row>
              <Txt variant="small">{p.customerName} · {SERVICE_LABELS[p.service]}</Txt>
            </Card>
            <Card>
              <InfoRow label="Payment ID" value={p.id} />
              <InfoRow label="Subscription" value={p.subscriptionId} />
              <InfoRow label="Link" value={p.linkUrl} />
              <InfoRow label="Created" value={formatDateTime(p.createdAt)} />
              <InfoRow label="Link expires" value={formatDateTime(p.linkExpiresAt)} />
              <InfoRow label="Attempts" value={p.attempts} />
              <InfoRow label="Paid at" value={p.paidAt ? formatDateTime(p.paidAt) : undefined} />
              <InfoRow label="Method" value={p.method} />
              <InfoRow label="Reference" value={p.reference} />
            </Card>
            {p.status === 'paid' && <Notice tone="success">Paid — the subscription is active.</Notice>}
            {(p.status === 'link_created' || p.status === 'failed' || p.status === 'pending') && (
              <Button title="Resend payment link" icon="send-outline" onPress={() => setAction('resend')} />
            )}
            {p.status === 'expired' && (
              <>
                <Notice tone="warning">This link expired. Generate a new one and share it with the customer.</Notice>
                <Button title="Regenerate link" icon="refresh-outline" onPress={() => setAction('regenerate')} />
              </>
            )}
          </>
        )}
      </QueryView>
      <ConfirmDialog
        visible={action !== null}
        title={action === 'resend' ? 'Resend payment link?' : 'Regenerate payment link?'}
        message={action === 'resend' ? 'The customer will receive the existing link again via SMS/WhatsApp.' : 'A new link with fresh validity replaces the expired one.'}
        confirmLabel={action === 'resend' ? 'Resend' : 'Regenerate'}
        loading={run.isPending}
        onCancel={() => setAction(null)}
        onConfirm={() => action && run.mutate(action)}
      />
    </Screen>
  );
}
