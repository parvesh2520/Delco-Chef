import React from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { Badge, Card, Notice, QueryView, Screen, Txt } from '../../components';
import { MEAL_LABELS, SERVICE_LABELS } from '../../constants';
import { useSession } from '../../navigation';
import { visitService } from '../../services';
import { colors } from '../../theme';
import type { Assignment, Visit } from '../../types';
import { formatDate, formatTime, toDateKey } from '../../utils';

export const useChefId = () => useSession()?.user.id ?? '';

export const isToday = (iso: string) => toDateKey(new Date(iso)) === toDateKey(new Date());
export const isFuture = (iso: string) => toDateKey(new Date(iso)) > toDateKey(new Date());

export const useVisit = (id: string) => useQuery({ queryKey: ['visit', id], queryFn: () => visitService.get(id), enabled: !!id });

/** Loads a visit; shows loading / error / not-found inside a Screen, else renders children(visit). */
export function VisitGate({ id, children }: { id: string; children: (v: Visit) => React.ReactElement }) {
  const query = useVisit(id);
  if (query.data) return children(query.data);
  return (
    <Screen>
      <QueryView query={query} empty={{ title: 'Visit not found' }}>{() => null}</QueryView>
    </Screen>
  );
}

/** Next screen in the visit flow for the visit's current status. */
export function nextVisitHref(v: Visit): { href: Href; label: string } | null {
  const base = `/chef/visit/${v.id}`;
  switch (v.status) {
    case 'scheduled': return { href: `${base}/start` as Href, label: 'Start travel' };
    case 'chef_travelling': return { href: `${base}/travelling` as Href, label: 'Continue navigation' };
    case 'arrived': return { href: `${base}/customer` as Href, label: 'Check in' };
    case 'checked_in':
    case 'cooking': return { href: `${base}/cooking` as Href, label: 'Open cooking timer' };
    case 'completed': return { href: `${base}/completed` as Href, label: 'View summary' };
    default: return null;
  }
}

export const mealsText = (meals: Visit['meals']) => meals.map((m) => MEAL_LABELS[m]).join(', ');

export function VisitCard({ visit }: { visit: Visit }) {
  return (
    <Card onPress={() => router.push(`/chef/job/${visit.id}` as Href)} accessibilityLabel={`Job for ${visit.customerName}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="h3" style={{ flex: 1 }}>{visit.customerName}</Txt>
        <Badge status={visit.status} />
      </View>
      <Txt variant="small">{formatDate(visit.date)} · {visit.slot} · {visit.kind === 'trial' ? 'Trial' : SERVICE_LABELS[visit.service]}</Txt>
      <Txt variant="small">{visit.address.line1}{visit.address.line2 ? `, ${visit.address.line2}` : ''}</Txt>
      {visit.allergies.length > 0 && <Txt variant="caption" color={colors.error}>Allergies: {visit.allergies.join(', ')}</Txt>}
    </Card>
  );
}

export function AssignmentCard({ assignment: a }: { assignment: Assignment }) {
  return (
    <Card onPress={() => router.push(`/chef/assignment/${a.id}` as Href)} tone={a.status === 'offered' ? 'accent' : 'default'} accessibilityLabel={`Assignment for ${a.customerName}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="h3" style={{ flex: 1 }}>{a.kind === 'trial' ? 'Trial' : 'Subscription'} · {a.customerName}</Txt>
        <Badge status={a.status} />
      </View>
      <Txt variant="small">{formatDate(a.date)} · {a.slot} · {a.area} · {a.distanceKm} km</Txt>
      <Txt variant="small">{a.members} members · {mealsText(a.meals)}</Txt>
    </Card>
  );
}

/** Allergy call-out shown wherever a chef sees customer requirements. */
export function AllergyNotice({ allergies, notes }: { allergies: string[]; notes?: string }) {
  if (!allergies.length) return <Notice tone="success" icon="checkmark-circle-outline">No allergies reported.</Notice>;
  return (
    <Notice tone="error" icon="warning-outline">
      Allergies: {allergies.join(', ')}.{notes ? ` ${notes}` : ''} Avoid these ingredients and cross-contamination.
    </Notice>
  );
}

export const timeOrDash = (iso?: string) => (iso ? formatTime(iso) : '—');

// ---- Check-out checklist progress (per visit, this session only) ----
interface CheckoutState {
  byVisit: Record<string, { food: boolean; selfie: boolean }>;
  mark: (visitId: string, key: 'food' | 'selfie') => void;
  reset: (visitId: string) => void;
}

export const useCheckoutProgress = create<CheckoutState>((set) => ({
  byVisit: {},
  mark: (id, key) => set((s) => ({ byVisit: { ...s.byVisit, [id]: { ...(s.byVisit[id] ?? { food: false, selfie: false }), [key]: true } } })),
  reset: (id) => set((s) => {
    const { [id]: _, ...rest } = s.byVisit;
    return { byVisit: rest };
  }),
}));

// ---- Registration extras not part of the API draft type (about, languages) ----
interface RegExtrasState {
  about: string;
  languages: string[];
  update: (p: Partial<Pick<RegExtrasState, 'about' | 'languages'>>) => void;
}

export const useRegistrationExtras = create<RegExtrasState>((set) => ({
  about: '',
  languages: [],
  update: (p) => set(p),
}));
