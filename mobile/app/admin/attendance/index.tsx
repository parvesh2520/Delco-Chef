import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Screen, Segmented } from '../../../src/components';
import { AttendanceCard } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { adminService } from '../../../src/services';
import type { AttendanceRecord } from '../../../src/types';

/** Attendance records and open exceptions. */
export default function Attendance() {
  const [tab, setTab] = useState<'records' | 'exceptions'>('records');
  const query = useQuery({ queryKey: ['admin', 'attendance'], queryFn: adminService.listAttendance });
  const pick = (all: AttendanceRecord[]) => (tab === 'records' ? all : all.filter((a) => a.status === 'exception'));
  const exceptions = (query.data ?? []).filter((a) => a.status === 'exception').length;
  return (
    <Screen eyebrow="Attendance" title="Check-in & check-out" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <Segmented
        options={[
          { value: 'records', label: 'Records' },
          { value: 'exceptions', label: `Exceptions (${exceptions})` },
        ]}
        value={tab}
        onChange={setTab}
      />
      <QueryView
        query={query}
        isEmpty={(all) => pick(all).length === 0}
        empty={{ title: tab === 'records' ? 'No attendance records' : 'No open exceptions', icon: 'finger-print-outline' }}
      >
        {(all) => pick(all).map((a) => <AttendanceCard key={a.id} a={a} />)}
      </QueryView>
    </Screen>
  );
}
