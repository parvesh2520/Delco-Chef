import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ChipGroup, Notice, QueryView, RollingNumber, Screen, Section, StepProgress, Stepper, Txt } from '../../../../src/components';
import { MEAL_LABELS, SERVICE_LABELS, WEEKDAYS } from '../../../../src/constants';
import { BookingGate } from '../../../../src/features/bookings';
import { bookingService, customerService } from '../../../../src/services';
import { useBookingDraft } from '../../../../src/store';
import { colors } from '../../../../src/theme';
import type { BookableService, MealType } from '../../../../src/types';
import { formatDate, toDateKey } from '../../../../src/utils';

// Custom Time: the end date is 7 to 90 days after the start, both ends counted (validated again on the server).
const MIN_DAYS = 7;
const MAX_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (k: string, n: number) => toDateKey(new Date(parseKey(k).getTime() + n * DAY_MS + 12 * 60 * 60 * 1000));
/** Days from start to end, both included. */
const spanDays = (start: string, end: string) => Math.round((parseKey(end).getTime() - parseKey(start).getTime()) / DAY_MS) + 1;

/** Pick an exact end date: step a day at a time or jump by a week, bounded to 7–90 days from the start. */
function EndDatePicker({ start, value, onChange }: { start: string; value?: string; onChange: (k: string) => void }) {
  const min = addDays(start, MIN_DAYS - 1);
  const max = addDays(start, MAX_DAYS - 1);
  const end = value ?? min;
  const span = spanDays(start, end);
  const move = (n: number) => {
    const next = addDays(end, n);
    onChange(next < min ? min : next > max ? max : next);
  };
  const btn = (label: string, n: number, disabled: boolean) => (
    <Button key={label} title={label} small variant="secondary" disabled={disabled} onPress={() => move(n)} />
  );
  return (
    <Card>
      <Txt variant="label">Last service day</Txt>
      <Txt variant="h3">{formatDate(end)}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <RollingNumber variant="h2" color={colors.purple} value={span} />
        <Txt variant="small">days including the start date · allowed {MIN_DAYS} to {MAX_DAYS}</Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {btn('− 1 week', -7, end <= min)}
        {btn('− 1 day', -1, end <= min)}
        {btn('+ 1 day', 1, end >= max)}
        {btn('+ 1 week', 7, end >= max)}
      </View>
    </Card>
  );
}

/** Booking step 1 — service requirements. */
export default function Requirements() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <BookingGate service={service}>{(s) => <RequirementsForm service={s} />}</BookingGate>;
}

function RequirementsForm({ service }: { service: BookableService }) {
  const { draft, update } = useBookingDraft();
  const [touched, setTouched] = useState(false);
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: customerService.listAddresses });
  const profile = useQuery({ queryKey: ['profile'], queryFn: customerService.getProfile });
  // Load the food needs saved with the profile (kept in step with the last request) once, without overwriting edits.
  const prefilled = useRef(false);
  useEffect(() => {
    const p = profile.data;
    if (!p || prefilled.current) return;
    prefilled.current = true;
    const d = useBookingDraft.getState().draft;
    const savedAllergies = !!(p.allergies?.length || p.allergyNotes);
    update({
      members: d.members ?? (p.householdSize ? Math.min(7, Math.max(1, p.householdSize)) : undefined),
      diet: d.diet ?? p.diet ?? undefined,
      cuisines: d.cuisines?.length ? d.cuisines : p.cuisines ?? [],
      allergies: d.allergies?.length ? d.allergies : p.allergies ?? [],
      allergyNotes: d.allergyNotes ?? p.allergyNotes ?? undefined,
      hasAllergies: d.hasAllergies ?? (savedAllergies ? true : undefined),
    });
  }, [profile.data, update]);
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
    isCustom && !draft.endDate && 'Choose an end date',
    isCustom && !!draft.startDate && !!draft.endDate && (spanDays(draft.startDate, draft.endDate) < MIN_DAYS || spanDays(draft.startDate, draft.endDate) > MAX_DAYS) && 'The end date must be 7 to 90 days from the start',
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
        <ChipGroup
          options={dates}
          value={draft.startDate}
          onChange={(v) => {
            const startDate = v as string;
            // Keep the same length when the start moves; it is re-clamped to 7–90 days.
            const len = draft.startDate && draft.endDate ? spanDays(draft.startDate, draft.endDate) : 14;
            update({ startDate, ...(isCustom ? { endDate: addDays(startDate, Math.min(MAX_DAYS, Math.max(MIN_DAYS, len)) - 1), durationDays: undefined } : {}) });
          }}
        />
        <Txt variant="caption">Bookings start tomorrow or later (IST).</Txt>
      </Section>
      {isCustom && (
        <Section title="End date">
          {draft.startDate ? (
            <EndDatePicker start={draft.startDate} value={draft.endDate} onChange={(endDate) => update({ endDate, durationDays: undefined })} />
          ) : (
            <Notice>Choose a start date first.</Notice>
          )}
        </Section>
      )}
      {isCustom && (
        <Section title="Days to be served">
          <ChipGroup multi options={WEEKDAYS} value={(draft.weekdays ?? []).map(String)} onChange={(v) => update({ weekdays: (v as string[]).map(Number) })} />
        </Section>
      )}
      <Section title="Address" action={(addresses.data?.length ?? 0) < (config.data?.maxAddresses ?? 3) ? <Button title="Add new" variant="ghost" small icon="add" onPress={() => router.push('/customer/settings/address-form')} /> : undefined}>
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
