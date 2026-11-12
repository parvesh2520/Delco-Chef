import React from 'react';
import { Stack } from 'expo-router';
import { useRoleGuard } from '../../src/navigation';

/** Customer area: only `customer` sessions may enter. */
export default function CustomerLayout() {
  const guard = useRoleGuard(['customer']);
  if (guard) return guard;
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 260 }} />;
}
