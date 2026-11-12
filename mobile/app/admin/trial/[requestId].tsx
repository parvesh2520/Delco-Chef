import React, { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, ChipGroup, ConfirmDialog, InfoRow, Notice, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { BoardHistory, CLOSABLE_STAGES, Row, STAGE_LABELS } from '../../../src/features/admin';
import { useToast } from '../../../src/store';
import { QueryView } from '../../../src/components';
import { adminService, paymentService } from '../../../src/services';
import type { ServiceRequest, Trial } from '../../../src/types';
import { formatDateTime, humanize, isNetworkError, toDateKey } from '../../../src/utils';

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
  const [pushDate, setPushDate] = useState<string>();
  const [closing, setClosing] = useState(false);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'request', requestId], queryFn: () => adminService.getRequest(requestId) });
  const moves = useQuery({ queryKey: ['admin', 'moves', requestId], queryFn: () => adminService.getBoardMoves(requestId) });
  const close = useMutation({
    mutationFn: (note: string) => adminService.moveCard(requestId, 'closed', note),
    onSuccess: () => {
      setClosing(false);
      // Board, summary, dashboard, this card and its history all change.
      qc.invalidateQueries({ queryKey: ['admin'] });
      useToast.getState().show('Card closed');
    },
    onError: () => setClosing(false),
  });
  const limit = useQuery({ queryKey: ['admin', 'settings', 'trials'], queryFn: () => adminService.getSettingsSection('trials') });
  const subId = query.data?.subscriptionId;
  const payment = useQuery({ queryKey: ['admin', 'payment-for', subId], queryFn: () => paymentService.getForSubscription(subId!), enabled: !!subId });
  const maxTrials = Number(limit.data?.fields[0]?.value ?? 2);
  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i + 1);
      return { value: toDateKey(d), label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) };
    }),
    []
  );

  return (
    <Screen title="Trial management">
      <QueryView query={query} empty={{ title: 'Request not found' }}>
        {(r) => {
          const t2 = r.trials.find((t) => t.number === 2 && t.status !== 'cancelled');
          const conv = conversion(r);
          return (
            <>
              <Card tone="cream">
                <Row>
                  <Txt variant="h2" style={{ flex: 1 }}>{r.customerName}</Txt>
                  <Badge status={r.status} />
                </Row>
                <Txt variant="small">{SERVICE_LABELS[r.service]} · {r.trials.filter((t) => t.counted).length} of {maxTrials} free trials used for this service</Txt>
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

              {r.stage === 'trial2_requested' && (
                <>
                  <Notice tone="warning">Customer requested another trial. Assign a chef from the ranked list.</Notice>
                  <Button title="Assign chef for Trial 2" variant="secondary" onPress={() => router.push(`/admin/assign/${r.id}`)} />
                </>
              )}
              {r.stage === 'trial1_awaiting_decision' && !t2 && (
                <Section title="Push second trial">
                  <Txt variant="small">Schedule Trial 2 without waiting for the customer. Pick a date, then a chef from the ranked list.</Txt>
                  <ChipGroup options={dates} value={pushDate} onChange={(v) => setPushDate(v as string)} />
                  <Button title="Choose chef & push" icon="arrow-forward-circle-outline" disabled={!pushDate}
                    onPress={() => router.push({ pathname: '/admin/assign/[requestId]', params: { requestId: r.id, push: '1', date: pushDate! } })} />
                </Section>
              )}

              <Section title="Board">
                <Card>
                  <InfoRow label="Current stage" value={STAGE_LABELS[r.stage ?? ''] ?? humanize(r.stage ?? r.status)} icon="albums-outline" />
                  {r.closedReason && <InfoRow label="Closed because" value={r.closedReason} icon="close-circle-outline" />}
                </Card>
                {r.isOpen && CLOSABLE_STAGES.includes(r.stage ?? '') ? (
                  <Button title="Close card" variant="danger" icon="close-circle-outline" loading={close.isPending} onPress={() => setClosing(true)} />
                ) : r.isOpen ? (
                  <Txt variant="caption">This card moves through assign, push, customer decisions and payment; it can’t be closed by hand at this stage.</Txt>
                ) : null}
                {close.isError && (
                  <Notice tone="error">{isNetworkError(close.error) ? 'You’re offline. Nothing was changed.' : close.error.message}</Notice>
                )}
              </Section>

              <Section title="Move history">
                {moves.isPending ? (
                  <Txt variant="small">Loading history…</Txt>
                ) : moves.isError ? (
                  <Button title="Couldn’t load history. Retry" variant="ghost" small onPress={() => moves.refetch()} />
                ) : (
                  <BoardHistory moves={moves.data} />
                )}
              </Section>

              <ConfirmDialog
                visible={closing}
                title="Close this card?"
                message={`${r.customerName} · ${SERVICE_LABELS[r.service]}. Open visits and trials on it are cancelled. This can’t be undone.`}
                confirmLabel="Close card"
                destructive
                inputLabel="Reason (shown in the history)"
                loading={close.isPending}
                onCancel={() => setClosing(false)}
                onConfirm={(note) => !close.isPending && close.mutate(note)}
              />

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
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
