import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Notice, QueryView, Screen, Segmented, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { adminService } from '../../../src/services';
import { colors } from '../../../src/theme';
import { formatDateTime } from '../../../src/utils';

type Scope = 'today' | 'upcoming';

/** Customers whose upcoming visits have no chef yet. Tap a row to pick a chef (subscriptions: all remaining visits at once). */
export default function Unassigned() {
  const [scope, setScope] = useState<Scope>('today');
  const query = useQuery({ queryKey: ['admin', 'unassigned', scope], queryFn: () => adminService.listUnassigned(scope) });
  return (
    <Screen back={false} eyebrow="Assign" title="Needs a chef" subtitle="Upcoming visits nobody is cooking yet." refreshing={query.isRefetching} onRefresh={query.refetch}>
      <Segmented options={[{ value: 'today', label: 'Today' }, { value: 'upcoming', label: 'All upcoming' }]} value={scope} onChange={setScope} />
      <QueryView
        query={query}
        isEmpty={(rows) => rows.length === 0}
        empty={{ title: 'Every visit has a chef', message: scope === 'today' ? 'Nothing left to assign today.' : 'No upcoming visit is waiting for a chef.', icon: 'checkmark-circle-outline' }}
      >
        {(rows) =>
          rows.map((r) => (
            <Card
              key={r.requestId}
              accessibilityLabel={`Assign a chef for ${r.customerName}`}
              onPress={() => router.push({ pathname: '/admin/assign/[requestId]', params: { requestId: r.requestId, ...(r.subscription ? { all: '1' } : {}) } })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Txt variant="h3" style={{ flex: 1 }}>{r.customerName}</Txt>
                {r.needsManual ? <Badge tone="warning" label="Clash" /> : r.visitsToday > 0 ? <Badge tone="error" label="Today" /> : null}
              </View>
              <Txt variant="small">{SERVICE_LABELS[r.service]} · {r.visits} visit{r.visits === 1 ? '' : 's'} without a chef</Txt>
              <Txt variant="small" color={colors.textMuted}>Next: {formatDateTime(r.nextVisitAt)}</Txt>
            </Card>
          ))
        }
      </QueryView>
      <Notice>Clash: the visit overlaps another booking of the same customer. Open the request to reschedule it before assigning.</Notice>
    </Screen>
  );
}
