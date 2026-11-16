import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ChefCard, ConfirmDialog, InfoRow, ListGroup, ListRow, Notice, PlanCard, QueryView, Screen, Section, Txt } from '../../../../src/components';
import { ENDED_VISIT, startOf, UpcomingVisits } from '../../../../src/features/bookings/visits';
import { MEAL_LABELS } from '../../../../src/constants';
import { bookingService, visitService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import type { CancelPreview } from '../../../../src/types';
import { formatCurrency, formatDateTime, isNetworkError } from '../../../../src/utils';

/** Subscription details. Active only after successful payment. */
export default function SubscriptionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cancelling, setCancelling] = useState(false);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['subscription', id], queryFn: () => bookingService.getSubscription(id) });
  // Same cache as the Bookings tab; this plan's visits are the ones whose refId is the subscription.
  const visits = useQuery({ queryKey: ['visits', 'upcoming'], queryFn: visitService.listUpcoming });
  const upcoming = (visits.data ?? []).filter((v) => v.kind === 'subscription' && v.refId === id && !ENDED_VISIT.includes(v.status))
    .sort((a, b) => startOf(a).localeCompare(startOf(b)));
  // The refund is always the server's number for "now"; re-read each time the dialog opens.
  const preview = useQuery({ queryKey: ['subscription', id, 'cancel-preview'], queryFn: () => bookingService.getCancelPreview(id),
    enabled: cancelling, gcTime: 0, staleTime: 0 });
  const cancel = useMutation({
    mutationFn: () => bookingService.cancelSubscription(id, 'Cancelled by customer in the app'),
    onSuccess: ({ refundPaise }) => {
      setCancelling(false);
      ['subscription', 'subscriptions', 'schedule', 'payment', 'payments', 'requests', 'history', 'visits'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      useToast.getState().show(refundPaise ? 'Subscription cancelled. Refund requested' : 'Subscription cancelled');
    },
    onError: () => setCancelling(false),
  });
  return (
    <Screen eyebrow="Subscription" title="Your plan" refreshing={query.isRefetching} onRefresh={() => Promise.all([query.refetch(), visits.refetch()])}>
      <QueryView query={query} empty={{ title: 'Subscription not found' }}>
        {(s) => (
          <>
            <PlanCard sub={s} />
            {s.status !== 'pending_payment' && (
              <Section eyebrow={upcoming.length ? `Upcoming visits · ${upcoming.length}` : 'Upcoming visits'}>
                {upcoming.length ? <UpcomingVisits visits={upcoming.slice(0, 10)} />
                  : <Txt variant="small">{visits.isPending ? 'Loading visits…' : 'No upcoming visits for this plan.'}</Txt>}
                {upcoming.length > 10 && (
                  <Button title="See full schedule" variant="ghost" small onPress={() => router.push({ pathname: '/customer/subscriptions/[id]/schedule', params: { id: s.id } })} />
                )}
              </Section>
            )}
            {s.chef ? <ChefCard chef={s.chef} /> : s.chefName ? null : (
              <Notice icon="person-outline">Delco will assign your chef before your first visit.</Notice>
            )}
            <Card>
              {!s.chef && s.chefName && <InfoRow icon="person-outline" label="Chef" value={s.chefName} />}
              <InfoRow icon="restaurant-outline" label="Meals" value={s.meals.map((m) => MEAL_LABELS[m]).join(', ')} />
              <InfoRow icon="people-outline" label="Members" value={s.members} />
              <InfoRow icon="calendar-clear-outline" label="Off-days" value={s.offDays.length} />
            </Card>
            {s.status === 'pending_payment' ? (
              <>
                <Notice tone="warning" icon="card-outline">Complete payment to activate your subscription. Visits are scheduled only after payment succeeds.</Notice>
                <Button title="Complete payment" variant="accent" onPress={() => router.push({ pathname: '/customer/payment/summary', params: { subscriptionId: s.id } })} />
              </>
            ) : (
              <ListGroup>
                <ListRow icon="list-outline" title="Service schedule" onPress={() => router.push({ pathname: '/customer/subscriptions/[id]/schedule', params: { id: s.id } })} />
                {s.status === 'active' && (
                  <ListRow icon="calendar-clear-outline" title="Mark off-days" subtitle="Skip days you don’t need the chef" onPress={() => router.push({ pathname: '/customer/subscriptions/[id]/off-days', params: { id: s.id } })} />
                )}
                {s.paymentId && <ListRow icon="receipt-outline" title="Payment & refunds" onPress={() => router.push({ pathname: '/customer/payment/[id]', params: { id: s.paymentId! } })} />}
              </ListGroup>
            )}
            {(s.status === 'active' || s.status === 'pending_payment') && (
              <Button title="Cancel subscription" variant="ghost" icon="close-circle-outline" loading={cancel.isPending} onPress={() => setCancelling(true)} />
            )}
            {cancel.isError && (
              <Notice tone="error">{isNetworkError(cancel.error) ? 'You’re offline. Nothing was cancelled.' : cancel.error.message}</Notice>
            )}
            {cancelling && preview.isError && (
              <Notice tone="error">{isNetworkError(preview.error) ? 'You’re offline. Try again.' : preview.error.message}</Notice>
            )}
          </>
        )}
      </QueryView>
      <ConfirmDialog
        visible={cancelling && !!preview.data}
        title="Cancel this subscription?"
        message={preview.data ? cancelMessage(preview.data) : ''}
        confirmLabel="Cancel subscription"
        cancelLabel="Keep it"
        destructive
        loading={cancel.isPending}
        onCancel={() => !cancel.isPending && setCancelling(false)}
        onConfirm={() => !cancel.isPending && cancel.mutate()}
      />
    </Screen>
  );
}

function cancelMessage(p: CancelPreview): string {
  if (!p.paid) return 'Nothing has been paid, so there is nothing to refund. Your payment link will stop working.';
  const when = p.firstVisitAt ? ` Your first visit is ${formatDateTime(p.firstVisitAt)}.` : '';
  const rule = p.fullRefund
    ? 'You are cancelling more than 2 hours before your first visit, so you get a full refund'
    : 'You are cancelling 2 hours or less before your first visit, so you get a 50% refund';
  return `${rule}: ${formatCurrency(p.refundAmount)} of ${formatCurrency(p.amountPaid)}.${when} The refund is requested from the payment gateway; we’ll show it as refunded once the gateway confirms.`;
}
