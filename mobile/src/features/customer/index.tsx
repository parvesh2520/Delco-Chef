import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { create } from 'zustand';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, ErrorState, LoadingState, Notice, TextField, Txt } from '../../components';
import { customerService } from '../../services';
import type { Address, LatLng } from '../../types';
import { colors } from '../../theme';
import { isValidPincode, required } from '../../utils';

/** Location chosen on the map picker, consumed by AddressForm. */
export const usePickedLocation = create<{ picked: LatLng | null; setPicked: (p: LatLng | null) => void }>((set) => ({
  picked: null,
  setPicked: (picked) => set({ picked }),
}));

/** Initial map centre before the customer drops a pin (service city: Bengaluru). */
export const DEFAULT_CENTRE: LatLng = { lat: 12.9716, lng: 77.5946 };

type Draft = Omit<Address, 'id'> & { id?: string };

const EMPTY: Draft = { label: 'Home', line1: '', line2: '', city: 'Bengaluru', pincode: '', isDefault: false, ...DEFAULT_CENTRE };

/** Add/edit address form shared by onboarding and Manage addresses. */
export function AddressForm({ id, submitLabel = 'Save address', onSaved }: { id?: string; submitLabel?: string; onSaved: (a: Address) => void }) {
  const query = useQuery({ queryKey: ['address', id], queryFn: () => customerService.getAddress(id!), enabled: !!id });
  if (id && query.isPending) return <LoadingState />;
  if (id && query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <AddressFields initial={query.data ?? EMPTY} submitLabel={submitLabel} onSaved={onSaved} />;
}

function AddressFields({ initial, submitLabel, onSaved }: { initial: Draft; submitLabel: string; onSaved: (a: Address) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Draft>(initial);
  const [touched, setTouched] = useState(false);
  const { picked, setPicked } = usePickedLocation();
  const [hasPin, setHasPin] = useState(!!initial.id);

  useEffect(() => {
    if (!picked) return;
    setForm((f) => ({ ...f, ...picked }));
    setHasPin(true);
    setPicked(null);
  }, [picked, setPicked]);

  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }));
  const errors = {
    label: required(form.label) ? undefined : 'Give this address a name',
    line1: required(form.line1) ? undefined : 'House / flat and building are required',
    city: required(form.city) ? undefined : 'City is required',
    pincode: isValidPincode(form.pincode) ? undefined : 'Enter a 6-digit pincode',
  };
  const valid = !Object.values(errors).some(Boolean);
  const save = useMutation({
    mutationFn: () => customerService.saveAddress(form),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      qc.invalidateQueries({ queryKey: ['address'] });
      onSaved(a);
    },
  });
  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  return (
    <View style={{ gap: 14 }}>
      <TextField label="Label" value={form.label} onChangeText={(label) => set({ label })} placeholder="Home, Office…" error={err('label')} />
      <TextField label="Flat / house, building" value={form.line1} onChangeText={(line1) => set({ line1 })} error={err('line1')} />
      <TextField label="Area / sector (optional)" value={form.line2 ?? ''} onChangeText={(line2) => set({ line2 })} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TextField label="City" value={form.city} onChangeText={(city) => set({ city })} error={err('city')} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Pincode" value={form.pincode} keyboardType="number-pad" maxLength={6} onChangeText={(pincode) => set({ pincode: pincode.replace(/\D/g, '') })} error={err('pincode')} />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="label">Location pin</Txt>
        <Txt variant="small" color={hasPin ? colors.success : colors.textSecondary}>
          {hasPin ? `Pinned at ${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}` : 'Pin your door so the chef can find you.'}
        </Txt>
        <Button title={hasPin ? 'Adjust on map' : 'Pick on map'} icon="map-outline" variant="secondary" small onPress={() => router.push({ pathname: '/customer/onboarding/map-picker', params: { lat: String(form.lat), lng: String(form.lng) } })} />
      </View>
      <Checkbox checked={form.isDefault} onChange={(isDefault) => set({ isDefault })} label="Use as my default address" />
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <Button title={submitLabel} loading={save.isPending} onPress={() => (setTouched(true), valid && save.mutate())} />
    </View>
  );
}
