import React from 'react';
import { router } from 'expo-router';
import { Button, Screen, StatusHero } from '../src/components';

export default function NotFound() {
  return (
    <Screen>
      <StatusHero art="map" tone="neutral" icon="compass-outline" title="Page not found" message="This screen doesn’t exist or has moved.">
        <Button title="Go home" onPress={() => router.replace('/')} />
      </StatusHero>
    </Screen>
  );
}
