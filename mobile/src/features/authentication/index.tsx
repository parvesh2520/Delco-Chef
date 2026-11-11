import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, CodeInput, MockTag, Notice, Screen, TextField, Txt } from '../../components';
import { MOCK_AUTH } from '../../constants';
import { useCountdown } from '../../hooks';
import { homeFor } from '../../navigation';
import { authService, type LoginPortal } from '../../services';
import { useAuthStore } from '../../store';
import { colors } from '../../theme';
import { isValidPhone, maskPhone } from '../../utils';

const COPY: Record<LoginPortal, { eyebrow: string; title: string; subtitle: string; hint: string }> = {
  customer: { eyebrow: 'Welcome', title: 'Log in or sign up', subtitle: 'Enter your mobile number. We’ll send a one-time code.', hint: `New number → onboarding. ${MOCK_AUTH.customerExisting} → existing customer.` },
  chef: { eyebrow: 'For chefs', title: 'Chef login', subtitle: 'Use the number you registered with, or a new number to apply.', hint: `${MOCK_AUTH.chefApproved} → approved chef. ${MOCK_AUTH.chefRejected} → rejected. Others → new application.` },
  admin: { eyebrow: 'Delco team', title: 'Admin login', subtitle: 'Only registered Ops and Super Admin numbers can sign in.', hint: `${MOCK_AUTH.opsAdmin} → Ops Admin. ${MOCK_AUTH.superAdmin} → Super Admin.` },
};

/** Phone entry shared by customer, chef and admin login routes. */
export function PhoneLogin({ portal, footer }: { portal: LoginPortal; footer?: React.ReactNode }) {
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const c = COPY[portal];
  const send = useMutation({
    mutationFn: () => authService.requestOtp(phone, portal),
    onSuccess: () => router.push({ pathname: '/otp', params: { phone, portal } }),
  });
  const error = touched && !isValidPhone(phone) ? 'Enter a valid 10-digit Indian mobile number' : undefined;

  const defaultMockPhone =
    portal === 'customer'
      ? MOCK_AUTH.customerExisting
      : portal === 'chef'
      ? MOCK_AUTH.chefApproved
      : MOCK_AUTH.opsAdmin;

  return (
    <Screen
      eyebrow={c.eyebrow}
      title={c.title}
      subtitle={c.subtitle}
      footer={
        <Button
          title="Send OTP"
          loading={send.isPending}
          onPress={() => (setTouched(true), isValidPhone(phone) && send.mutate())}
        />
      }
    >
      <TextField
        label="Mobile number"
        prefix="+91"
        keyboardType="phone-pad"
        maxLength={10}
        value={phone}
        onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
        onBlur={() => setTouched(true)}
        error={error}
        placeholder="98765 43210"
        autoFocus
      />
      <View style={{ marginVertical: 4 }}>
        <Button
          title={`⚡ Auto-fill Test Phone (${defaultMockPhone})`}
          variant="secondary"
          small
          onPress={() => setPhone(defaultMockPhone)}
        />
      </View>
      <Notice icon="flask-outline">Mock login: {c.hint}</Notice>
      {footer}
    </Screen>
  );
}

/** OTP verification for all portals. Unknown admin numbers go to the unauthorized screen. */
export function OtpVerify({ phone, portal }: { phone: string; portal: LoginPortal }) {
  const [code, setCode] = useState('');
  const [resendKey, setResendKey] = useState(0);
  const left = useCountdown(30, resendKey);
  const signIn = useAuthStore((s) => s.signIn);
  const verify = useMutation({
    mutationFn: () => authService.verifyOtp(phone, code, portal),
    onSuccess: (session) => {
      signIn(session);
      router.dismissAll();
      router.replace(homeFor(session));
    },
    onError: (e) => {
      if (e.message === 'UNAUTHORIZED') router.replace({ pathname: '/access-denied', params: { reason: 'not_admin' } });
    },
  });
  const resend = useMutation({
    mutationFn: () => authService.requestOtp(phone, portal),
    onSuccess: () => setResendKey((k) => k + 1),
  });

  return (
    <Screen
      eyebrow="Verify"
      title="Enter the 6-digit code"
      subtitle={`Sent to ${maskPhone(phone)}`}
      footer={
        <Button
          title="Verify & continue"
          disabled={code.length !== 6}
          loading={verify.isPending}
          onPress={() => verify.mutate()}
        />
      }
    >
      <CodeInput
        length={6}
        value={code}
        onChange={setCode}
        error={verify.isError && verify.error.message !== 'UNAUTHORIZED' ? verify.error.message : undefined}
      />
      <View style={{ marginVertical: 6, alignItems: 'center' }}>
        <Button
          title={`⚡ Auto-fill OTP (${MOCK_AUTH.otp})`}
          variant="secondary"
          small
          onPress={() => setCode(MOCK_AUTH.otp)}
        />
      </View>
      <View style={{ alignItems: 'center', gap: 8 }}>
        {left > 0 ? (
          <Txt variant="small">Resend code in {left}s</Txt>
        ) : (
          <Button title="Resend code" variant="ghost" small loading={resend.isPending} onPress={() => resend.mutate()} />
        )}
        <Button title="Change number" variant="ghost" small onPress={() => router.back()} />
      </View>
      <Txt variant="caption" center color={colors.textMuted}>
        Use {MOCK_AUTH.otp} in this build.
      </Txt>
      <MockTag>Mock OTP — no SMS is sent</MockTag>
    </Screen>
  );
}

/** Sign out and reset navigation to Welcome. */
export function useSignOut() {
  const signOut = useAuthStore((s) => s.signOut);
  return async () => {
    await authService.logout();
    signOut();
    router.dismissAll();
    router.replace('/welcome');
  };
}
