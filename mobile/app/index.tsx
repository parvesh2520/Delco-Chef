import React from 'react';
import { Redirect } from 'expo-router';
import { homeFor, useSession } from '../src/navigation';
import Welcome from './(auth)/welcome';

/** Entry: send signed-in users to their role home, render Welcome immediately for guests. */
export default function Index() {
  const session = useSession();
  if (session) {
    return <Redirect href={homeFor(session)} />;
  }
  return <Welcome />;
}
