import React from 'react';
import { router } from 'expo-router';
import { Button, Screen, StatusHero } from '../../src/components';
import { useAuthStore } from '../../src/store';

export default function SessionExpired() {
  return (
    <Screen back={false}>
      <StatusHero tone="warning" icon="time-outline" title="Session expired" message="For your security you’ve been signed out. Please log in again.">
        <Button title="Log in again" onPress={() => { useAuthStore.setState({ sessionExpired: false }); router.replace('/welcome'); }} />
      </StatusHero>
    </Screen>
  );
}
