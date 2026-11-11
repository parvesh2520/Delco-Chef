import React, { useState } from 'react';
import { router } from 'expo-router';
import { ConfirmDialog, ListGroup, ListRow, Screen, Section } from '../../../src/components';
import { useSignOut } from '../../../src/features/authentication';
import { useIsSuperAdmin } from '../../../src/navigation';

export default function AdminMore() {
  const isSuper = useIsSuperAdmin();
  const signOut = useSignOut();
  const [confirm, setConfirm] = useState(false);
  return (
    <Screen back={false} title="More">
      <Section eyebrow="Operations">
        <ListGroup>
          <ListRow icon="list-outline" title="Booking requests" onPress={() => router.push('/admin/bookings')} />
          <ListRow icon="card-outline" title="Payments" onPress={() => router.push('/admin/payments')} />
          <ListRow icon="finger-print-outline" title="Attendance" onPress={() => router.push('/admin/attendance')} />
          <ListRow icon="settings-outline" title="Settings" subtitle="Pricing, trials, radius, slots…" onPress={() => router.push('/admin/settings')} />
          <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push('/admin/notifications')} />
        </ListGroup>
      </Section>
      {isSuper && (
        <Section eyebrow="Super Admin">
          <ListGroup>
            <ListRow icon="people-outline" title="Admin accounts" onPress={() => router.push('/admin/super/admins')} />
            <ListRow icon="person-add-outline" title="Chef applications" onPress={() => router.push('/admin/super/chef-applications')} />
            <ListRow icon="document-text-outline" title="Audit logs" onPress={() => router.push('/admin/super/audit-logs')} />
            <ListRow icon="wallet-outline" title="Payouts" subtitle="Optional" onPress={() => router.push('/admin/super/payouts')} />
          </ListGroup>
        </Section>
      )}
      <ListGroup>
        <ListRow icon="log-out-outline" title="Sign out" danger onPress={() => setConfirm(true)} />
      </ListGroup>
      <ConfirmDialog
        visible={confirm}
        title="Sign out?"
        confirmLabel="Sign out"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          signOut();
        }}
      />
    </Screen>
  );
}
