import React from 'react';
import { Stack } from 'expo-router';
import { useRoleGuard } from '../../src/navigation';

/** Admin area: Ops Admin and Super Admin. Super-only routes live under admin/super. */
export default function AdminLayout() {
  const guard = useRoleGuard(['ops_admin', 'super_admin']);
  if (guard) return guard;
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 260 }} />;
}
