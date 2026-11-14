import React from 'react';
import { Redirect } from 'expo-router';
import { RoleTabs } from '../../../src/navigation/TabBar';
import { useSession } from '../../../src/navigation';

/** Main customer tabs; customers who haven't finished onboarding are sent back to it. */
export default function CustomerTabs() {
  const session = useSession();
  if (session && !session.onboarded) return <Redirect href="/customer/onboarding/profile" />;
  return (
    <RoleTabs
      tabs={[
        { name: 'home', title: 'Home', icon: 'home-outline' },
        { name: 'bookings', title: 'Bookings', icon: 'calendar-outline' },
        { name: 'assistant', title: 'Delco AI', icon: 'chatbubble-ellipses-outline' },
        { name: 'payments', title: 'Payments', icon: 'card-outline' },
        { name: 'profile', title: 'Profile', icon: 'person-outline' },
      ]}
    />
  );
}
