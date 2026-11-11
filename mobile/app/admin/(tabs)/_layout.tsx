import React from 'react';
import { RoleTabs } from '../../../src/navigation/TabBar';

export default function AdminTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: 'dashboard', title: 'Dashboard', icon: 'grid-outline' },
        { name: 'requests', title: 'Requests', icon: 'file-tray-full-outline' },
        { name: 'trials', title: 'Trials', icon: 'albums-outline' },
        { name: 'more', title: 'More', icon: 'menu-outline' },
      ]}
    />
  );
}
