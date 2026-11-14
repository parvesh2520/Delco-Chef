import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { haptic } from '../motion';
import { colors, fonts } from '../theme';

export interface TabDef {
  name: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/** Active tab: a soft pill grows behind the icon and the icon bounces once. */
function TabIcon({ name, focused, color, size }: { name: keyof typeof Ionicons.glyphMap; focused: boolean; color: string; size: number }) {
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const bounce = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    if (focused) {
      bounce.setValue(0.75);
      Animated.spring(bounce, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 14 }).start();
    }
  }, [focused, v, bounce]);
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.pill, { opacity: v, transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}
      />
      <Animated.View style={{ transform: [{ scale: bounce }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) }] }}>
        <Ionicons name={focused ? (name.replace('-outline', '') as typeof name) : name} color={color} size={size} />
      </Animated.View>
    </>
  );
}

/** Bottom tabs styled to the Delco palette; shared by customer, chef and admin. */
export function RoleTabs({ tabs }: { tabs: TabDef[] }) {
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, height: 64, paddingTop: 8 },
        sceneStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color, size, focused }) => <TabIcon name={t.icon} focused={focused} color={color as string} size={size - 2} /> }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { position: 'absolute', width: 56, height: 30, top: -3, borderRadius: 15, backgroundColor: colors.accentLight },
});
