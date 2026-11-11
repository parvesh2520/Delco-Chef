import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Screen, StatusHero } from '../../src/components';
import { homeFor, useSession } from '../../src/navigation';
import { useSignOut } from '../../src/features/authentication';

/** Shown for wrong-role navigation and for unauthorized admin login attempts. */
export default function AccessDenied() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const session = useSession();
  const signOut = useSignOut();
  const notAdmin = reason === 'not_admin';
  return (
    <Screen back={false}>
      <StatusHero
        tone="error"
        icon="lock-closed-outline"
        title={notAdmin ? 'Unauthorized access' : 'Access denied'}
        message={notAdmin ? 'This number isn’t registered as a Delco admin. Contact a Super Admin if you need access.' : 'Your account doesn’t have permission to open this screen.'}
      >
        {session ? (
          <>
            <Button title="Go to my home" onPress={() => router.replace(homeFor(session))} />
            <Button title="Sign out" variant="ghost" onPress={signOut} />
          </>
        ) : (
          <Button title="Back to welcome" onPress={() => router.replace('/welcome')} />
        )}
      </StatusHero>
    </Screen>
  );
}
