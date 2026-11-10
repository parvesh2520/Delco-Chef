import React from 'react';
import { Stack } from 'expo-router';

export default function ChefLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
