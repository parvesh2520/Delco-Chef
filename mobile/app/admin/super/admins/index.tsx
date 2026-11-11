import React, { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, ConfirmDialog, Screen, Txt } from '../../../../src/components';
import { ROLE_LABELS } from '../../../../src/constants';
import { Row, useAdminInvalidate } from '../../../../src/features/admin';
import { QueryView } from '../../../../src/components';
import { adminService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import type { AdminAccount } from '../../../../src/types';

/** Super Admin: manage Ops/Super admin accounts. */
export default function AdminAccounts() {
  const [target, setTarget] = useState<AdminAccount | null>(null);
  const invalidate = useAdminInvalidate();
  const query = useQuery({ queryKey: ['admin', 'admins'], queryFn: adminService.listAdmins });
  const toggle = useMutation({
    mutationFn: (a: AdminAccount) => adminService.setAdminActive(a.id, !a.active),
    onSuccess: async (a) => {
      setTarget(null);
      await invalidate();
      useToast.getState().show(a.active ? 'Admin re-activated' : 'Admin deactivated');
    },
  });
  return (
    <Screen eyebrow="Super Admin" title="Admin accounts" footer={<Button title="Create admin" icon="person-add-outline" onPress={() => router.push('/admin/super/admins/new')} />}>
      <QueryView query={query} empty={{ title: 'No admins' }}>
        {(admins) =>
          admins.map((a) => (
            <Card key={a.id}>
              <Row>
                <Txt variant="h3" style={{ flex: 1 }}>{a.name}</Txt>
                <Badge tone={a.role === 'super_admin' ? 'info' : 'neutral'} label={ROLE_LABELS[a.role]} />
              </Row>
              <Txt variant="small">+91 {a.phone} · {a.email}</Txt>
              <Row>
                <Badge status={a.active ? 'active' : 'inactive'} />
                <Button title={a.active ? 'Deactivate' : 'Activate'} variant={a.active ? 'ghost' : 'secondary'} small onPress={() => setTarget(a)} style={{ marginLeft: 'auto' }} />
              </Row>
            </Card>
          ))
        }
      </QueryView>
      <ConfirmDialog
        visible={!!target}
        title={target?.active ? `Deactivate ${target?.name}?` : `Activate ${target?.name}?`}
        message={target?.active ? 'They will be signed out and can no longer log in.' : 'They will be able to log in again.'}
        confirmLabel={target?.active ? 'Deactivate' : 'Activate'}
        destructive={target?.active}
        loading={toggle.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={() => target && toggle.mutate(target)}
      />
    </Screen>
  );
}
