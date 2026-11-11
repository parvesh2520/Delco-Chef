import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Card, ListGroup, ListRow, QueryView, Screen, Txt } from '../../../src/components';
import { useSignOut } from '../../../src/features/authentication';
import { customerService } from '../../../src/services';
import { maskPhone } from '../../../src/utils';

export default function Profile() {
  const query = useQuery({ queryKey: ['profile'], queryFn: customerService.getProfile });
  const signOut = useSignOut();
  return (
    <Screen back={false} eyebrow="Account" title="Profile">
      <QueryView query={query}>
        {(p) => (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar name={p.fullName} size={56} />
              <View style={{ flex: 1 }}>
                <Txt variant="h2">{p.fullName || 'Your name'}</Txt>
                <Txt variant="small">{maskPhone(p.phone)}{p.email ? ` · ${p.email}` : ''}</Txt>
              </View>
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
