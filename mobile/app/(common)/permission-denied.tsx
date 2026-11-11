import React from 'react';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Screen, StatusHero } from '../../src/components';

const COPY = {
  location: { icon: 'location-outline', title: 'Location permission needed', message: 'Location is used to share your live position with the customer while travelling and to verify check-in.' },
  camera: { icon: 'camera-outline', title: 'Camera permission needed', message: 'The camera is used for check-in/out selfies and food photos.' },
  notifications: { icon: 'notifications-outline', title: 'Notifications are off', message: 'Turn on notifications to get visit and payment updates.' },
} as const;

export default function PermissionDenied() {
  const { kind = 'location' } = useLocalSearchParams<{ kind?: keyof typeof COPY }>();
  const c = COPY[kind] ?? COPY.location;
  return (
    <Screen>
      <StatusHero tone="warning" icon={c.icon} title={c.title} message={c.message}>
        <Button title="Open settings" icon="settings-outline" onPress={() => Linking.openSettings()} />
        <Button title="Not now" variant="ghost" onPress={() => router.back()} />
      </StatusHero>
    </Screen>
  );
}
