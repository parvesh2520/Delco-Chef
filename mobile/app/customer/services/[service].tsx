import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, LoadingState, Notice, QueryView, Screen, StatusHero, Txt } from '../../../src/components';
import { isBookable } from '../../../src/constants';
import { NotifyMeButton, ServiceStatus } from '../../../src/features/bookings';
import { bookingService } from '../../../src/services';
import { useBookingDraft } from '../../../src/store';
import { colors } from '../../../src/theme';
import type { BookableService, ServiceOffering, ServiceType } from '../../../src/types';
import { formatCurrency } from '../../../src/utils';

/** Monthly Subscription / Custom Time details, or Coming Soon for Home Food / Party Mode. */
export default function ServiceDetails() {
  const { service } = useLocalSearchParams<{ service: string }>();
  const query = useQuery({ queryKey: ['services', service], queryFn: () => bookingService.getService(service as ServiceType) });
  const s = query.data;
  if (s) return s.available && isBookable(s.type) ? <BookableDetails s={s} service={s.type} /> : <ComingSoon s={s} />;
  return (
    <Screen>
      <QueryView
        query={query}
        empty={{ title: 'Service not found', icon: 'help-circle-outline', action: <Button title="See all services" small onPress={() => router.replace('/customer/services')} /> }}
      >
        {() => null}
      </QueryView>
    </Screen>
  );
}

function ComingSoon({ s }: { s: ServiceOffering }) {
  return (
    <Screen>
      <StatusHero tone="info" icon="hourglass-outline" title={`${s.name} is coming soon`} message={s.description}>
        <NotifyMeButton s={s} />
        <Notice>Right now you can book Monthly Subscription or Custom Time.</Notice>
        <Button title="Explore available services" onPress={() => router.replace('/customer/services')} />
      </StatusHero>
    </Screen>
  );
}

function BookableDetails({ s, service }: { s: ServiceOffering; service: BookableService }) {
  const elig = useQuery({ queryKey: ['eligibility', service], queryFn: () => bookingService.getEligibility(service) });
  const start = useBookingDraft((st) => st.start);
  const e = elig.data;
  const trialsLeft = e ? Math.max(0, e.maxTrials - e.trialsUsed) : 0;
  const canRequest = !!e && e.canRequest && trialsLeft > 0;
  return (
    <Screen
      eyebrow={s.tagline}
      title={s.name}
      subtitle={s.description}
      footer={
        <Button
          title="Request free trial"
          variant="accent"
          disabled={!canRequest}
          onPress={() => {
            start(service);
            router.push({ pathname: '/customer/book/[service]/requirements', params: { service } });
          }}
        />
      }
    >
      {s.priceFrom !== undefined && (
        <Card tone="plum">
          <Txt variant="eyebrow">Starting at</Txt>
          <Txt variant="h1" color={colors.textOnDark}>{formatCurrency(s.priceFrom)}</Txt>
          <Txt variant="small" color={colors.accentLight}>{s.priceUnit} · pay only after your trial</Txt>
        </Card>
      )}
      <Card>
        {s.highlights.map((h) => (
          <View key={h} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Txt variant="body" style={{ flex: 1 }}>{h}</Txt>
          </View>
        ))}
      </Card>
      {elig.isPending ? (
        <LoadingState label="Checking eligibility…" />
      ) : e ? (
        <>
          <Card tone="cream">
            <Txt variant="label">Free trials for this service</Txt>
            <Txt variant="h2">{e.trialsUsed} of {e.maxTrials} used</Txt>
            <Txt variant="small">Trial limits apply separately to each service.</Txt>
            <ServiceStatus e={e} />
          </Card>
          {!e.canRequest && e.openRequestId && (
            <>
              <Notice tone="warning" icon="alert-circle-outline">You already have an open request for this service. You can request again once it’s closed.</Notice>
              <Button title="View open request" variant="secondary" onPress={() => router.push({ pathname: '/customer/trials/request/[id]', params: { id: e.openRequestId! } })} />
            </>
          )}
          {e.canRequest && trialsLeft === 0 && (
            <Notice tone="warning">You’ve used all free trials for this service. Contact Delco support to subscribe directly.</Notice>
          )}
        </>
      ) : null}
      <Notice icon="people-outline">Delco assigns a verified chef matched to your location, slot and cuisine — you don’t need to pick one.</Notice>
    </Screen>
  );
}
