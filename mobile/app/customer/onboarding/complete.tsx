import React from 'react';
import { router } from 'expo-router';
import { Button, Screen, StatusHero, StepProgress } from '../../../src/components';
import { useAuthStore } from '../../../src/store';

/** Onboarding 4/4 — completion. */
export default function OnboardingComplete() {
  const setOnboarded = useAuthStore((s) => s.setOnboarded);
  const finish = () => {
    setOnboarded();
    if (router.canDismiss()) router.dismissAll();
    router.replace('/customer/home');
  };
  return (
    <Screen back={false} footer={<Button title="Start exploring" variant="accent" icon="arrow-forward" onPress={finish} />}>
      <StepProgress step={4} total={4} label="Done" />
      <StatusHero icon="sparkles-outline" title="You’re all set!" message="Book a free trial and Delco will assign a verified chef for your kitchen." />
    </Screen>
  );
}
