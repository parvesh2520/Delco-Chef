import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Calistoga_400Regular } from '@expo-google-fonts/calistoga';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { queryClient } from '../src/services';
import { ToastHost } from '../src/components';
import { colors } from '../src/theme';

// Keep the splash screen visible while fonts load
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({ Calistoga_400Regular, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(common)" />
        <Stack.Screen name="customer" />
        <Stack.Screen name="chef" />
        <Stack.Screen name="admin" />
      </Stack>
      <ToastHost />
    </QueryClientProvider>
  );
}
