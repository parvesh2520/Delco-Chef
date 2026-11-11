import React from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Txt } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';

export default function Welcome() {
  // Every role signs in with a real OTP; there is no shortcut session.
  const loginAsCustomer = () => router.push('/phone');
  const loginAsChef = () => router.push('/chef-login');
  const loginAsAdmin = () => router.push('/admin-login');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero Header */}
        <View style={styles.hero}>
          <View style={styles.city}>
            <Ionicons name="location" size={14} color={colors.primary} />
            <Txt variant="label" color={colors.primary}>Currently serving Bengaluru</Txt>
          </View>
          <Txt variant="display" color={colors.textOnDark}>
            Delco Chefs
          </Txt>
          <Txt variant="h2" color={colors.accent}>
            Home Chef Service
          </Txt>
          <Txt variant="body" color={colors.accentLight}>
            A verified professional chef comes to your home kitchen and cooks healthy, customized meals for your family.
          </Txt>
        </View>

        {/* Interactive Feature Cards */}
        <View style={styles.body}>
          <Txt variant="eyebrow" color={colors.textMuted}>EXPLORE SERVICES</Txt>

          {/* Service Card 1: Monthly Subscription */}
          <Pressable style={styles.serviceCard} onPress={loginAsCustomer}>
            <View style={styles.cardIconBox}>
              <Ionicons name="calendar-outline" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">Monthly Subscription</Txt>
              <Txt variant="small" color={colors.textMuted}>Daily verified home chef for regular everyday meals</Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>

          {/* Service Card 2: Custom Time / Short Stints */}
          <Pressable style={styles.serviceCard} onPress={loginAsCustomer}>
            <View style={styles.cardIconBox}>
              <Ionicons name="restaurant-outline" size={24} color={colors.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">Custom Time & Trials</Txt>
              <Txt variant="small" color={colors.textMuted}>Free tasting trial before committing to a plan</Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>

          {/* Service Card 3: Background Verified */}
          <Pressable style={styles.serviceCard} onPress={loginAsCustomer}>
            <View style={styles.cardIconBox}>
              <Ionicons name="shield-checkmark-outline" size={24} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">Verified & Trained Chefs</Txt>
              <Txt variant="small" color={colors.textMuted}>100% police & Aadhaar verified culinary pros</Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>

          {/* 1-Click Interactive Portal Switcher */}
          <View style={styles.demoSection}>
            <Txt variant="eyebrow" color={colors.purple}>SIGN IN • SELECT YOUR ROLE</Txt>
            <Txt variant="small" color={colors.textMuted}>
              Choose how you use Delco. You’ll verify your number with a one-time code.
            </Txt>

            <View style={styles.roleButtonsGrid}>
              <Button
                title="Customer Portal"
                variant="accent"
                icon="person-outline"
                onPress={loginAsCustomer}
              />
              <Button
                title="Chef Portal"
                variant="secondary"
                icon="restaurant-outline"
                onPress={loginAsChef}
              />
              <Button
                title="Ops & Admin Dashboard"
                variant="ghost"
                icon="speedometer-outline"
                onPress={loginAsAdmin}
              />
            </View>
          </View>

          {/* Traditional OTP Login Links */}
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Txt variant="caption" color={colors.textMuted}>OR LOG IN VIA OTP</Txt>
            <View style={styles.divider} />
          </View>

          <Button
            title="Customer Phone Login"
            variant="secondary"
            small
            icon="keypad-outline"
            onPress={() => router.push('/phone')}
          />
          <Button
            title="Become a Delco Chef (Apply)"
            variant="ghost"
            small
            icon="document-text-outline"
            onPress={() => router.push('/chef-login')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  scroll: { flexGrow: 1 },
  hero: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.sm },
  city: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
  },
  body: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  demoSection: {
    marginTop: spacing.sm,
    backgroundColor: colors.sand,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    gap: spacing.sm,
  },
  roleButtonsGrid: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
});
