import React from 'react';
import { RoleTabs } from '../../../../src/navigation/TabBar';

export default function ChefTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: 'home', title: 'Today', icon: 'today-outline' },
        { name: 'jobs', title: 'Jobs', icon: 'briefcase-outline' },
        { name: 'alerts', title: 'Alerts', icon: 'notifications-outline' },
        { name: 'profile', title: 'Profile', icon: 'person-outline' },
      ]}
    />
  );
}
