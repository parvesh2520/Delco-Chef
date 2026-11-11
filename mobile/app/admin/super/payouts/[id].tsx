import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, ConfirmDialog, InfoRow, MockTag, Screen, Txt } from '../../../../src/components';
import { Row, useAdminInvalidate } from '../../../../src/features/admin';
import { QueryView } from '../../../../src/components';
import { adminService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import { formatCurrency } from '../../../../src/utils';

export default function PayoutDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const invalidate = useAdminInvalidate();
  const query = useQuery({ queryKey: ['admin', 'payout', id], queryFn: () => adminService.getPayout(id) });
  const decide = useMutation({
    mutationFn: () => adminService.decidePayout(id, decision === 'approve'),
    onSuccess: async (p) => {
      setDecision(null);
      await invalidate();
      useToast.getState().show(p.status === 'approved' ? 'Payout approved' : 'Payout rejected');
    },
  });
  return (
    <Screen eyebrow="Super Admin" title="Payout approval">
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
              <InfoRow label="Period" value={p.period} />
              <InfoRow label="Completed visits" value={p.visits} />
              <InfoRow label="Per visit (avg)" value={formatCurrency(p.amount / Math.max(1, p.visits))} />
            </Card>
            {p.status === 'pending' && (
              <>
                <Button title="Approve payout" icon="checkmark-circle-outline" onPress={() => setDecision('approve')} />
                <Button title="Reject" variant="secondary" onPress={() => setDecision('reject')} />
              </>
            )}
            <MockTag />
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
