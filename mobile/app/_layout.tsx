import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Calistoga_400Regular } from '@expo-google-fonts/calistoga';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { authService, queryClient } from '../src/services';
import { ToastHost } from '../src/components';
import { colors } from '../src/theme';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Calistoga_400Regular,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  // Restore the signed-in session from the refresh token in SecureStore before routing.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    authService.restore().finally(() => setRestored(true));
  }, []);

  useEffect(() => {
    if (!restored) return;
    // Hide splash screen immediately once layout mounts or fonts resolve
    const hide = () => SplashScreen.hideAsync().catch(() => {});
    hide();
    const timer = setTimeout(hide, 200);
    return () => clearTimeout(timer);
  }, [loaded, error, restored]);

  if (!restored) return null;

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
