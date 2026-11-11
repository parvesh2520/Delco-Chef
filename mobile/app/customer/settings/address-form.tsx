import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../src/components';
import { AddressForm } from '../../../src/features/customer';
import { useToast } from '../../../src/store';

/** Add / edit address. */
export default function AddressFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <Screen eyebrow="Addresses" title={id ? 'Edit address' : 'Add address'}>
      <AddressForm
        id={id}
        onSaved={() => {
          useToast.getState().show('Address saved');
          router.back();
        }}
      />
    </Screen>
  );
}
