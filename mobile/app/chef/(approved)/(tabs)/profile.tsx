import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Card, InfoRow, ListGroup, ListRow, QueryView, Screen, Txt } from '../../../../src/components';
import { useSignOut } from '../../../../src/features/authentication';
import { useChefId } from '../../../../src/features/chef';
import { chefService } from '../../../../src/services';
import { humanize } from '../../../../src/utils';

/** Chef profile: rating, experience, cuisines, documents and bank (masked). */
export default function ChefProfile() {
  const chefId = useChefId();
  const signOut = useSignOut();
  const query = useQuery({ queryKey: ['chef', chefId], queryFn: () => chefService.getMe(chefId) });
  return (
    <Screen back={false} title="Profile" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Profile not found' }}>
        {(chef) => chef && (
          <>
            <Card tone="cream">
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Avatar name={chef.name} size={56} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="h2">{chef.name}</Txt>
                  <Txt variant="small">{chef.area}, {chef.city}</Txt>
                </View>
                <Badge status={chef.status} />
              </View>
              <InfoRow icon="star-outline" label="Rating" value={`${chef.rating.toFixed(1)} · ${chef.completedVisits} visits`} />
              <InfoRow icon="time-outline" label="Experience" value={`${chef.experienceYears} years`} />
              <InfoRow icon="restaurant-outline" label="Cuisines" value={chef.cuisines.join(', ')} />
              <InfoRow icon="call-outline" label="Phone" value={chef.phone} />
            </Card>
            <Card>
              <Txt variant="h3">Documents</Txt>
              {chef.documents.map((d) => (
                <View key={d.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Txt variant="body">{humanize(d.type)}</Txt>
                  <Badge status={d.status} />
                </View>
              ))}
            </Card>
            <Card>
              <Txt variant="h3">Bank account</Txt>
              {chef.bank ? (
                <>
                  <InfoRow label="Account holder" value={chef.bank.accountName} />
                  <InfoRow label="Account no." value={chef.bank.accountNumberMasked} />
                  <InfoRow label="IFSC" value={chef.bank.ifsc} />
                  <InfoRow label="UPI" value={chef.bank.upi} />
                </>
              ) : (
                <Txt variant="small">No bank account on file. Contact support to add one.</Txt>
              )}
            </Card>
          </>
        )}
      </QueryView>
      <ListGroup>
        <ListRow icon="calendar-clear-outline" title="Off-day calendar" onPress={() => router.push('/chef/off-days')} />
        <ListRow icon="wallet-outline" title="Earnings" onPress={() => router.push('/chef/earnings')} />
        <ListRow icon="settings-outline" title="Settings" onPress={() => router.push('/chef/settings')} />
        <ListRow icon="log-out-outline" title="Log out" danger onPress={signOut} />
      </ListGroup>
    </Screen>
  );
}
