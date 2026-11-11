import React, { useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Screen, Segmented, Txt } from '../../../../src/components';
import { Row } from '../../../../src/features/admin';
import { QueryView } from '../../../../src/components';
import { adminService } from '../../../../src/services';
import type { Chef } from '../../../../src/types';
import { formatDate } from '../../../../src/utils';

type Tab = 'pending' | 'approved' | 'rejected';
const inTab = (c: Chef, tab: Tab) =>
  tab === 'pending' ? c.status === 'submitted' || c.status === 'under_review' : c.status === tab;

/** Super Admin: chef application approval queue. */
export default function ChefApplications() {
  const [tab, setTab] = useState<Tab>('pending');
  const query = useQuery({ queryKey: ['admin', 'chefs'], queryFn: adminService.listChefApplications });
  const count = (t: Tab) => (query.data ?? []).filter((c) => inTab(c, t)).length;
  return (
    <Screen eyebrow="Super Admin" title="Chef applications" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <Segmented
        options={[
          { value: 'pending', label: `Pending (${count('pending')})` },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <QueryView query={query} isEmpty={(cs) => !cs.some((c) => inTab(c, tab))} empty={{ title: 'No applications here', icon: 'person-add-outline' }}>
        {(cs) =>
          cs.filter((c) => inTab(c, tab)).map((c) => (
            <Card key={c.id} onPress={() => router.push(`/admin/super/chef-applications/${c.id}`)}>
              <Row>
                <Txt variant="h3" style={{ flex: 1 }}>{c.name}</Txt>
                <Badge status={c.status} />
              </Row>
              <Txt variant="small">{c.area}, {c.city} · {c.experienceYears} yrs · {c.cuisines.join(', ')}</Txt>
              <Txt variant="caption">Applied {formatDate(c.joinedAt)}</Txt>
            </Card>
          ))
        }
      </QueryView>
    </Screen>
  );
}
