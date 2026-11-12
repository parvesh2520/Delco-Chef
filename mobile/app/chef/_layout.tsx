import React from 'react';
import { Stack } from 'expo-router';
import { useRoleGuard } from '../../src/navigation';

/** Chef area: only `chef` sessions. Approval gating happens in (tabs)/_layout and job routes. */
export default function ChefLayout() {
  const guard = useRoleGuard(['chef']);
  if (guard) return guard;
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 260 }} />;
}
