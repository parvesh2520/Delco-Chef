import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing } from '../theme';
import { Eyebrow, Txt } from './Txt';

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  /** Show back arrow (default true). Tab roots pass false. */
  back?: boolean;
  /** Custom back handler; defaults to router.back(). */
  onBack?: () => void;
  right?: React.ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Sticky bottom area for primary actions. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function Screen({ title, subtitle, eyebrow, back = true, onBack, right, scroll = true, footer, children, contentStyle, refreshing, onRefresh }: ScreenProps) {
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  const header = (title || back || right) && (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {back ? (
          <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back" style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.primary} />
          </Pressable>
        ) : (
          <View />
        )}
        {right}
      </View>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {title && (
        <Txt variant="h1" accessibilityRole="header" style={{ marginTop: eyebrow ? 6 : 0 }}>
          {title}
        </Txt>
      )}
      {subtitle && <Txt variant="body" color={colors.textSecondary} style={{ marginTop: 6 }}>{subtitle}</Txt>}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      {header}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }, contentStyle]}>
      {header}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', ...(footer ? [] : (['bottom'] as const))]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
        {footer && (
          <SafeAreaView edges={['bottom']} style={styles.footer}>
            {footer}
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  header: { gap: 2, marginBottom: spacing.xs },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32, marginBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
});
