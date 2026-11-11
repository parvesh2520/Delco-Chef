import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ChipGroup, QueryView, Screen, Section, StepProgress, Stepper, Txt } from '../../../../src/components';
import { MEAL_LABELS, SERVICE_LABELS, WEEKDAYS } from '../../../../src/constants';
import { BookingGate } from '../../../../src/features/bookings';
import { bookingService, customerService } from '../../../../src/services';
import { useBookingDraft } from '../../../../src/store';
import { colors } from '../../../../src/theme';
import type { BookableService, MealType } from '../../../../src/types';
import { toDateKey } from '../../../../src/utils';

// Custom Time: 7 to 90 days, both ends counted (validated again on the server).
const DURATIONS = ['7', '14', '21', '30', '60', '90'] as const;

/** Booking step 1 — service requirements. */
export default function Requirements() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <BookingGate service={service}>{(s) => <RequirementsForm service={s} />}</BookingGate>;
}

function RequirementsForm({ service }: { service: BookableService }) {
  const { draft, update } = useBookingDraft();
  const [touched, setTouched] = useState(false);
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: customerService.listAddresses });
  // Slot times are system settings, so they come from the API rather than the app bundle.
  const config = useQuery({ queryKey: ['config'], queryFn: bookingService.getConfig, staleTime: 5 * 60 * 1000 });
  const dates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i + 1);
        return { value: toDateKey(d), label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) };
      }),
    []
  );
  const members = draft.members ?? 2;
  const addressId = draft.addressId ?? addresses.data?.find((a) => a.isDefault)?.id;
  const isCustom = service === 'custom_time';

  const errors = [
    !draft.meals?.length && 'Choose at least one meal',
    !draft.slot && 'Choose a time slot',
    !draft.startDate && 'Choose a start date',
    isCustom && !draft.durationDays && 'Choose the number of days',
    isCustom && !draft.weekdays?.length && 'Choose at least one weekday',
    !addressId && 'Choose an address',
  ].filter(Boolean) as string[];

  const next = () => {
    setTouched(true);
    if (errors.length) return;
    update({ members, addressId });
    router.push({ pathname: '/customer/book/[service]/dietary', params: { service } });
  };

  return (
    <Screen eyebrow={SERVICE_LABELS[service]} title="Service requirements" footer={<Button title="Next: dietary preferences" onPress={next} />}>
      <StepProgress step={1} total={5} label="Requirements" />
      <Card>
        <Stepper label="People to cook for" value={members} onChange={(n) => update({ members: n })} min={1} max={7} />
      </Card>
      <Section title="Meals">
        <ChipGroup multi options={(Object.keys(MEAL_LABELS) as MealType[]).map((m) => ({ value: m, label: MEAL_LABELS[m] }))} value={draft.meals ?? []} onChange={(v) => update({ meals: v as MealType[] })} />
      </Section>
      <Section title="Preferred slot">
        <QueryView query={config} empty={{ title: 'Slots unavailable' }}>
          {(c) => <ChipGroup options={c.slots} value={draft.slot} onChange={(v) => update({ slot: v as string })} />}
        </QueryView>
      </Section>
      <Section title="Start date">
        <ChipGroup options={dates} value={draft.startDate} onChange={(v) => update({ startDate: v as string })} />
      </Section>
      {isCustom && (
        <Section title="Number of days">
          <ChipGroup options={DURATIONS.map((d) => ({ value: d, label: `${d} days` }))} value={draft.durationDays ? String(draft.durationDays) : undefined} onChange={(v) => update({ durationDays: Number(v) })} />
        </Section>
      )}
      {isCustom && (
        <Section title="Days to be served">
          <ChipGroup multi options={WEEKDAYS} value={(draft.weekdays ?? []).map(String)} onChange={(v) => update({ weekdays: (v as string[]).map(Number) })} />
        </Section>
      )}
      <Section title="Address" action={<Button title="Add new" variant="ghost" small icon="add" onPress={() => router.push('/customer/settings/address-form')} />}>
        <QueryView query={addresses} empty={{ title: 'No addresses yet', message: 'Add an address to continue.' }}>
          {(list) =>
            list.map((a) => {
              const on = a.id === addressId;
              return (
                <Card key={a.id} onPress={() => update({ addressId: a.id })} style={on && { borderColor: colors.primary, borderWidth: 2 }} accessibilityLabel={`${a.label}${on ? ', selected' : ''}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">{a.label}</Txt>
                      <Txt variant="small">{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.pincode}</Txt>
                    </View>
                  </View>
                </Card>
              );
            })
          }
        </QueryView>
      </Section>
      {touched && errors.length > 0 && <Txt variant="small" color={colors.error}>{errors.join(' · ')}</Txt>}
    </Screen>
  );
}
