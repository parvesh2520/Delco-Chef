import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Eyebrow, InfoRow, Screen, Txt } from '../../../../../src/components';
import { AllergyNotice, mealsText, timeOrDash, VisitGate } from '../../../../../src/features/chef';
import { formatDuration, useElapsed } from '../../../../../src/hooks';
import { colors, fonts, radius, spacing } from '../../../../../src/theme';

function Timer({ start }: { start?: string }) {
  const sec = useElapsed(start);
  return (
    <View style={styles.timer} accessibilityLabel={`Cooking for ${Math.floor(sec / 60)} minutes`}>
      <Eyebrow center>Cooking time</Eyebrow>
      <Txt style={styles.time} color={colors.textOnDark} center>{formatDuration(sec)}</Txt>
      <Txt variant="small" color={colors.accentLight} center>Checked in at {timeOrDash(start)}</Txt>
    </View>
  );
}

/** Active cooking timer. */
export default function ChefCooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <VisitGate id={id}>
      {(v) => (
        <Screen eyebrow="In progress" title={v.customerName} footer={
          <Button title="Finish & check out" variant="accent" icon="checkmark-done" onPress={() => router.push(`/chef/visit/${v.id}/check-out`)} />
        }>
          <Timer start={v.checkInAt} />
          <AllergyNotice allergies={v.allergies} />
          <Card>
            <InfoRow icon="restaurant-outline" label="Meals" value={mealsText(v.meals)} />
            <InfoRow icon="people-outline" label="Members" value={v.members} />
            <InfoRow icon="document-text-outline" label="Instructions" value={v.instructions} />
          </Card>
        </Screen>
      )}
    </VisitGate>
  );
}

const styles = StyleSheet.create({
  timer: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.lg, gap: 6 },
  time: { fontFamily: fonts.heading, fontSize: 56, lineHeight: 64 },
});
