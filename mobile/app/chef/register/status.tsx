import React from 'react';
import { Redirect, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Notice, Screen, StatusHero } from '../../../src/components';
import { useSignOut } from '../../../src/features/authentication';
import { useSession } from '../../../src/navigation';
import { authService, chefService } from '../../../src/services';
import { useAuthStore } from '../../../src/store';

/** Application approval / rejection status. */
export default function ChefApplicationStatus() {
  const session = useSession();
  const setChefStatus = useAuthStore((s) => s.setChefStatus);
  const signOut = useSignOut();
  // Poll the server: approval is made by a Super Admin, never in the app.
  const me = useQuery({ queryKey: ['chefMe'], queryFn: () => chefService.getMe(), refetchInterval: 30000 });
  React.useEffect(() => {
    if (me.data && me.data.status !== session?.chefStatus) authService.reloadSession().catch(() => undefined);
  }, [me.data, session?.chefStatus]);
  const status = me.data?.status ?? session?.chefStatus ?? 'draft';
  if (status === 'draft') return <Redirect href="/chef/register" />;

  if (status === 'approved') {
    return (
      <Screen back={false}>
        <StatusHero tone="success" icon="ribbon-outline" title="You’re approved!" message="Welcome to Delco Chefs. You can now receive assignments near you.">
          <Button title="Go to dashboard" icon="arrow-forward" onPress={() => router.replace('/chef/home')} />
        </StatusHero>
      </Screen>
    );
  }

  if (status === 'rejected') {
    return (
      <Screen back={false}>
        <StatusHero tone="error" icon="close-circle-outline" title="Application not approved" message="We couldn’t approve your application this time." />
        <Notice tone="error">Reason: {me.data?.rejectionReason ?? 'Not provided'}</Notice>
        <Button
          title="Update & reapply"
          onPress={() => {
            setChefStatus('draft');
            router.replace('/chef/register');
          }}
        />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </Screen>
    );
  }

  return (
    <Screen back={false} title="Application status">
      <StatusHero
        tone="warning"
        icon="hourglass-outline"
        title={status === 'under_review' ? 'Under review' : 'Submitted'}
        message="We’re verifying your documents. We’ll notify you as soon as there’s an update."
      />
      <Notice>Only approved chefs can receive assignments.</Notice>
      <Button title="Check status" variant="secondary" icon="refresh" loading={me.isFetching} onPress={() => me.refetch()} />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
