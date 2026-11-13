import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Notice, QueryView, Screen, Txt } from '../../../../src/components';
import { visitService } from '../../../../src/services';
import { colors, fonts, radius } from '../../../../src/theme';

const NO_CODE: Record<string, string> = {
  pending_assignment: 'Your code appears once a chef is assigned.',
  needs_manual_assignment: 'Your code appears once a chef is assigned.',
  checked_in: 'Your chef has checked in. The code has been used.',
  completed: 'This visit is complete.',
  customer_unavailable: 'Your chef reported that you were not available. Delco will be in touch.',
  missed: 'This visit was missed. Delco will be in touch.',
  cancelled: 'This visit was cancelled.',
};

/** Four-digit visit check-in code the customer shares with the chef at the door. Shown only to this visit's customer,
 * only until it is used; the server checks it and allows 5 wrong tries. */
export default function CheckInCode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Refresh while the code is on screen, so the customer sees the chef's check-in as soon as it happens.
  const query = useQuery({ queryKey: ['visit', id], queryFn: () => visitService.get(id),
    refetchInterval: (q) => (q.state.data?.checkInCode ? 15_000 : false) });
  return (
    <Screen eyebrow="Check-in" title="Your visit code" subtitle="Share this code with your chef when they arrive."
      refreshing={query.isRefetching} onRefresh={query.refetch}>
      <QueryView query={query} empty={{ title: 'Visit not found' }}>
        {(v) => !v.checkInCode ? (
          <Notice icon="checkmark-circle-outline">{NO_CODE[v.status] ?? 'There is no code to show for this visit.'}</Notice>
        ) : (
          <>
            <View style={styles.row} accessibilityLabel={`Check-in code ${v.checkInCode.split('').join(' ')}`}>
              {v.checkInCode.split('').map((d, i) => (
                <View key={i} style={styles.digit}>
                  <Txt style={{ fontFamily: fonts.heading, fontSize: 40 }} color={colors.textOnDark}>{d}</Txt>
                </View>
              ))}
            </View>
            <Txt variant="small" center>For {v.chefName} · {v.slot}</Txt>
            <Notice icon="shield-checkmark-outline">Only share this code in person with your chef. Delco staff will never ask for it on a call.</Notice>
          </>
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 24 },
  digit: { width: 64, height: 84, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
