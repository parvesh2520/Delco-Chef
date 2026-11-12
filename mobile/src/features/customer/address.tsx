// Customer address form (A8): search, landmark, map pin, India validation. Persisted through /customers/me/addresses.
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { create } from 'zustand';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, ErrorState, LoadingState, Notice, TextField, Txt } from '../../components';
import { customerService } from '../../services';
import { colors } from '../../theme';
import type { Address, LatLng } from '../../types';
import { isNetworkError, isValidPincode, isWithinIndia, required } from '../../utils';
import { ensureLocationPermission } from '../tracking';

/** Location chosen on the map picker, consumed by AddressForm. */
export const usePickedLocation = create<{ picked: LatLng | null; setPicked: (p: LatLng | null) => void }>((set) => ({
  picked: null,
  setPicked: (picked) => set({ picked }),
}));

/** Initial map centre before the customer drops a pin (service city: Bengaluru). */
export const DEFAULT_CENTRE: LatLng = { lat: 12.9716, lng: 77.5946 };

type Draft = Omit<Address, 'id'> & { id?: string };

const EMPTY: Draft = { label: 'Home', line1: '', line2: '', landmark: '', city: 'Bengaluru', pincode: '', isDefault: false, ...DEFAULT_CENTRE };

type Place = Location.LocationGeocodedAddress | null;
type SearchHit = LatLng & { place: Place };

/**
 * Device geocoder (expo-location, no Maps key needed; Android needs location permission for it).
 * Called only when the customer taps Search, never per keystroke; the chosen point is stored with the address.
 */
async function searchPlaces(q: string): Promise<SearchHit[]> {
  await ensureLocationPermission();
  let found: Location.LocationGeocodedLocation[];
  try {
    found = await Location.geocodeAsync(`${q}, India`);
  } catch {
    throw new Error('Search is unavailable on this device right now. Pick the location on the map instead.');
  }
  const hits = found.filter((h) => isWithinIndia(h.latitude, h.longitude)).slice(0, 5);
  return Promise.all(
    hits.map(async (h) => {
      const [place] = await Location.reverseGeocodeAsync({ latitude: h.latitude, longitude: h.longitude }).catch(() => [] as Place[]);
      return { lat: h.latitude, lng: h.longitude, place: place ?? null };
    })
  );
}

const describe = (p: Place) => p?.formattedAddress || [p?.name, p?.street, p?.district, p?.city, p?.postalCode].filter(Boolean).join(', ');

/** Fill only blank text fields from a geocoded place; what the customer typed always wins. */
const fillFrom = (f: Draft, p: Place): Partial<Draft> => ({
  line2: f.line2?.trim() ? f.line2 : [p?.street, p?.district].filter(Boolean).join(', ') || f.line2,
  city: f.city.trim() ? f.city : p?.city ?? p?.subregion ?? f.city,
  pincode: f.pincode.trim() ? f.pincode : (p?.postalCode ?? '').replace(/\D/g, '').slice(0, 6),
});

