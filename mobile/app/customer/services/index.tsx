import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, QueryView, Screen, Txt } from '../../../src/components';
import { NotifyMeButton, SERVICE_ICONS, ServiceStatus } from '../../../src/features/bookings';
import { bookingService } from '../../../src/services';
import { colors } from '../../../src/theme';
import { formatCurrency } from '../../../src/utils';

/** Service selection. */
export default function Services() {
  const query = useQuery({ queryKey: ['services'], queryFn: bookingService.listServices });
  return (
    <Screen eyebrow="Our services" title="Choose a service" subtitle="Every plan starts with a free trial. Delco assigns your chef.">
      <QueryView query={query}>
        {(items) =>
          items.map((s) => (
            <Card key={s.type} tone={s.available ? 'default' : 'cream'} onPress={() => router.push({ pathname: '/customer/services/[service]', params: { service: s.type } })} accessibilityLabel={s.name}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name={SERVICE_ICONS[s.type]} size={26} color={s.available ? colors.purple : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3">{s.name}</Txt>
                  <Txt variant="eyebrow">{s.tagline}</Txt>
                </View>
                {!s.available && <Badge label="Coming soon" tone="neutral" />}
              </View>
              <Txt variant="small">{s.description}</Txt>
              {s.available && s.priceFrom !== undefined && (
                <Txt variant="bodyStrong">From {formatCurrency(s.priceFrom)} {s.priceUnit}</Txt>
              )}
              {s.available && s.eligibility && <ServiceStatus e={s.eligibility} />}
              {!s.available && <View style={{ alignSelf: 'flex-start' }}><NotifyMeButton s={s} small /></View>}
            </Card>
          ))
        }
      </QueryView>
    </Screen>
  );
}
