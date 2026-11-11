import React from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Notice, Screen, Txt } from '../../../../src/components';
import { Row } from '../../../../src/features/admin';
import { QueryView } from '../../../../src/components';
import { adminService } from '../../../../src/services';
import { formatCurrency } from '../../../../src/utils';

/** Super Admin: chef payout approvals (optional Part G). */
export default function Payouts() {
  const query = useQuery({ queryKey: ['admin', 'payouts'], queryFn: adminService.listPayouts });
  return (
    <Screen eyebrow="Super Admin" title="Payouts" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <Notice>Optional feature (Part G). Approval only — no money is transferred from the app.</Notice>
      <QueryView query={query} empty={{ title: 'No payouts', icon: 'wallet-outline' }}>
        {(ps) =>
          ps.map((p) => (
            <Card key={p.id} onPress={() => router.push(`/admin/super/payouts/${p.id}`)}>
              <Row>
                <Txt variant="h3" style={{ flex: 1 }}>{p.chefName}</Txt>
                <Badge status={p.status} />
              </Row>
              <Txt variant="small">{p.period} · {p.visits} visits · {formatCurrency(p.amount)}</Txt>
            </Card>
          ))
        }
      </QueryView>
    </Screen>
  );
}
