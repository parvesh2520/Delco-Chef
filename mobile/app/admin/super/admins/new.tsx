import React, { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, ChipGroup, Notice, Screen, TextField, Txt } from '../../../../src/components';
import { ROLE_LABELS } from '../../../../src/constants';
import { useAdminInvalidate } from '../../../../src/features/admin';
import { adminService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import type { AdminRole } from '../../../../src/types';
import { isValidEmail, isValidPhone, required } from '../../../../src/utils';

export default function CreateAdmin() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('ops_admin');
  const [touched, setTouched] = useState(false);
  const invalidate = useAdminInvalidate();
  const errors = {
    name: required(name) ? undefined : 'Enter a name',
    phone: isValidPhone(phone) ? undefined : 'Enter a valid 10-digit mobile number',
    email: isValidEmail(email) ? undefined : 'Enter a valid email',
  };
  const ok = !errors.name && !errors.phone && !errors.email;
  const create = useMutation({
    mutationFn: () => adminService.createAdmin({ name: name.trim(), phone, email: email.trim(), role }),
    onSuccess: async () => {
      await invalidate();
      useToast.getState().show('Admin account created');
      router.back();
    },
  });
  return (
    <Screen eyebrow="Super Admin" title="Create admin" footer={<Button title="Create account" loading={create.isPending} onPress={() => (setTouched(true), ok && create.mutate())} />}>
      <TextField label="Full name" value={name} onChangeText={setName} error={touched ? errors.name : undefined} />
      <TextField label="Mobile number" prefix="+91" keyboardType="phone-pad" maxLength={10} value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, ''))} error={touched ? errors.phone : undefined} />
      <TextField label="Work email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} error={touched ? errors.email : undefined} />
      <Txt variant="label">Role</Txt>
      <ChipGroup options={(['ops_admin', 'super_admin'] as AdminRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} value={role} onChange={(v) => setRole(v as AdminRole)} />
      <Notice>{role === 'super_admin' ? 'Super Admins can manage admins, approve chefs, reveal documents and approve payouts.' : 'Ops Admins handle requests, assignments, trials, payments, attendance and settings.'}</Notice>
      {create.isError && <Notice tone="error">{create.error.message}</Notice>}
    </Screen>
  );
}
