import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, ListGroup, ListRow, Notice, Screen, Section, Txt } from '../../../src/components';
import { DIET_LABELS, MEAL_LABELS, SERVICE_LABELS } from '../../../src/constants';
import { Row } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { adminService } from '../../../src/services';
import { formatDate, formatDateTime, humanize } from '../../../src/utils';

/** Booking request details with assignment actions. */
export default function RequestDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['admin', 'request', id], queryFn: () => adminService.getRequest(id) });
  return (
    <Screen title="Request details" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Request not found' }}>
        {(r) => {
          const rq = r.requirements;
          const canAssign = !r.assignedChefId || r.status === 'pending_assignment';
          const open = r.isOpen;
          return (
            <>
              <Card tone="cream">
                <Row>
                  <Txt variant="h2" style={{ flex: 1 }}>{SERVICE_LABELS[r.service]}</Txt>
                  <Badge status={r.status} />
                </Row>
                <Txt variant="caption">Request {r.id} · created {formatDateTime(r.createdAt)}</Txt>
              </Card>

              <ListGroup>
                <ListRow icon="person-outline" title={r.customerName} subtitle={`+91 ${r.customerPhone}`} onPress={() => router.push(`/admin/customer/${r.customerId}`)} />
                <ListRow icon="location-outline" title={r.address.label} subtitle={`${r.address.line1}${r.address.line2 ? `, ${r.address.line2}` : ''}, ${r.address.city} ${r.address.pincode}`} />
              </ListGroup>

              <Section title="Requirements">
                <Card>
                  <InfoRow label="Members" value={rq.members} />
                  <InfoRow label="Meals" value={rq.meals.map((m) => MEAL_LABELS[m]).join(', ')} />
                  <InfoRow label="Slot" value={rq.slot} />
                  <InfoRow label="Start date" value={formatDate(rq.startDate)} />
                  {rq.durationDays !== undefined && <InfoRow label="Duration" value={`${rq.durationDays} days`} />}
                  <InfoRow label="Diet" value={DIET_LABELS[rq.diet]} />
                  <InfoRow label="Cuisines" value={rq.cuisines.join(', ')} />
                  <InfoRow label="Instructions" value={rq.instructions} />
                </Card>
                {rq.allergies.length > 0 ? (
                  <Notice tone="error" icon="warning-outline">
                    Allergies: {rq.allergies.join(', ')}{rq.allergyNotes ? ` — ${rq.allergyNotes}` : ''}
                  </Notice>
                ) : (
                  <Notice tone="success" icon="checkmark-circle-outline">No allergies reported.</Notice>
                )}
              </Section>

              <Section title="Chef & trials">
                <Card>
                  <InfoRow label="Assigned chef" value={r.assignedChefName ?? 'Not assigned'} icon="restaurant-outline" />
                  {r.trials.map((t) => (
                    <InfoRow key={t.id} label={`Trial ${t.number}`} value={`${humanize(t.status)} · ${formatDate(t.date)}${t.decision ? ` · ${humanize(t.decision)}` : ''}`} icon="albums-outline" />
                  ))}
                </Card>
              </Section>

              {open && canAssign && <Button title="Assign chef" icon="person-add-outline" onPress={() => router.push(`/admin/assign/${r.id}`)} />}
              {open && !!r.assignedChefId && <Button title="Reassign chef" variant="secondary" icon="swap-horizontal-outline" onPress={() => router.push(`/admin/reassign/${r.id}`)} />}
              <ListGroup>
                <ListRow icon="albums-outline" title="Manage trials" onPress={() => router.push(`/admin/trial/${r.id}`)} />
                <ListRow icon="git-branch-outline" title="Assignment history" onPress={() => router.push(`/admin/assignment-history/${r.id}`)} />
              </ListGroup>
              {!open && <Notice>This request is closed. Assignment changes are disabled.</Notice>}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
