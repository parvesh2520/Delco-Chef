import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Txt } from '../../src/components';
import { EASE_OUT, FadeInUp, haptic, PressableScale, reducedMotion } from '../../src/motion';
import { colors, fonts, radius, shadow, spacing } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const SERVICES: { icon: IconName; tint: string; title: string; text: string }[] = [
  { icon: 'calendar-outline', tint: colors.primary, title: 'Monthly Subscription', text: 'Daily verified home chef for regular everyday meals' },
  { icon: 'restaurant-outline', tint: colors.purple, title: 'Custom Time & Trials', text: 'Free tasting trial before committing to a plan' },
  { icon: 'shield-checkmark-outline', tint: colors.success, title: 'Verified & Trained Chefs', text: '100% police & Aadhaar verified culinary pros' },
];

const TRUST: { icon: IconName; label: string }[] = [
  { icon: 'shield-checkmark', label: 'Verified chefs' },
  { icon: 'gift', label: 'Free trial' },
  { icon: 'lock-closed', label: 'Secure payments' },
];

/**
 * First screen. Sign-in comes first: one clear choice per person (customer, chef, Delco team), each a real OTP sign-in.
 * Customer sign-in and sign-up are the same phone + OTP flow, so they share one button. Services follow below.
 */
export default function Welcome() {
  const toCustomer = () => router.push('/phone');
  const toChef = () => router.push('/chef-login');
  const toAdmin = () => router.push('/admin-login');

  // The cream sheet slides up under the hero on first open.
  const sheet = useRef(new Animated.Value(reducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (!reducedMotion()) Animated.timing(sheet, { toValue: 1, duration: 520, delay: 120, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [sheet]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.hero}>
          <FadeInUp index={0}>
            <View style={styles.city}>
              <Ionicons name="location" size={14} color={colors.primary} />
              <Txt variant="label" color={colors.primary}>Currently serving Bengaluru</Txt>
            </View>
          </FadeInUp>
          <FadeInUp index={1}>
            <Txt variant="display" color={colors.textOnDark}>Delco Chefs</Txt>
            <Txt variant="h2" color={colors.accent}>Home Chef Service</Txt>
          </FadeInUp>
          <FadeInUp index={2}>
            <Txt variant="body" color={colors.accentLight}>
              A verified professional chef comes to your home kitchen and cooks healthy, customized meals for your family.
            </Txt>
          </FadeInUp>
          <FadeInUp index={3}>
            <View style={styles.trustRow}>
              {TRUST.map((t) => (
                <View key={t.label} style={styles.trust}>
                  <Ionicons name={t.icon} size={12} color={colors.accent} />
                  <Txt variant="caption" color={colors.textOnDark}>{t.label}</Txt>
                </View>
              ))}
            </View>
          </FadeInUp>
        </View>

        <Animated.View
          style={[styles.body, {
            opacity: sheet,
            transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }],
          }]}
        >
          {/* 1. Sign in */}
          <View style={{ gap: 4 }}>
            <Txt variant="eyebrow" color={colors.purple}>GET STARTED</Txt>
            <Txt variant="h2">Sign in or create an account</Txt>
            <Txt variant="small" color={colors.textSecondary}>We’ll text a one-time code to verify your number.</Txt>
          </View>

          <FadeInUp index={4}>
            <Button title="Continue with phone number" variant="accent" icon="call-outline" onPress={toCustomer} />
          </FadeInUp>
          <FadeInUp index={5}>
            <RoleCard icon="restaurant-outline" title="I’m a chef" text="Sign in, or apply to cook with Delco" onPress={toChef} />
          </FadeInUp>
          <FadeInUp index={6}>
            <Pressable onPress={() => (haptic.select(), toAdmin())} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.teamLink, pressed && { opacity: 0.6 }]}>
              <Ionicons name="briefcase-outline" size={14} color={colors.textSecondary} />
              <Txt variant="small" color={colors.textSecondary}>Delco team? </Txt>
              <Txt variant="small" color={colors.purple} style={{ fontFamily: fonts.bold }}>Admin sign-in</Txt>
            </Pressable>
          </FadeInUp>

          {/* 2. Explore services */}
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Txt variant="eyebrow" color={colors.textMuted}>EXPLORE SERVICES</Txt>
            <View style={styles.divider} />
          </View>

          {SERVICES.map((s, i) => (
            <FadeInUp key={s.title} index={7 + i}>
              <PressableScale onPress={toCustomer} to={0.98} feedback="select" accessibilityRole="button" accessibilityLabel={`${s.title}. ${s.text}`} style={styles.serviceCard}>
                <View style={styles.cardIconBox}>
                  <Ionicons name={s.icon} size={24} color={s.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{s.title}</Txt>
                  <Txt variant="small" color={colors.textMuted}>{s.text}</Txt>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </PressableScale>
            </FadeInUp>
          ))}
          <SafeAreaView edges={['bottom']} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Chef sign-in card: outlined, so it reads as a clear second choice next to the filled customer button. */
function RoleCard({ icon, title, text, onPress }: { icon: IconName; title: string; text: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} to={0.98} accessibilityRole="button" accessibilityLabel={`${title}. ${text}`} style={styles.roleCard}>
      <View style={[styles.cardIconBox, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name={icon} size={22} color={colors.purple} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt variant="small" color={colors.textSecondary}>{text}</Txt>
      </View>
      <Ionicons name="arrow-forward" size={18} color={colors.primary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  scroll: { flexGrow: 1 },
  hero: { padding: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  city: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#FFFFFF',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
  },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  trust: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.pill, backgroundColor: 'rgba(255,248,239,0.1)', borderWidth: 1, borderColor: 'rgba(255,248,239,0.18)',
  },
  body: {
    flex: 1, backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, gap: spacing.md, marginTop: -spacing.sm,
  },
  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary,
  },
  teamLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.xs },
  serviceCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow,
  },
  cardIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sand, justifyContent: 'center', alignItems: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
});
