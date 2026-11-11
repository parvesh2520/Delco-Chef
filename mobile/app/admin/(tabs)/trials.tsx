import React from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { Row } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { adminService } from '../../../src/services';
import type { RequestStatus } from '../../../src/types';
import { formatDate } from '../../../src/utils';

const COLUMNS: { title: string; statuses: RequestStatus[] }[] = [
  { title: 'Pending assignment', statuses: ['pending_assignment'] },
  { title: 'Scheduled', statuses: ['chef_assigned', 'trial_scheduled'] },
  { title: 'Awaiting decision', statuses: ['awaiting_decision'] },
  { title: 'Awaiting payment', statuses: ['awaiting_payment'] },
  { title: 'Converted', statuses: ['converted'] },
  { title: 'Rejected', statuses: ['rejected', 'cancelled'] },
];

/** Trial management board grouped by request stage. */
export default function TrialBoard() {
  const query = useQuery({ queryKey: ['admin', 'trial-board'], queryFn: adminService.listTrialBoard });
  return (
    <Screen back={false} eyebrow="Trials" title="Trial board" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'No trials yet', icon: 'albums-outline' }}>
        {(rs) =>
          COLUMNS.map((col) => {
            const items = rs.filter((r) => col.statuses.includes(r.status));
            return (
              <Section key={col.title} title={`${col.title} (${items.length})`}>
                {items.length === 0 ? (
                  <Txt variant="small">Nothing in this stage.</Txt>
                ) : (
                  items.map((r) => {
                    const latest = r.trials[r.trials.length - 1];
                    return (
                      <Card key={r.id} onPress={() => router.push(`/admin/trial/${r.id}`)}>
                        <Row>
                          <Txt variant="h3" style={{ flex: 1 }}>{r.customerName}</Txt>
                          <Badge label={`Trial ${latest.number}`} tone="info" />
                        </Row>
                        <Txt variant="small">
                          {SERVICE_LABELS[r.service]} · {formatDate(latest.date)} · {latest.chefName ?? 'Unassigned'}
                        </Txt>
                      </Card>
                    );
                  })
                )}
              </Section>
            );
          })
        }
      </QueryView>
    </Screen>
  );
}
