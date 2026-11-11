import React from 'react';
import { Redirect } from 'expo-router';
import { homeFor, useSession } from '../src/navigation';

/** Entry: send signed-in users to their role home, everyone else to Welcome. */
export default function Index() {
  const session = useSession();
  return <Redirect href={session ? homeFor(session) : '/welcome'} />;
}
