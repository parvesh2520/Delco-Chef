import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, Notice, QueryView, Screen } from '../../../../src/components';
import { SERVICE_LABELS } from '../../../../src/constants';
import { bookingService } from '../../../../src/services';
import { formatDate, humanize } from '../../../../src/utils';

/** Trial details. */
export default function TrialDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['trial', id], queryFn: () => bookingService.getTrial(id) });
  return (
    <Screen eyebrow="Free trial" title="Trial details" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Trial not found' }}>
        {({ trial: t, request: r }) => (
          <>
            <Card>
              <Badge status={t.status} />
              <InfoRow label="Service" value={SERVICE_LABELS[t.service]} />
              <InfoRow label="Trial" value={`#${t.number}`} />
              <InfoRow label="Date" value={formatDate(t.date)} />
              <InfoRow label="Slot" value={t.slot} />
              <InfoRow label="Chef" value={t.chefName ?? 'Being assigned by Delco'} />
              <InfoRow label="Address" value={`${r.address.line1}, ${r.address.city}`} />
              {t.decision && <InfoRow label="Your decision" value={humanize(t.decision)} />}
            </Card>
            {t.status === 'pending_assignment' && <Notice icon="people-outline">Delco is assigning a chef for this trial.</Notice>}
            {t.visitId && t.status === 'scheduled' && (
              <Button title="View visit & check-in code" onPress={() => router.push({ pathname: '/customer/visit/[id]', params: { id: t.visitId! } })} />
            )}
            {t.status === 'completed' && (
              <Button title={t.decision ? 'Trial summary' : 'Trial complete — decide next step'} variant={t.decision ? 'secondary' : 'accent'} onPress={() => router.push({ pathname: '/customer/trials/[id]/complete', params: { id: t.id } })} />
            )}
            <Button title="View request status" variant="ghost" onPress={() => router.push({ pathname: '/customer/trials/request/[id]', params: { id: r.id } })} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
