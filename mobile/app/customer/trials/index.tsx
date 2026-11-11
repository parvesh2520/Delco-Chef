import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, ListGroup, ListRow, QueryView, Screen, Section, Txt } from '../../../src/components';
import { BOOKABLE_SERVICES, SERVICE_LABELS } from '../../../src/constants';
import { bookingService } from '../../../src/services';
import { formatDate } from '../../../src/utils';

/** Trial status, grouped per subscription service with its own trial limit. */
export default function Trials() {
  const trials = useQuery({ queryKey: ['trials'], queryFn: bookingService.listMyTrials });
  const elig = useQueries({
    queries: BOOKABLE_SERVICES.map((s) => ({ queryKey: ['eligibility', s], queryFn: () => bookingService.getEligibility(s) })),
  });
  return (
    <Screen eyebrow="Free trials" title="Trial status" refreshing={trials.isRefetching} onRefresh={trials.refetch}>
      <QueryView query={trials} isEmpty={() => false}>
        {(all) =>
          BOOKABLE_SERVICES.map((service, i) => {
            const list = all.filter((t) => t.service === service).sort((a, b) => a.number - b.number);
            const e = elig[i].data;
            return (
              <Section key={service} eyebrow={SERVICE_LABELS[service]}>
                <Card tone="cream">
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt variant="label">Trials used</Txt>
                    <Txt variant="h3">{e ? `${e.trialsUsed} of ${e.maxTrials}` : '…'}</Txt>
                  </View>
                </Card>
                {list.length ? (
                  <ListGroup>
                    {list.map((t) => (
                      <ListRow
                        key={t.id}
                        icon="restaurant-outline"
                        title={`Trial ${t.number} · ${formatDate(t.date)}`}
                        subtitle={t.chefName ?? 'Chef to be assigned by Delco'}
                        right={<Badge status={t.decision ? `decided_${t.decision}` : t.status} label={t.decision ? `Chose: ${t.decision.replace('_', ' ')}` : undefined} />}
                        onPress={() => router.push({ pathname: '/customer/trials/[id]', params: { id: t.id } })}
                      />
                    ))}
                  </ListGroup>
                ) : (
                  <Button title="Request a free trial" variant="secondary" small onPress={() => router.push({ pathname: '/customer/services/[service]', params: { service } })} />
                )}
              </Section>
            );
          })
        }
      </QueryView>
    </Screen>
  );
}
