import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, Notice, Screen, Section, Txt } from '../../../../src/components';
import { Row } from '../../../../src/features/admin';
import { QueryView } from '../../../../src/components';
import { adminService } from '../../../../src/services';
import { formatDate, formatTime, humanize } from '../../../../src/utils';

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');
const dist = (m?: number) => (m === undefined ? undefined : `${m} m from address`);

/** Check-in / check-out details and attendance review. */
export default function AttendanceDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['admin', 'attendance', id], queryFn: () => adminService.getAttendance(id) });
  return (
    <Screen title="Attendance review">
      <QueryView query={query} empty={{ title: 'Record not found' }}>
        {(a) => (
          <>
            <Card tone="cream">
              <Row>
                <Txt variant="h2" style={{ flex: 1 }}>{a.chefName}</Txt>
                <Badge status={a.status} />
              </Row>
              <Txt variant="small">{a.customerName} · {formatDate(a.date)} · {a.slot} · visit {a.visitId}</Txt>
            </Card>
            {a.exception && (
              <Notice tone={a.status === 'resolved' ? 'success' : 'error'} icon="warning-outline">
                Exception: {humanize(a.exception)}{a.resolution ? ` — resolved: ${a.resolution}` : ''}
              </Notice>
            )}
            <Section title="Check-in">
              <Card>
                <InfoRow label="Time" value={a.checkInAt ? formatTime(a.checkInAt) : 'Not checked in'} icon="log-in-outline" />
                <InfoRow label="Location" value={dist(a.checkInDistanceM)} icon="location-outline" />
                <InfoRow label="Code verified" value={yesNo(a.codeVerified)} icon="keypad-outline" />
                <InfoRow label="Selfie" value={yesNo(a.selfieCaptured)} icon="camera-outline" />
              </Card>
            </Section>
            <Section title="Check-out">
              <Card>
                <InfoRow label="Time" value={a.checkOutAt ? formatTime(a.checkOutAt) : 'Not checked out'} icon="log-out-outline" />
                <InfoRow label="Location" value={dist(a.checkOutDistanceM)} icon="location-outline" />
                <InfoRow label="Food photo" value={yesNo(a.foodPhotoCaptured)} icon="image-outline" />
              </Card>
            </Section>
            {a.status === 'exception' && (
              <Button title="Resolve exception" icon="checkmark-done-outline" onPress={() => router.push(`/admin/attendance/${a.id}/resolve`)} />
            )}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
