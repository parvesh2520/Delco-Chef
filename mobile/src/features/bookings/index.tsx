import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, ErrorState, InfoRow, LoadingState, Notice, Screen, Txt } from '../../components';
import { DURATION, EASE_OUT, haptic, PopIn, PressableScale, PulseDot, useWiggle } from '../../motion';
import { DIET_LABELS, isBookable, MEAL_LABELS, SERVICE_LABELS } from '../../constants';
import { bookingService, type ServiceEligibility } from '../../services';
import { useBookingDraft, useToast } from '../../store';
import { colors } from '../../theme';
import type { BookableService, BookingRequirements, ServiceOffering, ServiceRequest, ServiceType } from '../../types';
import { formatDate, isNetworkError, type Tone } from '../../utils';

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
      {!!r.endDate && <InfoRow label="End date" value={formatDate(r.endDate)} />}
      {r.durationDays !== undefined && !r.endDate && <InfoRow label="Duration" value={`${r.durationDays} days`} />}
      <InfoRow label="Diet" value={r.diet ? DIET_LABELS[r.diet] : undefined} />
      <InfoRow label="Cuisines" value={r.cuisines?.join(', ')} />
      {!!r.dietaryNotes && <InfoRow label="Diet notes" value={r.dietaryNotes} />}
      <InfoRow label="Allergies" value={r.hasAllergies === false ? 'No' : r.allergies?.length ? r.allergies.join(', ') : r.hasAllergies ? 'Yes' : 'None'} />
      {!!r.allergyNotes && <InfoRow label="Allergy notes" value={r.allergyNotes} />}
      {!!r.instructions && <InfoRow label="Instructions" value={r.instructions} />}
    </Card>
  );
}

const TRIAL_STATUS: Record<ServiceEligibility['trialStatus'], { label: string; tone: Tone }> = {
  not_started: { label: 'Trial not started', tone: 'neutral' },
  trial_in_progress: { label: 'Trial in progress', tone: 'info' },
  trial_completed: { label: 'Trial completed', tone: 'success' },
  trials_used: { label: 'Trials used', tone: 'warning' },
};

/** A6: the signed-in customer's trial status on a subscription service card, and why it can't be requested. */
export function ServiceStatus({ e }: { e: ServiceEligibility }) {
  const s = TRIAL_STATUS[e.trialStatus];
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Badge label={s.label} tone={s.tone} />
        <Txt variant="caption">{e.trialsUsed} of {e.maxTrials} free trials used</Txt>
      </View>
      {!e.canRequest && <Txt variant="caption" color={colors.warning}>Unavailable for a new request: {e.reason ?? 'you have an open request.'}</Txt>}
    </View>
  );
}

/**
 * A6: "Notify me" for a coming-soon service. Saved on the server (idempotent); the button reflects the saved
 * state from GET /services, so it survives restarts and can't create duplicates.
 */
export function NotifyMeButton({ s, small }: { s: ServiceOffering; small?: boolean }) {
  const qc = useQueryClient();
  const notify = useMutation({
    mutationFn: () => bookingService.notifyMe(s.type),
    onSuccess: (res) => {
      const mark = (o?: ServiceOffering) => (o && o.type === s.type ? { ...o, interested: true } : o);
      qc.setQueryData<ServiceOffering[]>(['services'], (list) => list?.map((o) => mark(o)!));
      qc.setQueryData<ServiceOffering>(['services', s.type], (o) => mark(o));
      useToast.getState().show(res.alreadyRegistered ? 'You’re already on the list for this service' : `We’ll notify you when ${s.name} launches`, res.alreadyRegistered ? 'info' : 'success');
    },
  });
  const [rotate, wiggle] = useWiggle();
  if (s.interested)
    return (
      <PopIn style={{ alignSelf: 'flex-start' }}>
        <Badge label="You’ll be notified" tone="success" />
      </PopIn>
    );
  return (
    <View style={{ gap: 6 }}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Notify me"
        accessibilityState={{ busy: notify.isPending }}
        disabled={notify.isPending}
        to={0.94}
        feedback={false}
        onPress={() => {
          if (notify.isPending) return;
          haptic.light();
          wiggle();
          notify.mutate();
        }}
        style={[bellStyles.btn, small && bellStyles.small, notify.isPending && { opacity: 0.6 }]}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="notifications-outline" size={small ? 16 : 18} color={colors.primary} />
        </Animated.View>
        <Txt variant="label">{notify.isPending ? 'Saving…' : 'Notify me'}</Txt>
      </PressableScale>
      {notify.isError && (
        <Notice tone="error">{isNetworkError(notify.error) ? 'You’re offline. Check your connection and try again.' : notify.error.message}</Notice>
      )}
    </View>
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
  const current = steps.findIndex((s) => !s.done);
  return (
    <Card>
      {steps.map((s, i) => (
        <View key={s.label} style={styles.step}>
          <View style={{ alignItems: 'center' }}>
            {i === current ? (
              <View style={[styles.dot, { borderColor: colors.purple, borderWidth: 0 }]}>
                <PulseDot color={colors.purple} size={9} />
              </View>
            ) : (
              <PopIn delay={i * 140} style={[styles.dot, s.done && { backgroundColor: colors.success, borderColor: colors.success }]}>
                {s.done && <Ionicons name="checkmark" size={12} color="#fff" />}
              </PopIn>
            )}
            {i < steps.length - 1 && <DrawLine done={s.done} index={i} />}
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

function DrawLine({ done, index }: { done: boolean; index: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: DURATION.slow, delay: 120 + index * 140, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [v, index]);
  return (
    <View style={styles.line}>
      {done && <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.success, transformOrigin: 'top', transform: [{ scaleY: v }] }]} />}
    </View>
  );
}

const bellStyles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary },
  small: { minHeight: 38, paddingHorizontal: 16, alignSelf: 'flex-start' },
});

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 12 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
});
