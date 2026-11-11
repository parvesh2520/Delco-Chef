import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Eyebrow, Txt } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';

const POINTS: [keyof typeof Ionicons.glyphMap, string][] = [
  ['shield-checkmark-outline', 'Background-verified chefs'],
  ['restaurant-outline', 'Meals cooked in your kitchen, your way'],
  ['calendar-outline', 'Free trial before you subscribe'],
];

export default function Welcome() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <Eyebrow>Delco Chefs</Eyebrow>
        <Txt variant="display" color={colors.textOnDark}>Convenience{'\n'}Personified.</Txt>
        <Txt variant="body" color={colors.accentLight}>
          A professional, verified chef comes to your kitchen and cooks meals around your taste, routine and needs.
        </Txt>
        <View style={styles.city}>
          <Ionicons name="location" size={14} color={colors.primary} />
          <Txt variant="label">Currently serving Noida</Txt>
        </View>
      </View>
      <View style={styles.body}>
        {POINTS.map(([icon, text]) => (
          <View key={text} style={styles.point}>
            <Ionicons name={icon} size={20} color={colors.purple} />
            <Txt variant="bodyStrong">{text}</Txt>
          </View>
        ))}
        <View style={{ flex: 1 }} />
        <Button title="Book a Chef" variant="accent" icon="arrow-forward" onPress={() => router.push('/phone')} />
        <Button title="Become a Chef" variant="secondary" onPress={() => router.push('/chef-login')} />
        <Button title="Delco team login" variant="ghost" small onPress={() => router.push('/admin-login')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  hero: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },
  city: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  body: { flex: 1, backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
