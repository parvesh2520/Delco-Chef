import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, ConfirmDialog, QueryView, Screen, Txt } from '../../../src/components';
import { customerService } from '../../../src/services';
import { useToast } from '../../../src/store';
import type { Address } from '../../../src/types';

/** Manage addresses. */
export default function Addresses() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['addresses'], queryFn: customerService.listAddresses });
  const [toDelete, setToDelete] = useState<Address | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => customerService.deleteAddress(id),
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['addresses'] });
      useToast.getState().show('Address removed');
    },
  });
  return (
    <Screen
      eyebrow="Account"
      title="Manage addresses"
      footer={<Button title="Add address" icon="add" onPress={() => router.push('/customer/settings/address-form')} />}
    >
      <QueryView query={query} empty={{ title: 'No addresses', message: 'Add the address where the chef should come.', icon: 'location-outline' }}>
        {(list) =>
          list.map((a) => (
            <Card key={a.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="h3">{a.label}</Txt>
                {a.isDefault && <Badge label="Default" tone="success" />}
              </View>
              <Txt variant="small">{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.pincode}</Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Edit" small variant="secondary" icon="create-outline" onPress={() => router.push({ pathname: '/customer/settings/address-form', params: { id: a.id } })} />
                <Button title="Delete" small variant="ghost" icon="trash-outline" disabled={a.isDefault && list.length > 1} onPress={() => setToDelete(a)} />
              </View>
            </Card>
          ))
        }
      </QueryView>
      <ConfirmDialog
        visible={!!toDelete}
        title="Delete this address?"
        message={toDelete ? `${toDelete.label} · ${toDelete.line1}` : undefined}
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </Screen>
  );
}
