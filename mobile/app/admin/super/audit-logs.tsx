import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Screen, Txt } from '../../../src/components';
import { ROLE_LABELS } from '../../../src/constants';
import { Row } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { adminService } from '../../../src/services';
import { formatDateTime } from '../../../src/utils';

/** Super Admin: audit trail of sensitive admin actions. */
export default function AuditLogs() {
  const query = useQuery({ queryKey: ['admin', 'audit'], queryFn: adminService.listAuditLogs });
  return (
    <Screen eyebrow="Super Admin" title="Audit logs" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'No audit entries', icon: 'document-text-outline' }}>
        {(logs) =>
          logs.map((l) => (
            <Card key={l.id}>
              <Row>
                <Txt variant="h3" style={{ flex: 1 }}>{l.action}</Txt>
                <Badge tone={l.actorRole === 'super_admin' ? 'info' : 'neutral'} label={ROLE_LABELS[l.actorRole]} />
              </Row>
              <Txt variant="body">{l.target}</Txt>
              <Txt variant="caption">{l.actor} · {formatDateTime(l.at)}</Txt>
            </Card>
          ))
        }
      </QueryView>
    </Screen>
  );
}
