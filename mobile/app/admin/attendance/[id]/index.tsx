import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, Notice, Screen, Section, Txt } from '../../../../src/components';
import { EvidencePhoto, Row } from '../../../../src/features/admin';
import { QueryView } from '../../../../src/components';
import { adminService } from '../../../../src/services';
import type { AttendanceEvent, AttendanceRecord } from '../../../../src/types';
import { formatDate, formatDateTime, formatTime, humanize } from '../../../../src/utils';

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');
const dist = (m?: number | null) => (m === undefined || m === null ? undefined : `${Math.round(m)} m from address`);

const EXCEPTION_TEXT: Record<string, string> = {
  missing_check_out: 'The chef did not check out. The system closed the visit at the scheduled end; worked time is counted to the scheduled end until you review it.',
  unusual_duration: 'Worked time is under 50% or over 150% of the scheduled time.',
  customer_unavailable: 'The chef reported that the customer was not there.',
  code_locked: 'Check-in was locked after too many wrong codes.',
  missed_visit: 'The chef never checked in.',
};

/** D5: one attendance record with its evidence, attempt log and review decision. */
export default function AttendanceDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['admin', 'attendance', id], queryFn: () => adminService.getAttendance(id) });
  return (
    <Screen title="Attendance review" refreshing={query.isRefetching} onRefresh={query.refetch}>
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
              <Notice tone={a.status === 'resolved' ? 'info' : 'error'} icon="warning-outline">
                {humanize(a.exception)}: {EXCEPTION_TEXT[a.exception] ?? ''}
              </Notice>
            )}
            <Review a={a} />
            <Section title="Check-in">
              <Card>
                <InfoRow label="Time (server)" value={a.checkInAt ? formatTime(a.checkInAt) : 'Not checked in'} icon="log-in-outline" />
                <InfoRow label="Location" value={dist(a.checkInDistanceM)} icon="location-outline" />
                <InfoRow label="Code verified" value={yesNo(a.codeVerified)} icon="keypad-outline" />
                {!!a.codeAttempts && <InfoRow label="Wrong code attempts" value={a.codeAttempts} icon="alert-circle-outline" />}
              </Card>
            </Section>
            <Section title="Check-out">
              <Card>
                <InfoRow label="Time" value={a.checkOutAt ? formatTime(a.checkOutAt) : 'Not checked out'} icon="log-out-outline" />
                <InfoRow label="Location" value={dist(a.checkOutDistanceM)} icon="location-outline" />
                <InfoRow label="Worked" value={worked(a)} icon="time-outline" />
              </Card>
            </Section>
            <Section title="Evidence">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <EvidencePhoto label="Check-in selfie" path={a.photos?.checkInSelfie} />
                <EvidencePhoto label="Check-out selfie" path={a.photos?.checkOutSelfie} />
                <EvidencePhoto label="Food" path={a.photos?.food} />
              </View>
            </Section>
            {!!a.events?.length && (
              <Section title="Attempt log">
                <Card>
                  {a.events.map((e, i) => <EventRow key={`${e.at}-${i}`} e={e} />)}
                </Card>
              </Section>
            )}
          </>
        )}
      </QueryView>
    </Screen>
  );
}

function worked(a: AttendanceRecord): string | undefined {
  if (a.workedMinutes === null || a.workedMinutes === undefined) return undefined;
  return a.scheduledMinutes ? `${a.workedMinutes} of ${a.scheduledMinutes} min` : `${a.workedMinutes} min`;
}

function Review({ a }: { a: AttendanceRecord }) {
  if (a.status === 'resolved') {
    return (
      <Card>
        <Row>
          <Txt variant="h3" style={{ flex: 1 }}>Review</Txt>
          <Badge tone={a.decision === 'rejected' ? 'error' : 'success'} label={a.decision === 'rejected' ? 'Rejected' : 'Approved'} />
        </Row>
        <InfoRow label="By" value={a.reviewedBy ?? undefined} icon="person-outline" />
        <InfoRow label="When" value={a.reviewedAt ? formatDateTime(a.reviewedAt) : undefined} icon="calendar-outline" />
        <InfoRow label="Reason" value={a.resolution} icon="document-text-outline" />
      </Card>
    );
  }
  if (a.status !== 'exception') return null;
  return (
    <Button title="Review: approve or reject" icon="checkmark-done-outline"
      onPress={() => router.push({ pathname: '/admin/attendance/[id]/resolve', params: { id: a.id } })} />
  );
}

function EventRow({ e }: { e: AttendanceEvent }) {
  const ok = e.result === 'OK';
  const detail = [
    e.distanceM !== null && e.distanceM !== undefined ? `${e.distanceM} m` : null,
    e.accuracyM !== null && e.accuracyM !== undefined ? `±${Math.round(e.accuracyM)} m GPS` : null,
    e.deviceId ? `device ${e.deviceId}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <View style={{ paddingVertical: 6, gap: 2 }}>
      <Row>
        <Txt variant="bodyStrong" style={{ flex: 1 }}>{humanize(e.kind)}</Txt>
        <Badge tone={ok ? 'success' : 'error'} label={ok ? 'OK' : humanize(e.result.toLowerCase())} />
      </Row>
      <Txt variant="caption">{formatDateTime(e.at)}{detail ? ` · ${detail}` : ''}</Txt>
    </View>
  );
}
