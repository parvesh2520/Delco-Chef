import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { homeFor, useSession } from '../../src/navigation';

/** Auth screens are only for signed-out users. */
export default function AuthLayout() {
  const session = useSession();
  if (session) return <Redirect href={homeFor(session)} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
