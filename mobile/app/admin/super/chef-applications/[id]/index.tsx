import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, ConfirmDialog, InfoRow, ListGroup, ListRow, Notice, Screen, Section, Txt } from '../../../../../src/components';
import { Row, useAdminInvalidate } from '../../../../../src/features/admin';
import { QueryView } from '../../../../../src/components';
import { adminService } from '../../../../../src/services';
import { useToast } from '../../../../../src/store';
import type { Chef } from '../../../../../src/types';
import { formatDate } from '../../../../../src/utils';

/** Super Admin: review a chef application and approve / reject it. */
export default function ChefApplication() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const invalidate = useAdminInvalidate();
  const query = useQuery({ queryKey: ['admin', 'chefs'], queryFn: adminService.listChefApplications, select: (cs: Chef[]) => cs.find((c) => c.id === id) ?? null });
  const decide = useMutation({
    mutationFn: (reason: string) => adminService.decideChefApplication(id, decision === 'approve', reason || undefined),
    onSuccess: async (c) => {
      setDecision(null);
      await invalidate();
      useToast.getState().show(c.status === 'approved' ? 'Chef approved' : 'Application rejected');
    },
  });
  return (
    <Screen eyebrow="Super Admin" title="Chef application">
      <QueryView query={query} empty={{ title: 'Application not found' }}>
        {(c) => {
          const pending = c.status === 'submitted' || c.status === 'under_review';
          const docsVerified = c.documents.every((d) => d.status === 'verified');
          return (
            <>
              <Card tone="cream">
                <Row gap={12}>
                  <Avatar name={c.name} size={52} />
                  <Txt variant="h2" style={{ flex: 1 }}>{c.name}</Txt>
                  <Badge status={c.status} />
                </Row>
              </Card>
              <Card>
                <InfoRow label="Phone" value={`+91 ${c.phone}`} icon="call-outline" />
                <InfoRow label="Area" value={`${c.area}, ${c.city}`} icon="location-outline" />
                <InfoRow label="Experience" value={`${c.experienceYears} years`} icon="ribbon-outline" />
                <InfoRow label="Cuisines" value={c.cuisines.join(', ')} icon="restaurant-outline" />
                <InfoRow label="Specialities" value={c.specialities} icon="sparkles-outline" />
                <InfoRow label="Applied" value={formatDate(c.joinedAt)} icon="calendar-outline" />
                <InfoRow label="Bank" value={c.bank ? `${c.bank.accountNumberMasked} · ${c.bank.ifsc}` : 'Not provided'} icon="card-outline" />
              </Card>
              <Section title="Documents">
                <ListGroup>
                  <ListRow
                    icon="document-lock-outline"
                    title={`${c.documents.length} documents`}
                    subtitle={docsVerified ? 'All verified' : `${c.documents.filter((d) => d.status === 'pending').length} pending review`}
                    onPress={() => router.push(`/admin/super/chef-applications/${c.id}/documents`)}
                  />
                </ListGroup>
              </Section>
              {c.rejectionReason && <Notice tone="error">Rejected: {c.rejectionReason}</Notice>}
              {pending ? (
                <>
                  <Notice>Only approved chefs can receive assignments.</Notice>
                  <Button title="Approve chef" icon="checkmark-circle-outline" onPress={() => setDecision('approve')} />
                  <Button title="Reject application" variant="secondary" onPress={() => setDecision('reject')} />
                </>
              ) : null}
            </>
          );
        }}
      </QueryView>
      <ConfirmDialog
        visible={decision !== null}
        title={decision === 'approve' ? 'Approve this chef?' : 'Reject this application?'}
        message={decision === 'approve' ? 'The chef will be able to receive assignments.' : 'The chef will see this reason and can re-apply.'}
        confirmLabel={decision === 'approve' ? 'Approve' : 'Reject'}
        destructive={decision === 'reject'}
        inputLabel={decision === 'reject' ? 'Rejection reason' : undefined}
        loading={decide.isPending}
        onCancel={() => setDecision(null)}
        onConfirm={(reason) => decide.mutate(reason)}
      />
    </Screen>
  );
}
