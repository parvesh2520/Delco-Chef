import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, CodeInput, Notice, Screen, TextField, Txt } from '../../components';
import { APP_CONFIG } from '../../constants';
import { useCountdown } from '../../hooks';
import { homeFor } from '../../navigation';
import { ApiError, authService, type LoginPortal } from '../../services';
import { useAuthStore } from '../../store';
import { colors } from '../../theme';
import { isValidPhone, maskPhone } from '../../utils';

const COPY: Record<LoginPortal, { eyebrow: string; title: string; subtitle: string }> = {
  customer: { eyebrow: 'Welcome', title: 'Log in or sign up', subtitle: 'Enter your mobile number. We’ll send a one-time code.' },
  chef: { eyebrow: 'For chefs', title: 'Chef login', subtitle: 'Use the number you registered with, or a new number to apply.' },
  admin: { eyebrow: 'Delco team', title: 'Admin login', subtitle: 'Only registered Ops and Super Admin numbers can sign in.' },
};

const isDev = APP_CONFIG.environment === 'development';
const toDenied = (e: Error) =>
  e instanceof ApiError && e.code === 'ADMIN_NOT_AUTHORIZED' && (router.replace({ pathname: '/access-denied', params: { reason: 'not_admin' } }), true);

/** Phone entry shared by customer, chef and admin login routes. */
export function PhoneLogin({ portal, footer }: { portal: LoginPortal; footer?: React.ReactNode }) {
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const c = COPY[portal];
  const send = useMutation({
    mutationFn: () => authService.requestOtp(phone, portal),
    onSuccess: () => router.push({ pathname: '/otp', params: { phone, portal } }),
    onError: toDenied,
  });
  const error = touched && !isValidPhone(phone) ? 'Enter a valid 10-digit Indian mobile number' : undefined;


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
      {send.isError && !(send.error instanceof ApiError && send.error.code === 'ADMIN_NOT_AUTHORIZED') && (
        <Notice tone="error">{send.error.message}</Notice>
      )}
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
      setTimeout(() => {
        signIn(session);
        router.dismissAll();
        router.replace(homeFor(session));
      }, 650);
    },
    onError: toDenied,
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
          disabled={code.length !== 6 || verify.isSuccess}
          loading={verify.isPending}
          onPress={() => verify.mutate()}
        />
      }
    >
      <CodeInput
        length={6}
        value={code}
        onChange={(c) => (verify.isError && verify.reset(), setCode(c))}
        error={verify.isError ? verify.error.message : undefined}
        success={verify.isSuccess}
      />
      <View style={{ alignItems: 'center', gap: 8 }}>
        {left > 0 ? (
          <Txt variant="small">Resend code in {left}s</Txt>
        ) : (
          <Button title="Resend code" variant="ghost" small loading={resend.isPending} onPress={() => resend.mutate()} />
        )}
        <Button title="Change number" variant="ghost" small onPress={() => router.back()} />
      </View>
      {resend.isError && <Notice tone="error">{resend.error.message}</Notice>}
      {isDev && (
        <Txt variant="caption" center color={colors.textMuted}>
          Development build: SMS is not connected, the code is written to the backend server log.
        </Txt>
      )}
    </Screen>
  );
}

/** Sign out and reset navigation to Welcome. */
export function useSignOut() {
  const signOut = useAuthStore((s) => s.signOut);
  return async () => {
    await authService.logout().catch(() => undefined); // always leave the app signed out, even offline
    signOut();
    router.dismissAll();
    router.replace('/welcome');
  };
}
