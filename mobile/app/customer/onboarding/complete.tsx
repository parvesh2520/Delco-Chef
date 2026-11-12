import React from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Notice, Screen, StatusHero, StepProgress } from '../../../src/components';
import { customerService } from '../../../src/services';
import { useAuthStore } from '../../../src/store';

/** Onboarding 4/4 — completion is recorded on the server (it checks name, address and consent exist). */
export default function OnboardingComplete() {
  const setOnboarded = useAuthStore((s) => s.setOnboarded);
  const finish = useMutation({
    mutationFn: customerService.completeOnboarding,
    onSuccess: () => {
      setOnboarded();
      if (router.canDismiss()) router.dismissAll();
      router.replace('/customer/home');
    },
  });
  return (
    <Screen back={false} footer={<Button title="Start exploring" variant="accent" icon="arrow-forward" loading={finish.isPending} onPress={() => finish.mutate()} />}>
      <StepProgress step={4} total={4} label="Done" />
      <StatusHero celebrate icon="sparkles-outline" title="You’re all set!" message="Book a free trial and Delco will assign a verified chef for your kitchen." />
      {finish.isError && <Notice tone="error">{finish.error.message}</Notice>}
    </Screen>
  );
}
