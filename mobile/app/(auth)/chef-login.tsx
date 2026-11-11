import React from 'react';
import { PhoneLogin } from '../../src/features/authentication';
import { Notice } from '../../src/components';

/** Chef login; a new number continues into chef registration after OTP. */
export default function ChefLogin() {
  return <PhoneLogin portal="chef" footer={<Notice icon="person-add-outline">New to Delco? Verify your number to start your chef application.</Notice>} />;
}
