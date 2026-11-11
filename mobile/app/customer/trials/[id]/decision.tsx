import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ConfirmDialog, Notice, QueryView, Screen, Txt } from '../../../../src/components';
import { SERVICE_LABELS } from '../../../../src/constants';
import { bookingService } from '../../../../src/services';
import { useToast } from '../../../../src/store';
import { colors } from '../../../../src/theme';
import type { Trial, TrialDecision } from '../../../../src/types';
import { humanize } from '../../../../src/utils';

type Option = { decision: TrialDecision; title: string; body: string; icon: keyof typeof Ionicons.glyphMap; confirm: string };

const SUBSCRIBE: Option = { decision: 'subscribe', title: 'Subscribe', body: 'Continue with this chef. Your plan activates after payment.', icon: 'checkmark-circle-outline', confirm: 'Subscribe & pay' };
const ANOTHER: Option = { decision: 'another_trial', title: 'Request another trial', body: 'Try one more free trial. Delco may assign a different chef.', icon: 'refresh-circle-outline', confirm: 'Request trial 2' };
const REJECT: Option = { decision: 'reject', title: 'Reject', body: 'Close this request. You can request this service again later.', icon: 'close-circle-outline', confirm: 'Reject & close' };

/** First trial: Subscribe / Request another trial. Final trial: Subscribe / Reject. */
export default function TrialDecisionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['trial', id], queryFn: () => bookingService.getTrial(id) });
  return (
    <Screen eyebrow="Your decision" title="What would you like to do?">
      <QueryView query={query} empty={{ title: 'Trial not found' }}>
        {({ trial }) => <Decision trial={trial} />}
      </QueryView>
    </Screen>
  );
}

function Decision({ trial }: { trial: Trial }) {
  const qc = useQueryClient();
  const elig = useQuery({ queryKey: ['eligibility', trial.service], queryFn: () => bookingService.getEligibility(trial.service) });
  const [pending, setPending] = useState<Option | null>(null);
  const decide = useMutation({
    mutationFn: (d: TrialDecision) => bookingService.submitTrialDecision(trial.id, d),
    onSuccess: ({ decision, subscriptionId }) => {
      setPending(null);
      ['requests', 'request', 'trials', 'trial', 'subscriptions', 'history', 'eligibility'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
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
  });

  if (trial.decision) {
    return (
      <>
        <Notice tone="success" icon="checkmark-circle-outline">You chose “{humanize(trial.decision)}” for trial {trial.number}.</Notice>
        <Button title="View request status" onPress={() => router.replace({ pathname: '/customer/trials/request/[id]', params: { id: trial.requestId } })} />
      </>
    );
  }
  if (trial.status !== 'completed') return <Notice>You can decide once trial {trial.number} is completed.</Notice>;
  if (!elig.data) return null;

  const isFinal = trial.number >= elig.data.maxTrials;
  const options = isFinal ? [SUBSCRIBE, REJECT] : [SUBSCRIBE, ANOTHER];

  return (
    <>
      <Txt variant="body" color={colors.textSecondary}>
        {SERVICE_LABELS[trial.service]} · Trial {trial.number} of {elig.data.maxTrials} with {trial.chefName ?? 'your chef'}
      </Txt>
      {options.map((o) => (
        <Card key={o.decision} onPress={() => setPending(o)} tone={o.decision === 'subscribe' ? 'accent' : 'default'} accessibilityLabel={o.title}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name={o.icon} size={28} color={o.decision === 'reject' ? colors.error : colors.purple} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">{o.title}</Txt>
              <Txt variant="small">{o.body}</Txt>
            </View>
          </View>
        </Card>
      ))}
      {isFinal && <Notice>This was your final free trial for {SERVICE_LABELS[trial.service]}.</Notice>}
      {decide.isError && <Notice tone="error">{decide.error.message}</Notice>}
      <ConfirmDialog
        visible={!!pending}
        title={pending?.title ?? ''}
        message={pending?.body}
        confirmLabel={pending?.confirm}
        destructive={pending?.decision === 'reject'}
        loading={decide.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && decide.mutate(pending.decision)}
      />
    </>
  );
}
