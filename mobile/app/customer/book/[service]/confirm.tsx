import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, InfoRow, Notice, Screen, StepProgress, Txt } from '../../../../src/components';
import { SERVICE_LABELS } from '../../../../src/constants';
import { BookingGate, RequirementsCard } from '../../../../src/features/bookings';
import { bookingService, customerService } from '../../../../src/services';
import { useBookingDraft, useToast } from '../../../../src/store';
import type { BookableService, BookingRequirements } from '../../../../src/types';

/** Booking step 5 — review and confirm. Submits a trial request; Delco assigns the chef. */
export default function Confirm() {
  const { service } = useLocalSearchParams<{ service: string }>();
  return <BookingGate service={service}>{(s) => <Review service={s} />}</BookingGate>;
}

function Review({ service }: { service: BookableService }) {
  const qc = useQueryClient();
  const { draft, reset } = useBookingDraft();
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: customerService.listAddresses });
  const address = addresses.data?.find((a) => a.id === draft.addressId);
  const complete =
    !!draft.meals?.length && !!draft.slot && !!draft.startDate && !!draft.addressId && !!draft.diet && !!draft.cuisines?.length &&
    (service !== 'custom_time' || !!draft.durationDays);

  const submit = useMutation({
    mutationFn: () => {
      const { service: _s, ...rest } = draft;
      return bookingService.createRequest(service, { members: 2, allergies: [], ...rest } as BookingRequirements);
    },
    onSuccess: (req) => {
      if (router.canDismiss()) router.dismissAll();
      router.push({ pathname: '/customer/trials/request/[id]', params: { id: req.id } });
      useToast.getState().show('Trial request submitted');
      reset();
      ['requests', 'eligibility', 'history', 'trials'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });

  return (
    <Screen
      eyebrow={SERVICE_LABELS[service]}
      title="Booking confirmation"
      subtitle="Check the details before sending your free trial request."
      footer={
        complete ? (
          <Button title="Confirm & request trial" variant="accent" loading={submit.isPending} onPress={() => submit.mutate()} />
        ) : (
          <Button title="Complete missing details" onPress={() => router.push({ pathname: '/customer/book/[service]/requirements', params: { service } })} />
        )
      }
    >
      <StepProgress step={5} total={5} label="Confirm" />
      <RequirementsCard service={service} r={draft} />
      <Card>
        <Txt variant="h3">Address</Txt>
        <InfoRow label={address?.label ?? 'Address'} value={address ? `${address.line1}, ${address.city} ${address.pincode}` : undefined} />
      </Card>
      <Button title="Edit details" variant="secondary" small onPress={() => router.push({ pathname: '/customer/book/[service]/requirements', params: { service } })} />
      <Notice icon="people-outline">Delco assigns a verified chef for your trial — you’ll see their name once assigned. You pay only if you subscribe.</Notice>
      {!complete && <Notice tone="warning">Some required details are missing.</Notice>}
      {submit.isError && <Notice tone="error">{submit.error.message}</Notice>}
    </Screen>
  );
}
