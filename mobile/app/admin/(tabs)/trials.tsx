import React from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, QueryView, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { BOARD_COLUMNS, Row } from '../../../src/features/admin';
import { adminService } from '../../../src/services';
import { colors } from '../../../src/theme';
import { formatDate } from '../../../src/utils';

/** C5 trial board: one card per customer per service, in the server's board stages. Tap a card for history and actions. */
export default function TrialBoard() {
  const query = useQuery({ queryKey: ['admin', 'trial-board'], queryFn: adminService.listTrialBoard });
  return (
    <Screen back={false} eyebrow="Trials" title="Trial board" subtitle="Closed cards leave the board." refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'The board is empty', message: 'New trial requests appear here.', icon: 'albums-outline' }}>
        {(rs) => {
          const unknown = rs.filter((r) => !BOARD_COLUMNS.some((c) => c.stage === r.stage));
          return (
            <>
              {BOARD_COLUMNS.map((col) => {
                const items = rs.filter((r) => r.stage === col.stage);
                return (
                  <Section key={col.stage} title={`${col.title} (${items.length})`}>
                    <Txt variant="caption">{col.hint}</Txt>
                    {items.length === 0 ? (
                      <Txt variant="small" color={colors.textMuted}>No cards.</Txt>
                    ) : (
                      items.map((r) => {
                        const latest = r.trials[r.trials.length - 1];
                        return (
                          <Card key={r.id} onPress={() => router.push(`/admin/trial/${r.id}`)} accessibilityLabel={`${r.customerName}, ${col.title}`}>
                            <Row>
                              <Txt variant="h3" style={{ flex: 1 }}>{r.customerName}</Txt>
                              {latest && <Badge label={`Trial ${latest.number}`} tone="info" />}
                            </Row>
                            <Txt variant="small">
                              {SERVICE_LABELS[r.service]}
                              {latest?.date ? ` · ${formatDate(latest.date)}` : ''}
                              {` · ${latest?.chefName ?? r.assignedChefName ?? 'No chef yet'}`}
                            </Txt>
                            {r.conflict && <Badge label="Chef off-day conflict" tone="error" />}
                          </Card>
                        );
                      })
                    )}
                  </Section>
                );
              })}
              {unknown.length > 0 && <Txt variant="small">{unknown.length} card(s) in an unrecognised stage.</Txt>}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
