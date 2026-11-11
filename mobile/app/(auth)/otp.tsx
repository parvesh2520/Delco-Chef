import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { OtpVerify } from '../../src/features/authentication';
import type { LoginPortal } from '../../src/services';

const PORTALS: LoginPortal[] = ['customer', 'chef', 'admin'];

/** OTP verification for customer, chef and admin (admin OTP) logins. */
export default function Otp() {
  const { phone, portal } = useLocalSearchParams<{ phone: string; portal: LoginPortal }>();
  if (!phone || !PORTALS.includes(portal)) return <Redirect href="/welcome" />;
  return <OtpVerify phone={phone} portal={portal} />;
}
