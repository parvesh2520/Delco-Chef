import React from 'react';
import { Stack } from 'expo-router';

/** Role-independent system screens. */
export default function CommonLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
