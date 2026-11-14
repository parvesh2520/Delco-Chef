import React from 'react';
import { router } from 'expo-router';
import { Button, Notice, Screen, StatusHero } from '../../src/components';

/** No internet connection. Reached from ErrorState when a request fails without a response. */
export default function Offline() {
  return (
    <Screen>
      <StatusHero art="plug" tone="neutral" icon="cloud-offline-outline" title="No internet connection" message="Check Wi-Fi or mobile data, then try again. Your changes haven’t been lost.">
        <Button title="Try again" icon="refresh" onPress={() => router.back()} />
      </StatusHero>
      <Notice>Automatic connectivity detection (@react-native-community/netinfo) is a pending integration.</Notice>
    </Screen>
  );
}
