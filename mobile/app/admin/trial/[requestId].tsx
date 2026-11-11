import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, ConfirmDialog, InfoRow, Notice, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { Row, useAdminInvalidate } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { adminService, bookingService, paymentService } from '../../../src/services';
import { useToast } from '../../../src/store';
import type { ServiceRequest, Trial } from '../../../src/types';
import { formatDateTime, humanize } from '../../../src/utils';

const decisionLabel = (t: Trial, isLast: boolean) => {
  if (t.decision) return humanize(t.decision);
  if (t.status !== 'completed') return 'Trial not completed yet';
  return isLast ? 'Waiting: Subscribe or Reject' : 'Waiting: Subscribe or Request another trial';
};

const conversion = (r: ServiceRequest) => {
  if (r.status === 'converted') return { label: 'Converted — subscription active', status: 'converted' };
  if (r.status === 'awaiting_payment') return { label: 'Awaiting payment — activates after payment', status: 'awaiting_payment' };
  if (r.status === 'rejected') return { label: 'Customer rejected after final trial', status: 'rejected' };
  return { label: 'Not converted yet', status: 'pending' };
};

/** Trial 1 / Trial 2 management for one request. */
export default function TrialManagement() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const [confirm, setConfirm] = useState(false);
  const invalidate = useAdminInvalidate();
  const query = useQuery({ queryKey: ['admin', 'request', requestId], queryFn: () => bookingService.getRequest(requestId) });
  const limit = useQuery({ queryKey: ['admin', 'settings', 'trials'], queryFn: () => adminService.getSettingsSection('trials') });
  const subId = query.data?.subscriptionId;
  const payment = useQuery({ queryKey: ['admin', 'payment-for', subId], queryFn: () => paymentService.getForSubscription(subId!), enabled: !!subId });
  const push = useMutation({
    mutationFn: () => adminService.pushSecondTrial(requestId),
    onSuccess: async () => {
      setConfirm(false);
      await invalidate();
      useToast.getState().show('Second trial pushed');
    },
  });
  const maxTrials = Number(limit.data?.fields[0]?.value ?? 2);

  return (
    <Screen title="Trial management">
      <QueryView query={query} empty={{ title: 'Request not found' }}>
        {(r) => {
          const t2 = r.trials.find((t) => t.number === 2);
          const conv = conversion(r);
          return (
            <>
              <Card tone="cream">
                <Row>
                  <Txt variant="h2" style={{ flex: 1 }}>{r.customerName}</Txt>
                  <Badge status={r.status} />
                </Row>
                <Txt variant="small">{SERVICE_LABELS[r.service]} · {r.trials.length} of {maxTrials} free trials used for this service</Txt>
              </Card>

              {[1, 2].map((n) => {
                const t = r.trials.find((x) => x.number === n);
                return (
                  <Section key={n} title={`Trial ${n}`}>
                    {t ? (
                      <Card>
                        <Row>
                          <Badge status={t.status} />
                        </Row>
                        <InfoRow label="Date" value={formatDateTime(t.date)} icon="calendar-outline" />
                        <InfoRow label="Slot" value={t.slot} icon="time-outline" />
                        <InfoRow label="Chef" value={t.chefName ?? 'Not assigned'} icon="restaurant-outline" />
                        <InfoRow label="Customer decision" value={decisionLabel(t, n >= maxTrials)} icon="hand-left-outline" />
                      </Card>
                    ) : (
                      <Txt variant="small">{n === 2 ? 'Only created if the customer requests another trial after Trial 1.' : 'Not created.'}</Txt>
                    )}
                  </Section>
                );
              })}

              {t2?.status === 'pending_assignment' && r.isOpen && (
                <>
                  <Notice tone="warning">Customer requested another trial. Assign a chef, then push Trial 2 to schedule it.</Notice>
                  {!t2.chefId && <Button title="Assign chef for Trial 2" variant="secondary" onPress={() => router.push(`/admin/assign/${r.id}`)} />}
                  <Button title="Push second trial" icon="arrow-forward-circle-outline" onPress={() => setConfirm(true)} />
                </>
              )}

              <Section title="Subscription conversion">
                <Card>
                  <Row>
                    <Badge status={conv.status} label={conv.label} />
                  </Row>
                  {payment.data && (
                    <Button title="View payment" variant="ghost" small onPress={() => router.push(`/admin/payments/${payment.data!.id}`)} />
                  )}
                </Card>
              </Section>
              {push.isError && <Notice tone="error">{push.error.message}</Notice>}
            </>
          );
        }}
      </QueryView>
      <ConfirmDialog
        visible={confirm}
        title="Push second trial?"
        message="The second trial will be scheduled and the customer notified. After it, the customer can only Subscribe or Reject."
        confirmLabel="Push trial"
        loading={push.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => push.mutate()}
      />
    </Screen>
  );
}
