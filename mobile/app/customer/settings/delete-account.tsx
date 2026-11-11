import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, ConfirmDialog, Notice, Screen, TextField, Txt } from '../../../src/components';
import { useSignOut } from '../../../src/features/authentication';
import { customerService } from '../../../src/services';
import { useToast } from '../../../src/store';
import { colors } from '../../../src/theme';

/** Delete account confirmation. */
export default function DeleteAccount() {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [confirming, setConfirming] = useState(false);
  const signOut = useSignOut();
  const del = useMutation({
    mutationFn: () => customerService.deleteAccount(reason),
    onSuccess: async () => {
      setConfirming(false);
      useToast.getState().show('Your account has been deleted', 'info');
      await signOut();
    },
  });
  const ready = typed.trim().toUpperCase() === 'DELETE';
  return (
    <Screen eyebrow="Privacy" title="Delete account" footer={<Button title="Delete my account" variant="danger" disabled={!ready} onPress={() => setConfirming(true)} />}>
      <Card tone="cream">
        <Txt variant="h3" color={colors.error}>This can’t be undone</Txt>
        <Txt variant="body">• Open requests and future visits will be cancelled.</Txt>
        <Txt variant="body">• Active subscriptions end; refunds follow the Refund Policy.</Txt>
        <Txt variant="body">• Payment records are retained as required by law.</Txt>
      </Card>
      <Notice icon="download-outline">Want a copy first? Use “Download my data” in Profile.</Notice>
      <TextField label="Why are you leaving? (optional)" multiline value={reason} onChangeText={setReason} />
      <TextField label='Type "DELETE" to confirm' autoCapitalize="characters" value={typed} onChangeText={setTyped} />
      {del.isError && <Notice tone="error">{del.error.message}</Notice>}
      <ConfirmDialog
        visible={confirming}
        title="Delete your account?"
        message="You’ll be signed out and your personal data will be removed."
        confirmLabel="Delete permanently"
        destructive
        loading={del.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => del.mutate()}
      />
    </Screen>
  );
}
