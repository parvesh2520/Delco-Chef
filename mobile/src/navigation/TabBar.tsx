import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { colors, fonts } from '../theme';

export interface TabDef {
  name: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/** Bottom tabs styled to the Delco palette; shared by customer, chef and admin. */
export function RoleTabs({ tabs }: { tabs: TabDef[] }) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 64, paddingTop: 6 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={color as string} size={size - 2} /> }}
        />
      ))}
    </Tabs>
  );
}
