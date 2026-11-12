import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Screen, Section, StatTile } from '../../../src/components';
import { QueryView } from '../../../src/components';
import { ROLE_LABELS } from '../../../src/constants';
import { StageSummaryCard } from '../../../src/features/admin';
import { useIsSuperAdmin, useSession } from '../../../src/navigation';
import { adminService } from '../../../src/services';
import { colors } from '../../../src/theme';

export default function AdminDashboard() {
  const session = useSession();
  const isSuper = useIsSuperAdmin();
  const query = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: adminService.getDashboard });
  const summary = useQuery({ queryKey: ['admin', 'stage-summary'], queryFn: adminService.getStageSummary });
  return (
    <Screen
      back={false}
      eyebrow="Operations"
      title={`Hello, ${session?.user.fullName.split(' ')[0] ?? 'Admin'}`}
      right={
        <Pressable accessibilityLabel="Notifications" onPress={() => router.push('/admin/notifications')} hitSlop={10}>
          <Ionicons name="notifications-outline" size={24} color={colors.primary} />
        </Pressable>
      }
      refreshing={query.isRefetching || summary.isRefetching}
      onRefresh={() => (query.refetch(), summary.refetch())}
    >
      {session && <Badge tone="info" label={ROLE_LABELS[session.user.role]} />}
      <QueryView query={query}>
        {(d) => (
          <Section title="Today at a glance">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <StatTile label="Pending requests" value={d.pendingRequests} icon="file-tray-full-outline" highlight={d.pendingRequests > 0} onPress={() => router.push('/admin/requests')} />
              <StatTile label="Trials today" value={d.trialsToday} icon="albums-outline" onPress={() => router.push('/admin/trials')} />
              <StatTile label="Active subscriptions" value={d.activeSubscriptions} icon="repeat-outline" onPress={() => router.push('/admin/bookings')} />
              <StatTile label="Pending payments" value={d.pendingPayments} icon="card-outline" onPress={() => router.push('/admin/payments')} />
              <StatTile label="Attendance exceptions" value={d.attendanceExceptions} icon="warning-outline" highlight={d.attendanceExceptions > 0} onPress={() => router.push('/admin/attendance')} />
              {isSuper && (
                <StatTile label="Chef applications" value={d.pendingChefApplications} icon="person-add-outline" onPress={() => router.push('/admin/super/chef-applications')} />
              )}
            </View>
          </Section>
        )}
      </QueryView>
      <Section title="Customer funnel" eyebrow="All time">
        <QueryView query={summary} isEmpty={(s) => s.stages.requested === 0} empty={{ title: 'No requests yet', message: 'Stage counts appear after the first trial request.', icon: 'funnel-outline' }}>
          {(s) => <StageSummaryCard s={s} />}
        </QueryView>
      </Section>
      <Section title="Quick actions">
        <Button title="Open request queue" icon="file-tray-full-outline" onPress={() => router.push('/admin/requests')} />
        <Button title="Trial board" variant="secondary" icon="albums-outline" onPress={() => router.push('/admin/trials')} />
      </Section>
    </Screen>
  );
}
