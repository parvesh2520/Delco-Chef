import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Collapsible, ConfirmDialog, InfoRow, Notice, Screen, Section, TextField, Txt } from '../../../../src/components';
import { Row, useAdminInvalidate } from '../../../../src/features/admin';
import { QueryView } from '../../../../src/components';
import { adminService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import { formatCurrency, formatDate, formatDateTime } from '../../../../src/utils';

/** G3: one chef's cycle — items, held-back bookings, adjustment, approve, mark paid. Every action is audit-logged. */
export default function PayoutDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [adjRupees, setAdjRupees] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [bankRef, setBankRef] = useState('');
  const invalidate = useAdminInvalidate();
  const toast = useToast.getState().show;
  const query = useQuery({ queryKey: ['admin', 'payout', id], queryFn: () => adminService.getPayout(id) });
  const done = (msg: string) => async () => {
    await invalidate();
    await query.refetch();
    toast(msg);
  };
  const decide = useMutation({
    mutationFn: () => adminService.decidePayout(id, decision === 'approve'),
    onSuccess: async (p) => {
      setDecision(null);
      await done(p.status === 'approved' ? 'Payout approved' : 'Payout rejected')();
    },
  });
  // Rupees with up to 2 decimals, optional leading minus; sent as integer paise.
  const adjValid = /^-?\d+(\.\d{1,2})?$/.test(adjRupees.trim()) && Number(adjRupees) !== 0;
  const adjust = useMutation({
    mutationFn: () => adminService.adjustPayout(id, Math.round(Number(adjRupees) * 100), adjReason.trim()),
    onSuccess: async () => {
      setAdjRupees('');
      setAdjReason('');
      await done('Adjustment added')();
    },
  });
  const markPaid = useMutation({
    mutationFn: () => adminService.markPayoutPaid(id, bankRef.trim()),
    onSuccess: async () => {
      setBankRef('');
      await done('Marked as paid')();
    },
  });
  return (
    <Screen eyebrow="Super Admin" title="Payout">
      <QueryView query={query} empty={{ title: 'Payout not found' }}>
        {(p) => (
          <>
            <Card tone="cream">
              <Row>
                <Txt variant="h1" style={{ flex: 1 }}>{formatCurrency(p.amount)}</Txt>
                <Badge status={p.status} />
              </Row>
              <Txt variant="small">{p.chefName}</Txt>
            </Card>
            <Card>
              <InfoRow label="Cycle" value={p.period} />
              <InfoRow label="Paid visits" value={p.visits} />
              <InfoRow label="Held back" value={formatCurrency(p.heldAmount)} />
              {p.approvedAt && <InfoRow label={p.status === 'rejected' ? 'Rejected' : 'Approved'} value={`${p.approvedBy ?? '—'} · ${formatDateTime(p.approvedAt)}`} />}
              {p.paidAt && <InfoRow label="Paid" value={`${formatDateTime(p.paidAt)} · ref ${p.bankReference ?? ''}`} />}
            </Card>
            <Collapsible title={`Items (${p.items.length})`} subtitle="Paid visits and adjustments" icon="list-outline" initiallyOpen={p.items.length <= 5}>
              {p.items.length === 0 ? (
                <Txt variant="small">No payable items.</Txt>
              ) : (
                p.items.map((i) => (
                  <Card key={i.id}>
                    <Row>
                      <Txt variant="body" style={{ flex: 1 }}>{i.kind === 'visit' ? `Visit #${i.visitId}` : `Adjustment: ${i.note ?? ''}`}</Txt>
                      <Txt variant="bodyStrong">{formatCurrency(i.amount)}</Txt>
                    </Row>
                  </Card>
                ))
              )}
            </Collapsible>
            {p.heldItems.length > 0 && (
              <Collapsible title={`Held back (${p.heldItems.length})`} subtitle="Attendance still under review" icon="time-outline" initiallyOpen>
                {p.heldItems.map((h) => (
                  <Card key={h.visitId}>
                    <Row>
                      <Txt variant="body" style={{ flex: 1 }}>Visit #{h.visitId} · {formatDate(h.date)}</Txt>
                      <Txt variant="bodyStrong">{formatCurrency(h.amount)}</Txt>
                    </Row>
                  </Card>
                ))}
                <Txt variant="caption">Paid in the next cycle once the attendance review is resolved.</Txt>
              </Collapsible>
            )}
            {p.status === 'pending' && (
              <>
                <Section title="Adjustment">
                  <TextField label="Amount (₹, negative to deduct)" value={adjRupees} onChangeText={setAdjRupees} keyboardType="numbers-and-punctuation"
                    error={adjRupees.length > 0 && !adjValid ? 'Enter an amount like -50 or 120.50' : undefined} />
                  <TextField label="Reason (required)" value={adjReason} onChangeText={setAdjReason} multiline />
                  {adjust.isError && <Notice tone="error">{adjust.error.message}</Notice>}
                  <Button title="Add adjustment" variant="secondary" loading={adjust.isPending}
                    disabled={!adjValid || adjReason.trim().length < 3} onPress={() => adjust.mutate()} />
                </Section>
                <Button title="Approve payout" icon="checkmark-circle-outline" onPress={() => setDecision('approve')} />
                <Button title="Reject" variant="secondary" onPress={() => setDecision('reject')} />
                <Txt variant="caption">Once approved, the amounts can no longer change.</Txt>
              </>
            )}
            {p.status === 'approved' && (
              <Section title="Mark as paid">
                <TextField label="Bank reference" value={bankRef} onChangeText={setBankRef} autoCapitalize="characters" />
                {markPaid.isError && <Notice tone="error">{markPaid.error.message}</Notice>}
                <Button title="Mark paid" icon="cash-outline" loading={markPaid.isPending} disabled={bankRef.trim().length < 3}
                  onPress={() => markPaid.mutate()} />
              </Section>
            )}
          </>
        )}
      </QueryView>
      <ConfirmDialog
        visible={decision !== null}
        title={decision === 'approve' ? 'Approve this payout?' : 'Reject this payout?'}
        message="This action is recorded in the audit log."
        confirmLabel={decision === 'approve' ? 'Approve' : 'Reject'}
        destructive={decision === 'reject'}
        loading={decide.isPending}
        onCancel={() => setDecision(null)}
        onConfirm={() => decide.mutate()}
      />
    </Screen>
  );
}
