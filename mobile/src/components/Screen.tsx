import React, { useRef, useState } from 'react';
import {
  Animated, KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, View, type LayoutChangeEvent,
  type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FadeInUp, haptic, PressableScale } from '../motion';
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

/** Scroll distance over which the large title hands over to the compact bar title. */
const COLLAPSE = 64;

export function Screen({ title, subtitle, eyebrow, back = true, onBack, right, scroll = true, footer, children, contentStyle, refreshing, onRefresh }: ScreenProps) {
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  const scrollY = useRef(new Animated.Value(0)).current;
  const mountedAt = useRef(Date.now()).current;
  const [moreBelow, setMoreBelow] = useState(false);
  const sizes = useRef({ content: 0, layout: 0 });

  // The footer gains a shadow only while content is hidden beneath it.
  const updateBelow = (offset: number) => {
    const below = sizes.current.content - sizes.current.layout - offset > 8;
    if (below !== moreBelow) setMoreBelow(below);
  };
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => footer && updateBelow(e.nativeEvent.contentOffset.y),
  });

  const hasBar = back || !!right;
  const barTitleOpacity = scrollY.interpolate({ inputRange: [COLLAPSE * 0.6, COLLAPSE], outputRange: [0, 1], extrapolate: 'clamp' });
  const bigTitle = {
    opacity: scrollY.interpolate({ inputRange: [0, COLLAPSE], outputRange: [1, 0], extrapolate: 'clamp' }),
    transform: [
      { translateY: scrollY.interpolate({ inputRange: [-80, 0, COLLAPSE], outputRange: [12, 0, -10], extrapolate: 'clamp' }) },
      { scale: scrollY.interpolate({ inputRange: [-80, 0, COLLAPSE], outputRange: [1.06, 1, 0.94], extrapolate: 'clamp' }) },
    ],
    transformOrigin: 'left' as const,
  };

  const bar = hasBar && (
    <View style={styles.bar}>
      {back ? (
        <PressableScale onPress={goBack} feedback="select" to={0.9} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back" style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </PressableScale>
      ) : (
        <View />
      )}
      {scroll && title ? (
        <Animated.View style={[styles.barTitle, { opacity: barTitleOpacity }]} pointerEvents="none">
          <Txt variant="bodyStrong" numberOfLines={1}>{title}</Txt>
        </Animated.View>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right ?? <View style={{ width: 40 }} />}
    </View>
  );

  const header = (title || eyebrow || subtitle) && (
    <Animated.View style={[styles.header, scroll && bigTitle]}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {title && (
        <Txt variant="h1" accessibilityRole="header" style={{ marginTop: eyebrow ? 6 : 0 }}>
          {title}
        </Txt>
      )}
      {subtitle && <Txt variant="body" color={colors.textSecondary} style={{ marginTop: 6 }}>{subtitle}</Txt>}
    </Animated.View>
  );

  // Each top-level block rises in, one after another. Blocks that appear later (errors, results) rise in at once.
  const opening = Date.now() - mountedAt < 600;
  const staggered = React.Children.toArray(children).map((child, i) => (
    <FadeInUp key={(child as { key?: React.Key }).key ?? i} index={opening ? i + 1 : 0}>
      {child}
    </FadeInUp>
  ));

  const body = scroll ? (
    <Animated.ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={onScroll}
      onLayout={(e: LayoutChangeEvent) => ((sizes.current.layout = e.nativeEvent.layout.height), footer && updateBelow(0))}
      onContentSizeChange={(_, h) => ((sizes.current.content = h), footer && updateBelow(0))}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={() => (haptic.light(), onRefresh())}
            tintColor={colors.accent}
            colors={[colors.accent, colors.purple, colors.primary]}
            progressBackgroundColor={colors.backgroundSecondary}
          />
        ) : undefined
      }
    >
      {header}
      {staggered}
    </Animated.ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }, contentStyle]}>
      {header}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', ...(footer ? [] : (['bottom'] as const))]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {bar}
        {body}
        {footer && (
          <SafeAreaView edges={['bottom']} style={[styles.footer, moreBelow && styles.footerLifted]}>
            <FadeInUp index={2} distance={24}>
              <View style={{ gap: spacing.sm }}>{footer}</View>
            </FadeInUp>
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 4, minHeight: 48, backgroundColor: colors.background, zIndex: 2 },
  barTitle: { flex: 1, alignItems: 'center' },
  content: { padding: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
  header: { gap: 2, marginBottom: spacing.xs },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  footerLifted: { borderTopColor: 'transparent', elevation: 10, shadowColor: colors.primary, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12 },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
});
