import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../../src/navigation';

/** Only approved chefs reach the working app (jobs, assignments, visits) and can receive assignments. */
export default function ApprovedChefLayout() {
  const session = useSession();
  if (session?.chefStatus !== 'approved') return <Redirect href="/chef/register/status" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
