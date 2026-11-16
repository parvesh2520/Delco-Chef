import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Calistoga_400Regular } from '@expo-google-fonts/calistoga';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { authService, queryClient } from '../src/services';
// Defines the background location task at startup (Android re-delivers fixes to it while the app is backgrounded).
import '../src/features/tracking';
import { ToastHost } from '../src/components';
import { CelebrationHost } from '../src/motion';
import { colors } from '../src/theme';

/**
 * Any rendering error in the app lands here instead of closing it (release builds treat an uncaught render error as
 * fatal). Plain React Native text, so it works even before the custom fonts have loaded.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    console.error('Unhandled screen error', error);
  }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '600', color: colors.text, textAlign: 'center' }}>Something went wrong</Text>
      <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: 'center' }}>The app hit an unexpected problem. Your bookings are safe.</Text>
      <Pressable onPress={retry} accessibilityRole="button" style={{ marginTop: 12, backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999 }}>
        <Text style={{ color: colors.textOnDark, fontSize: 16, fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade', animationDuration: 220 }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(common)" />
        <Stack.Screen name="customer" />
        <Stack.Screen name="chef" />
        <Stack.Screen name="admin" />
      </Stack>
      <ToastHost />
      <CelebrationHost />
    </QueryClientProvider>
  );
}
