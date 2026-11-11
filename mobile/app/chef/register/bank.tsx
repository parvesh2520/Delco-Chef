import React, { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Notice, Screen, StepProgress, TextField } from '../../../src/components';
import { authService, chefService, type ChefApplicationDraft } from '../../../src/services';
import { useAuthStore, useChefDraft } from '../../../src/store';
import { isValidIfsc, required } from '../../../src/utils';

type BankDraft = ChefApplicationDraft['bank'];

/** Step 5: bank details, then submit the application. */
export default function ChefRegisterBank() {
  const { draft, update, reset } = useChefDraft();
  const setChefStatus = useAuthStore((s) => s.setChefStatus);
  const setName = useAuthStore((s) => s.setName);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState('');
  const bank: BankDraft = draft.bank ?? { accountName: '', accountNumber: '', ifsc: '', upi: '' };
  const setBank = (p: Partial<BankDraft>) => update({ bank: { ...bank, ...p } });

  const errors = {
    accountName: required(bank.accountName) ? undefined : 'Enter the account holder name',
    accountNumber: /^\d{9,18}$/.test(bank.accountNumber) ? undefined : 'Enter a valid account number (9–18 digits)',
    confirm: confirm === bank.accountNumber ? undefined : 'Account numbers do not match',
    ifsc: isValidIfsc(bank.ifsc) ? undefined : 'Enter a valid IFSC (e.g. HDFC0001234)',
    upi: !bank.upi || /^[\w.-]+@\w+$/.test(bank.upi) ? undefined : 'Enter a valid UPI ID',
  };
  const valid = Object.values(errors).every((e) => !e);
  const show = (k: keyof typeof errors) => (tried ? errors[k] : undefined);

  const submit = useMutation({
    mutationFn: () => chefService.submitApplication({ ...draft, bank } as ChefApplicationDraft),
    onSuccess: async (chef) => {
      if (draft.fullName) setName(draft.fullName);
      setChefStatus(chef.status);
      await authService.reloadSession().catch(() => undefined);
      reset();
      if (router.canDismiss()) router.dismissAll();
      router.replace('/chef/register/pending');
    },
  });
  const onSubmit = () => {
    setTried(true);
    if (valid) submit.mutate();
  };

  return (
    <Screen title="Bank details" subtitle="Payouts for completed visits are sent to this account." footer={<Button title="Submit application" loading={submit.isPending} onPress={onSubmit} />}>
      <StepProgress step={5} total={5} label="Bank" />
      <TextField label="Account holder name" value={bank.accountName} onChangeText={(accountName) => setBank({ accountName })} error={show('accountName')} autoCapitalize="words" />
      <TextField label="Account number" value={bank.accountNumber} onChangeText={(t) => setBank({ accountNumber: t.replace(/\D/g, '') })} error={show('accountNumber')} keyboardType="number-pad" secureTextEntry />
      <TextField label="Confirm account number" value={confirm} onChangeText={(t) => setConfirm(t.replace(/\D/g, ''))} error={show('confirm')} keyboardType="number-pad" />
      <TextField label="IFSC" value={bank.ifsc} onChangeText={(t) => setBank({ ifsc: t.toUpperCase().trim() })} error={show('ifsc')} autoCapitalize="characters" maxLength={11} />
      <TextField label="UPI ID (optional)" value={bank.upi ?? ''} onChangeText={(upi) => setBank({ upi: upi.trim() })} error={show('upi')} autoCapitalize="none" />
      {submit.isError && <Notice tone="error">{submit.error.message}</Notice>}
    </Screen>
  );
}