/** Add/edit address form shared by onboarding and Manage addresses. */
export function AddressForm({ id, submitLabel = 'Save address', onSaved }: { id?: string; submitLabel?: string; onSaved: (a: Address) => void }) {
  const query = useQuery({ queryKey: ['address', id], queryFn: () => customerService.getAddress(id!), enabled: !!id });
  if (id && query.isPending) return <LoadingState />;
  if (id && query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <AddressFields initial={query.data ?? EMPTY} submitLabel={submitLabel} onSaved={onSaved} />;
}

function AddressFields({ initial, submitLabel, onSaved }: { initial: Draft; submitLabel: string; onSaved: (a: Address) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Draft>({ ...initial, landmark: initial.landmark ?? '' });
  const [touched, setTouched] = useState(false);
  const { picked, setPicked } = usePickedLocation();
  const [hasPin, setHasPin] = useState(!!initial.id);
  const [q, setQ] = useState('');
  const search = useMutation({ mutationFn: (text: string) => searchPlaces(text) });

  useEffect(() => {
    if (!picked) return;
    setForm((f) => ({ ...f, ...picked }));
    setHasPin(true);
    setPicked(null);
    // Suggest area / city / pincode for the new pin. Offline or no geocoder: the fields stay as typed.
    ensureLocationPermission()
      .then(() => Location.reverseGeocodeAsync({ latitude: picked.lat, longitude: picked.lng }))
      .then(([p]) => p && setForm((f) => ({ ...f, ...fillFrom(f, p) })))
      .catch(() => undefined);
  }, [picked, setPicked]);

  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }));
  const runSearch = () => q.trim().length >= 3 && !search.isPending && search.mutate(q.trim());
  const choose = (h: SearchHit) => {
    setForm((f) => ({ ...f, lat: h.lat, lng: h.lng, ...fillFrom(f, h.place) }));
    setHasPin(true);
    search.reset();
  };
  const errors = {
    label: required(form.label) ? undefined : 'Give this address a name',
    line1: form.line1.trim().length >= 3 ? undefined : 'House / flat and building are required',
    city: form.city.trim().length >= 2 ? undefined : 'City is required',
    pincode: isValidPincode(form.pincode) ? undefined : 'Enter a 6-digit pincode',
    lat: !hasPin
      ? 'Pin your location: search, pick on the map or use your current location'
      : isWithinIndia(form.lat, form.lng) ? undefined : 'Location must be within India.',
  };
  const valid = !Object.values(errors).some(Boolean);
  const save = useMutation({
    mutationFn: () => customerService.saveAddress({ ...form, landmark: form.landmark?.trim() || undefined }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      qc.invalidateQueries({ queryKey: ['address'] });
      onSaved(a);
    },
  });
  const serverFields = (save.error as { fields?: Record<string, string> } | null)?.fields;
  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined) ?? serverFields?.[k];

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 8 }}>
        <TextField
          label="Search for your area or building"
          value={q}
          onChangeText={setQ}
          placeholder="e.g. Indiranagar 100 Feet Road"
          returnKeyType="search"
          onSubmitEditing={runSearch}
        />
        <Button title="Search" icon="search-outline" variant="secondary" small loading={search.isPending} disabled={q.trim().length < 3} onPress={runSearch} />
        {search.isError && <Notice tone="error">{search.error.message}</Notice>}
        {search.isSuccess && search.data.length === 0 && <Notice tone="warning">No places in India matched. Try a nearby landmark or pick on the map.</Notice>}
        {search.data?.map((h) => (
          <Pressable
            key={`${h.lat},${h.lng}`}
            onPress={() => choose(h)}
            accessibilityRole="button"
            style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <Txt variant="bodyStrong">{describe(h.place) || 'Unnamed place'}</Txt>
            <Txt variant="caption">{h.lat.toFixed(5)}, {h.lng.toFixed(5)}</Txt>
          </Pressable>
        ))}
      </View>
      <TextField label="Label" value={form.label} onChangeText={(label) => set({ label })} placeholder="Home, Office…" maxLength={40} error={err('label')} />
      <TextField label="Flat / house, building" value={form.line1} onChangeText={(line1) => set({ line1 })} maxLength={200} error={err('line1')} />
      <TextField label="Area / sector (optional)" value={form.line2 ?? ''} onChangeText={(line2) => set({ line2 })} />
      <TextField
        label="Landmark (optional)"
        value={form.landmark ?? ''}
        onChangeText={(landmark) => set({ landmark })}
        placeholder="e.g. Opposite metro gate 2"
        maxLength={120}
        hint="Helps your chef find the entrance."
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TextField label="City" value={form.city} onChangeText={(city) => set({ city })} maxLength={60} error={err('city')} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Pincode" value={form.pincode} keyboardType="number-pad" maxLength={6} onChangeText={(pincode) => set({ pincode: pincode.replace(/\D/g, '') })} error={err('pincode')} />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="label">Location pin</Txt>
        <Txt variant="small" color={hasPin && !errors.lat ? colors.success : colors.textSecondary}>
          {hasPin ? `Pinned at ${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}` : 'Pin your door so the chef can find you.'}
        </Txt>
        {!!err('lat') && <Txt variant="caption" color={colors.error}>{err('lat')}</Txt>}
        <Button
          title={hasPin ? 'Adjust on map' : 'Pick on map'}
          icon="map-outline"
          variant="secondary"
          small
          onPress={() => router.push({ pathname: '/customer/onboarding/map-picker', params: { lat: String(form.lat), lng: String(form.lng) } })}
        />
      </View>
      <Checkbox checked={form.isDefault} onChange={(isDefault) => set({ isDefault })} label="Use as my default address" />
      {save.isError && (
        <Notice tone="error">{isNetworkError(save.error) ? 'You’re offline. Check your connection and try again.' : save.error.message}</Notice>
      )}
      <Button title={submitLabel} loading={save.isPending} onPress={() => (setTouched(true), valid && !save.isPending && save.mutate())} />
    </View>
  );
}
