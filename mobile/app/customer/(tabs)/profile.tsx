import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Card, ListGroup, ListRow, QueryView, Screen, Txt } from '../../../src/components';
import { useSignOut } from '../../../src/features/authentication';
import { bookingService, customerService, visitService } from '../../../src/services';
import { colors, fonts, radius, shadow, spacing } from '../../../src/theme';
import { maskPhone } from '../../../src/utils';

export default function Profile() {
  const query = useQuery({ queryKey: ['profile'], queryFn: customerService.getProfile });
  const signOut = useSignOut();
  const visits = useQuery({ queryKey: ['visits'], queryFn: visitService.listCustomerVisits });
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: bookingService.listMySubscriptions });
  const done = (visits.data ?? []).filter((v) => v.status === 'completed');
  const chefs = new Set(done.map((v) => v.chefId).filter(Boolean)).size;
  const activePlans = (subs.data ?? []).filter((s) => s.status === 'active').length;
  return (
    <Screen back={false} eyebrow="Account" title="Profile">
      <QueryView query={query}>
        {(p) => (
          <Card style={styles.header}>
            <View style={styles.avatarRing}><Avatar name={p.fullName} size={84} /></View>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Txt variant="h1" center>{p.fullName || 'Your name'}</Txt>
              {p.memberSince && <Txt variant="label" color={colors.accent}>Member since {new Date(p.memberSince).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Txt>}
              <Txt variant="small" center>{maskPhone(p.phone)}{p.email ? ` · ${p.email}` : ''}</Txt>
            </View>
            <View style={styles.stats}>
              <Stat value={done.length} label="Meals cooked" />
              <View style={styles.vr} />
              <Stat value={activePlans} label="Active plans" />
              <View style={styles.vr} />
              <Stat value={chefs} label={chefs === 1 ? 'Chef' : 'Chefs'} />
            </View>
          </Card>
        )}
      </QueryView>
      <ListGroup>
        <ListRow icon="location-outline" title="Manage addresses" onPress={() => router.push('/customer/settings/addresses')} />
        <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push('/customer/notifications')} />
        <ListRow icon="settings-outline" title="Account settings" onPress={() => router.push('/customer/settings/account')} />
        <ListRow icon="albums-outline" title="Trials" onPress={() => router.push('/customer/trials')} />
      </ListGroup>
      <ListGroup>
        <ListRow icon="download-outline" title="Download my data" onPress={() => router.push('/customer/settings/data-export')} />
        <ListRow icon="trash-outline" title="Delete account" danger onPress={() => router.push('/customer/settings/delete-account')} />
      </ListGroup>
      <ListGroup>
        <ListRow icon="log-out-outline" title="Log out" onPress={signOut} />
      </ListGroup>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt style={styles.statValue}>{value}</Txt>
      <Txt variant="caption">{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  avatarRing: { padding: 4, borderRadius: 50, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accentLight, ...shadow },
  stats: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: colors.backgroundSecondary, borderRadius: radius.md, paddingVertical: 12 },
  statValue: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: colors.text },
  vr: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
});
