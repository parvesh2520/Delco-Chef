import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, InfoRow, QueryView, Screen, StatusHero } from '../../../../src/components';
import { SERVICE_LABELS } from '../../../../src/constants';
import { bookingService } from '../../../../src/services';
import { formatDate, humanize } from '../../../../src/utils';

/** Trial completion screen. */
export default function TrialComplete() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['trial', id], queryFn: () => bookingService.getTrial(id) });
  return (
    <Screen>
      <QueryView query={query} empty={{ title: 'Trial not found' }}>
        {({ trial: t, request: r }) => (
          <>
            <StatusHero art="cloche" icon="restaurant" title={`Trial ${t.number} complete`} message={`How was ${t.chefName ?? 'your chef'}’s cooking? Choose what you’d like to do next.`} />
            <Card>
              <InfoRow label="Service" value={SERVICE_LABELS[t.service]} />
              <InfoRow label="Date" value={formatDate(t.date)} />
              <InfoRow label="Chef" value={t.chefName} />
              {t.decision && <InfoRow label="Your decision" value={humanize(t.decision)} />}
            </Card>
            {t.decision ? (
              <Button title="View request status" onPress={() => router.replace({ pathname: '/customer/trials/request/[id]', params: { id: r.id } })} />
            ) : (
              <Button title="Decide next step" variant="accent" onPress={() => router.replace({ pathname: '/customer/trials/[id]/decision', params: { id: t.id } })} />
            )}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
