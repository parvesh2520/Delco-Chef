import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, ConfirmDialog, InfoRow, ListGroup, ListRow, Notice, QueryView, Screen } from '../../../../src/components';
import { MEAL_LABELS, SERVICE_LABELS } from '../../../../src/constants';
import { bookingService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import type { CancelPreview } from '../../../../src/types';
import { formatCurrency, formatDate, formatDateTime, isNetworkError } from '../../../../src/utils';

/** Subscription details. Active only after successful payment. */
export default function SubscriptionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cancelling, setCancelling] = useState(false);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['subscription', id], queryFn: () => bookingService.getSubscription(id) });
  // The refund is always the server's number for "now"; re-read each time the dialog opens.
  const preview = useQuery({ queryKey: ['subscription', id, 'cancel-preview'], queryFn: () => bookingService.getCancelPreview(id),
    enabled: cancelling, gcTime: 0, staleTime: 0 });
  const cancel = useMutation({
    mutationFn: () => bookingService.cancelSubscription(id, 'Cancelled by customer in the app'),
    onSuccess: ({ refundPaise }) => {
      setCancelling(false);
      ['subscription', 'subscriptions', 'schedule', 'payment', 'payments', 'requests', 'history'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      useToast.getState().show(refundPaise ? 'Subscription cancelled. Refund requested' : 'Subscription cancelled');
    },
    onError: () => setCancelling(false),
  });
  return (
    <Screen eyebrow="Subscription" title="Your plan" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Subscription not found' }}>
        {(s) => (
          <>
            <Card>
              <Badge status={s.status} />
              <InfoRow label="Service" value={SERVICE_LABELS[s.service]} />
              <InfoRow label="Chef" value={s.chefName} />
              <InfoRow label="Period" value={`${formatDate(s.startDate)} – ${formatDate(s.endDate)}`} />
              <InfoRow label="Slot" value={s.slot} />
              <InfoRow label="Meals" value={s.meals.map((m) => MEAL_LABELS[m]).join(', ')} />
              <InfoRow label="Members" value={s.members} />
              <InfoRow label="Amount" value={formatCurrency(s.amount)} />
              <InfoRow label="Off-days" value={s.offDays.length} />
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
