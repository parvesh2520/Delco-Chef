import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Notice, QueryView, Screen, Txt } from '../../../../src/components';
import { visitService } from '../../../../src/services';
import { colors, fonts, radius } from '../../../../src/theme';

/** Four-digit visit check-in code the customer shares with the chef at the door. */
export default function CheckInCode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['visit', id], queryFn: () => visitService.get(id) });
  return (
    <Screen eyebrow="Check-in" title="Your visit code" subtitle="Share this code with your chef when they arrive.">
      <QueryView query={query} empty={{ title: 'Visit not found' }}>
        {(v) => !v.checkInCode ? (
          <Notice icon="checkmark-circle-outline">{v.status === 'pending_assignment' ? 'Your code appears once a chef is assigned.' : 'Your chef has checked in. The code has been used.'}</Notice>
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
