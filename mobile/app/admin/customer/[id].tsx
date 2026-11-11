import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Card, InfoRow, Screen, Section, Txt } from '../../../src/components';
import { SERVICE_LABELS } from '../../../src/constants';
import { RequestCard, Row } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { adminService } from '../../../src/services';
import { formatCurrency, formatDate } from '../../../src/utils';

/** Customer details with booking status and history. */
export default function CustomerDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['admin', 'customer', id], queryFn: () => adminService.getCustomer(id) });
  return (
    <Screen title="Customer">
      <QueryView query={query} empty={{ title: 'Customer not found' }}>
        {(c) => (
          <>
            <Card tone="cream">
              <Row gap={12}>
                <Avatar name={c.name} />
                <Txt variant="h2" style={{ flex: 1 }}>{c.name}</Txt>
              </Row>
              <InfoRow label="Phone" value={`+91 ${c.phone}`} icon="call-outline" />
              <InfoRow label="Address" value={`${c.address.line1}, ${c.address.city}`} icon="location-outline" />
            </Card>
            <Section title={`Subscriptions (${c.subscriptions.length})`}>
              {c.subscriptions.length === 0 ? (
                <Txt variant="small">No subscriptions yet.</Txt>
              ) : (
                c.subscriptions.map((s) => (
                  <Card key={s.id} onPress={s.paymentId ? () => router.push(`/admin/payments/${s.paymentId}`) : undefined}>
                    <Row>
                      <Txt variant="h3" style={{ flex: 1 }}>{SERVICE_LABELS[s.service]}</Txt>
                      <Badge status={s.status} />
                    </Row>
                    <Txt variant="small">{formatDate(s.startDate)} – {formatDate(s.endDate)} · {s.slot} · {formatCurrency(s.amount)}</Txt>
                  </Card>
                ))
              )}
            </Section>
            <Section title={`Booking history (${c.requests.length})`}>
              {c.requests.map((r) => <RequestCard key={r.id} r={r} />)}
            </Section>
          </>
        )}
      </QueryView>
    </Screen>
  );
}
