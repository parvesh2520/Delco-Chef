import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ConfirmDialog, Notice, QueryView, Screen, Txt } from '../../../../src/components';
import { SERVICE_LABELS } from '../../../../src/constants';
import { ApiError, bookingService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import { colors } from '../../../../src/theme';
import type { Trial, TrialDecision } from '../../../../src/types';
import { humanize, isNetworkError } from '../../../../src/utils';

type Option = { title: string; body: string; icon: keyof typeof Ionicons.glyphMap; confirm: string };

/** Copy for each decision. Which ones appear is decided only by the server (`allowedDecisions`). */
const OPTIONS: Record<TrialDecision, Option> = {
  subscribe: { title: 'Subscribe', body: 'Continue with this chef. Your plan activates after payment.', icon: 'checkmark-circle-outline', confirm: 'Subscribe & pay' },
  another_trial: { title: 'Request another trial', body: 'Try one more free trial. Delco may assign a different chef.', icon: 'refresh-circle-outline', confirm: 'Request another trial' },
  reject: { title: 'Reject', body: 'Close this request. You can still subscribe to this service later at the normal price.', icon: 'close-circle-outline', confirm: 'Reject & close' },
};

/** C2: after a completed trial, show only the choices the server allows (after trial 1: Subscribe / Another trial; after the final trial: Subscribe / Reject). */
export default function TrialDecisionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['trial', id], queryFn: () => bookingService.getTrial(id) });
  return (
    <Screen eyebrow="Your decision" title="What would you like to do?" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Trial not found' }}>
        {({ trial }) => <Decision trial={trial} onStale={() => query.refetch()} />}
      </QueryView>
    </Screen>
  );
}

function Decision({ trial, onStale }: { trial: Trial; onStale: () => void }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<TrialDecision | null>(null);
  const allowed = (trial.allowedDecisions ?? []).filter((d): d is TrialDecision => d in OPTIONS);
  const decide = useMutation({
    mutationFn: (d: TrialDecision) => bookingService.submitTrialDecision(trial.id, d),
    onSuccess: ({ decision, subscriptionId }) => {
      setPending(null);
      ['requests', 'request', 'trials', 'trial', 'subscriptions', 'history', 'eligibility', 'services'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (decision === 'subscribe' && subscriptionId) {
        router.replace({ pathname: '/customer/payment/summary', params: { subscriptionId } });
      } else if (decision === 'another_trial') {
        useToast.getState().show('Another trial requested');
        router.replace({ pathname: '/customer/trials/request/[id]', params: { id: trial.requestId } });
      } else {
        useToast.getState().show('Request closed', 'info');
        if (router.canDismiss()) router.dismissAll();
        router.navigate('/customer/bookings');
      }
    },
    onError: (e) => {
      setPending(null);
      // The state changed elsewhere (decided on another device, request closed): reload what the server now allows.
      if (e instanceof ApiError && e.status === 409) onStale();
    },
  });

  if (trial.decision) {
    return (
      <>
        <Notice tone="success" icon="checkmark-circle-outline">You chose “{humanize(trial.decision)}” for trial {trial.number}.</Notice>
        <Button title="View request status" onPress={() => router.replace({ pathname: '/customer/trials/request/[id]', params: { id: trial.requestId } })} />
      </>
    );
  }
  if (trial.status !== 'completed') {
    return <Notice>You can decide once trial {trial.number} is completed. Its status is “{humanize(trial.status)}”.</Notice>;
  }
  if (!allowed.length) {
    return (
      <>
        <Notice tone="warning">There’s no decision to make on this trial right now. The request may have moved on or been closed.</Notice>
        <Button title="View request status" variant="secondary" onPress={() => router.replace({ pathname: '/customer/trials/request/[id]', params: { id: trial.requestId } })} />
      </>
    );
  }

  const unavailable = (Object.keys(OPTIONS) as TrialDecision[]).filter((d) => !allowed.includes(d));
  const option = pending ? OPTIONS[pending] : null;
  return (
    <>
      <Txt variant="body" color={colors.textSecondary}>
        {SERVICE_LABELS[trial.service]} · Trial {trial.number} with {trial.chefName ?? 'your chef'}
      </Txt>
      {allowed.map((d) => {
        const o = OPTIONS[d];
        return (
          <Card key={d} onPress={decide.isPending ? undefined : () => setPending(d)} tone={d === 'subscribe' ? 'accent' : 'default'} accessibilityLabel={o.title}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name={o.icon} size={28} color={d === 'reject' ? colors.error : colors.purple} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">{o.title}</Txt>
                <Txt variant="small">{o.body}</Txt>
              </View>
            </View>
          </Card>
        );
      })}
      {unavailable.includes('another_trial') && <Notice>This was your final free trial for {SERVICE_LABELS[trial.service]}, so another trial isn’t available.</Notice>}
      {unavailable.includes('reject') && <Notice>You can reject after your final free trial. For now, subscribe or try once more.</Notice>}
      {decide.isError && (
        <Notice tone="error">
          {isNetworkError(decide.error) ? 'You’re offline. Your choice wasn’t saved; try again.' : decide.error.message}
        </Notice>
      )}
      <ConfirmDialog
        visible={!!pending}
        title={option?.title ?? ''}
        message={option?.body}
        confirmLabel={option?.confirm}
        destructive={pending === 'reject'}
        loading={decide.isPending}
        onCancel={() => !decide.isPending && setPending(null)}
        onConfirm={() => pending && !decide.isPending && decide.mutate(pending)}
      />
    </>
  );
}
