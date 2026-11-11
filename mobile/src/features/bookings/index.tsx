import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, ErrorState, InfoRow, LoadingState, Screen, Txt } from '../../components';
import { DIET_LABELS, isBookable, MEAL_LABELS, SERVICE_LABELS } from '../../constants';
import { bookingService } from '../../services';
import { useBookingDraft } from '../../store';
import { colors } from '../../theme';
import type { BookableService, BookingRequirements, ServiceRequest, ServiceType } from '../../types';
import { formatDate } from '../../utils';

export const SERVICE_ICONS: Record<ServiceType, keyof typeof Ionicons.glyphMap> = {
  monthly_subscription: 'calendar-outline',
  custom_time: 'time-outline',
  home_food: 'fast-food-outline',
  party_mode: 'wine-outline',
};

/**
 * Wraps every booking-wizard step. Sends the customer back to the service page when the
 * service isn't bookable (Home Food / Party Mode) or a request for it is already open.
 */
export function BookingGate({ service, children }: { service?: string; children: (s: BookableService) => React.ReactNode }) {
  const bookable = !!service && isBookable(service);
  const elig = useQuery({
    queryKey: ['eligibility', service],
    queryFn: () => bookingService.getEligibility(service as BookableService),
    enabled: bookable,
  });
  const draftService = useBookingDraft((s) => s.draft.service);
  const start = useBookingDraft((s) => s.start);
  useEffect(() => {
    if (bookable && draftService !== service) start(service as BookableService);
  }, [bookable, draftService, service, start]);

  if (!bookable) return <Redirect href={{ pathname: '/customer/services/[service]', params: { service: service ?? 'unknown' } }} />;
  if (elig.isPending) return <Screen><LoadingState /></Screen>;
  if (elig.isError) return <Screen><ErrorState error={elig.error} onRetry={() => elig.refetch()} /></Screen>;
  if (!elig.data.canRequest) return <Redirect href={{ pathname: '/customer/services/[service]', params: { service: service! } }} />;
  if (draftService !== service) return <Screen><LoadingState /></Screen>;
  return <>{children(service as BookableService)}</>;
}

/** Read-only summary of booking requirements. */
export function RequirementsCard({ service, r }: { service?: BookableService; r: Partial<BookingRequirements> }) {
  return (
    <Card>
      {service && <Txt variant="h3">{SERVICE_LABELS[service]}</Txt>}
      <InfoRow label="Members" value={r.members} />
      <InfoRow label="Meals" value={r.meals?.map((m) => MEAL_LABELS[m]).join(', ')} />
      <InfoRow label="Slot" value={r.slot} />
      <InfoRow label="Start date" value={r.startDate ? formatDate(r.startDate) : undefined} />
      {r.durationDays !== undefined && <InfoRow label="Duration" value={`${r.durationDays} days`} />}
      <InfoRow label="Diet" value={r.diet ? DIET_LABELS[r.diet] : undefined} />
      <InfoRow label="Cuisines" value={r.cuisines?.join(', ')} />
      {!!r.dietaryNotes && <InfoRow label="Diet notes" value={r.dietaryNotes} />}
      <InfoRow label="Allergies" value={r.allergies?.length ? r.allergies.join(', ') : 'None'} />
      {!!r.allergyNotes && <InfoRow label="Allergy notes" value={r.allergyNotes} />}
      {!!r.instructions && <InfoRow label="Instructions" value={r.instructions} />}
    </Card>
  );
}

/** Vertical progress timeline for a service request. */
export function RequestTimeline({ request }: { request: ServiceRequest }) {
  const trialStarted = request.trials.some((t) => ['scheduled', 'in_progress', 'completed'].includes(t.status));
  const trialDone = request.trials.some((t) => t.status === 'completed');
  const steps: { label: string; detail?: string; done: boolean }[] = [
    { label: 'Request submitted', detail: formatDate(request.createdAt), done: true },
    { label: 'Chef assigned by Delco', detail: request.assignedChefName ?? 'Our team is matching a verified chef', done: !!request.assignedChefName },
    { label: 'Trial scheduled', done: trialStarted },
    { label: 'Trial completed — your decision', done: trialDone && !['awaiting_decision'].includes(request.status) },
    { label: request.status === 'rejected' ? 'Request closed' : 'Subscription active', done: ['converted', 'rejected'].includes(request.status) },
  ];
  return (
    <Card>
      {steps.map((s, i) => (
        <View key={s.label} style={styles.step}>
          <View style={{ alignItems: 'center' }}>
            <View style={[styles.dot, s.done && { backgroundColor: colors.success, borderColor: colors.success }]}>
              {s.done && <Ionicons name="checkmark" size={12} color="#fff" />}
            </View>
            {i < steps.length - 1 && <View style={[styles.line, s.done && { backgroundColor: colors.success }]} />}
          </View>
          <View style={{ flex: 1, paddingBottom: 14 }}>
            <Txt variant="bodyStrong" color={s.done ? colors.text : colors.textSecondary}>{s.label}</Txt>
            {s.detail && <Txt variant="small">{s.detail}</Txt>}
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 12 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
});
