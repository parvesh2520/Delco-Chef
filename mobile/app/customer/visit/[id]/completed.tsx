import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiImage, Button, Card, ChefCard, InfoRow, Notice, QueryView, Screen, Stars, StatusHero, TextField, Txt } from '../../../../src/components';
import { visitService } from '../../../../src/services';
import { colors, radius } from '../../../../src/theme';
import type { Visit } from '../../../../src/types';
import { formatDateTime, formatTime, isNetworkError } from '../../../../src/utils';

const PROMPTS = ['', 'What went wrong?', 'What could be better?', 'Anything we could improve?', 'What did you enjoy?', 'What did you love?'];

/** Visit completed: the dish, a rating for the chef, and the visit times. */
export default function VisitCompleted() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['visit', id], queryFn: () => visitService.get(id) });
  return (
    <Screen>
      <QueryView query={query} empty={{ title: 'Visit not found' }}>
        {(v) => (
          <>
            <StatusHero art="cloche" icon="checkmark-done-circle" title="Visit completed" message={`${v.chef?.name ?? v.chefName} has finished cooking. Enjoy your meal`} />
            {!!v.foodPhotoUrl && (
              <View style={styles.dish}>
                <ApiImage path={v.foodPhotoUrl} style={styles.dishImg} />
                <View style={styles.dishTag}><Txt variant="caption" color={colors.textOnDark}>Today’s dish</Txt></View>
              </View>
            )}
            {v.rating ? <YourRating v={v} /> : v.canRate ? <RateVisit v={v} /> : null}
            {v.chef && <ChefCard chef={v.chef} variant="compact" caption="Cooked by" />}
            <Card>
              <InfoRow icon="calendar-outline" label="Date" value={formatDateTime(v.date)} />
              <InfoRow icon="log-in-outline" label="Checked in" value={v.checkInAt ? formatTime(v.checkInAt) : undefined} />
              <InfoRow icon="log-out-outline" label="Checked out" value={v.checkOutAt ? formatTime(v.checkOutAt) : undefined} />
            </Card>
            {v.kind === 'trial' && (
              <Button title="Trial complete — decide next step" variant="accent" onPress={() => router.push({ pathname: '/customer/trials/[id]/complete', params: { id: v.refId } })} />
            )}
            <Button title="Back to home" variant="secondary" onPress={() => { if (router.canDismiss()) router.dismissAll(); router.navigate('/customer/home'); }} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}

function RateVisit({ v }: { v: Visit }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const qc = useQueryClient();
  const rate = useMutation({
    mutationFn: () => visitService.rate(v.id, stars, comment.trim()),
    onSuccess: (updated) => {
      qc.setQueryData(['visit', v.id], updated);
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
  });
  return (
    <Card style={{ alignItems: 'center', gap: 16 }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Txt variant="h3">How was your meal?</Txt>
        <Txt variant="small" center>Your rating helps {v.chef?.name.split(' ')[0] ?? 'your chef'} and other families</Txt>
      </View>
      <Stars value={stars} onChange={setStars} size={36} />
      {stars > 0 && (
        <View style={{ alignSelf: 'stretch', gap: 12 }}>
          <TextField label={PROMPTS[stars]} placeholder="Optional" value={comment} onChangeText={setComment} maxLength={300} multiline />
          {rate.isError && <Notice tone="error">{isNetworkError(rate.error) ? 'You’re offline. Try again.' : rate.error.message}</Notice>}
          <Button title="Submit rating" loading={rate.isPending} onPress={() => rate.mutate()} />
        </View>
      )}
    </Card>
  );
}

function YourRating({ v }: { v: Visit }) {
  return (
    <Card tone="cream" style={{ alignItems: 'center', gap: 8 }}>
      <Txt variant="label" color={colors.textSecondary}>Your rating</Txt>
      <Stars value={v.rating!.stars} size={24} />
      {!!v.rating!.comment && <Txt center>“{v.rating!.comment}”</Txt>}
    </Card>
  );
}

const styles = StyleSheet.create({
  dish: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.sand },
  dishImg: { width: '100%', aspectRatio: 4 / 3 },
  dishTag: { position: 'absolute', left: 12, bottom: 12, backgroundColor: 'rgba(63,26,66,0.72)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
});
