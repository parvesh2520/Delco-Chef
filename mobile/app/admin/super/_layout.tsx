import React from 'react';
import { Stack } from 'expo-router';
import { useRoleGuard } from '../../../src/navigation';

/** Super Admin-only routes. Ops Admins are redirected to Access denied. */
export default function SuperAdminLayout() {
  const guard = useRoleGuard(['super_admin']);
  if (guard) return guard;
  return <Stack screenOptions={{ headerShown: false }} />;
}
