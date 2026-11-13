import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, NextActionCard, Screen, Section, StatTile, type NextAction } from '../../../src/components';
import { QueryView } from '../../../src/components';
import { ROLE_LABELS } from '../../../src/constants';
import { StageSummaryCard } from '../../../src/features/admin';
import { useIsSuperAdmin, useSession } from '../../../src/navigation';
import { adminService } from '../../../src/services';
import { colors } from '../../../src/theme';

type Dashboard = Awaited<ReturnType<typeof adminService.getDashboard>>;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The queue that most needs an Admin right now; a calm card when everything is handled. */
function nextAction(d: Dashboard, isSuper: boolean): NextAction {
  if (d.attendanceExceptions > 0) {
    return { eyebrow: 'Needs review', icon: 'warning-outline', title: plural(d.attendanceExceptions, 'attendance exception', 'attendance exceptions'),
      detail: 'Check-ins or check-outs that need a decision before the chef is paid.',
      actions: [{ title: 'Review attendance', icon: 'arrow-forward', onPress: () => router.push('/admin/attendance') }] };
  }
  if (d.pendingRequests > 0) {
    return { eyebrow: 'Waiting for a chef', icon: 'file-tray-full-outline', title: plural(d.pendingRequests, 'request to assign', 'requests to assign'),
      detail: 'Customers are waiting for a chef to be assigned.',
      actions: [{ title: 'Open request queue', icon: 'arrow-forward', onPress: () => router.push('/admin/requests') }] };
  }
  if (d.pendingPayments > 0) {
    return { eyebrow: 'Follow up', icon: 'card-outline', title: plural(d.pendingPayments, 'payment pending', 'payments pending'),
      detail: 'Payment links sent but not paid yet.',
      actions: [{ title: 'View payments', icon: 'arrow-forward', onPress: () => router.push('/admin/payments') }] };
  }
  if (isSuper && d.pendingChefApplications > 0) {
    return { eyebrow: 'Approvals', icon: 'person-add-outline', title: plural(d.pendingChefApplications, 'chef application', 'chef applications'),
      detail: 'New chefs waiting for document review.',
      actions: [{ title: 'Review applications', icon: 'arrow-forward', onPress: () => router.push('/admin/super/chef-applications') }] };
  }
  return { eyebrow: 'All clear', icon: 'checkmark-circle-outline', title: 'Nothing waiting on you', calm: true,
    detail: `${plural(d.trialsToday, 'trial', 'trials')} today · ${plural(d.activeSubscriptions, 'active subscription', 'active subscriptions')}.`,
    actions: [{ title: 'Trial board', icon: 'albums-outline', onPress: () => router.push('/admin/trials') }] };
}

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
          <>
          <NextActionCard {...nextAction(d, isSuper)} />
          <Section eyebrow="Today at a glance">
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
          </>
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
