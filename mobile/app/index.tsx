import React from 'react';
import { Redirect } from 'expo-router';
import { homeFor, useSession } from '../src/navigation';
import { useAuthStore } from '../src/store';
import Welcome from './(auth)/welcome';

/** Entry: send signed-in users to their role home, explain an ended session, render Welcome immediately for guests. */
export default function Index() {
  const session = useSession();
  const expired = useAuthStore((s) => s.sessionExpired);
  if (session) {
    return <Redirect href={homeFor(session)} />;
  }
  if (expired) return <Redirect href="/session-expired" />;
  return <Welcome />;
}
