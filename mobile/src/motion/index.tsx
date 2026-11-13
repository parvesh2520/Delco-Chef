// Motion toolkit: React Native's built-in Animated (native driver: transform + opacity only) and expo-haptics.
// Every animation respects the OS "Reduce motion" setting and stays short (150–400 ms) for budget Android phones.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { create } from 'zustand';
import { colors } from '../theme';

// ---------- Reduce motion ----------
let reduced = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduced = v)).catch(() => undefined);
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => (reduced = v));

/** Current OS "Reduce motion" setting, for imperative animations outside hooks. */
export const reducedMotion = () => reduced;

export function useReducedMotion(): boolean {
  const [value, setValue] = useState(reduced);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setValue).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setValue);
    return () => sub.remove();
  }, []);
  return value;
}

export const DURATION = { fast: 150, base: 240, slow: 380 } as const;
export const EASE_OUT = Easing.out(Easing.cubic);

// ---------- Haptics (fire-and-forget; silently ignored where unsupported) ----------
const safe = (p: Promise<unknown>) => void p.catch(() => undefined);
export const haptic = {
  light: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => safe(Haptics.selectionAsync()),
  success: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

// ---------- Press feedback ----------
export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** Scale while held (default 0.97). */
  to?: number;
  /** Haptic on press (default 'light'). */
  feedback?: keyof typeof haptic | false;
  children?: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable that springs down while held and back on release, with a haptic tick.
 * The style and the scale sit on the same element, so flex / width layout behaves exactly like a plain Pressable.
 */
export function PressableScale({ to = 0.97, feedback = 'light', style, onPressIn, onPressOut, onPress, children, ...rest }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const spring = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: v === 1 ? 8 : 0 }).start();
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => (setPressed(true), reduced || spring(to), onPressIn?.(e))}
      onPressOut={(e) => (setPressed(false), reduced || spring(1), onPressOut?.(e))}
      onPress={(e) => (feedback && haptic[feedback](), onPress?.(e))}
      style={[typeof style === 'function' ? style({ pressed }) : style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

// ---------- Entrances ----------
/** Fades and rises into place; `index` staggers siblings (capped so long lists don't wait). */
export function FadeInUp({ index = 0, distance = 14, style, children }: { index?: number; distance?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return v.setValue(1);
    Animated.timing(v, { toValue: 1, duration: DURATION.slow, delay: Math.min(index, 8) * 50, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [v, index]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Pops in with a springy scale, for badges and icons that appear after an action. */
export function PopIn({ delay = 0, style, children }: { delay?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return v.setValue(1);
    Animated.spring(v, { toValue: 1, delay, useNativeDriver: true, speed: 14, bounciness: 12 }).start();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>{children}</Animated.View>;
}

// ---------- Attention ----------
/** Returns a translateX value and a trigger that shakes it (validation errors, wrong OTP). */
export function useShake(): [Animated.Value, () => void] {
  const x = useRef(new Animated.Value(0)).current;
  const shake = () => {
    if (reduced) return;
    x.setValue(0);
    Animated.sequence(
      [10, -9, 7, -5, 3, 0].map((toValue) => Animated.timing(x, { toValue, duration: 45, useNativeDriver: true }))
    ).start();
  };
  return [x, shake];
}

/** Rings an icon (bell) left-right; returns rotate style and trigger. */
export function useWiggle(): [Animated.AnimatedInterpolation<string>, () => Promise<void>] {
  const v = useRef(new Animated.Value(0)).current;
  const rotate = v.interpolate({ inputRange: [-1, 1], outputRange: ['-18deg', '18deg'] });
  const wiggle = () =>
    new Promise<void>((resolve) => {
      if (reduced) return resolve();
      v.setValue(0);
      Animated.sequence([1, -1, 0.7, -0.7, 0.3, 0].map((toValue) => Animated.timing(v, { toValue, duration: 70, useNativeDriver: true }))).start(() => resolve());
    });
  return [rotate, wiggle];
}

/** Looping value 0→1→0, used for breathing dots, shimmer and floating icons. */
export function useLoop(duration = 1400, enabled = true) {
  const v = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!enabled || reduce) return v.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration, enabled, reduce]);
  return v;
}

/** Small "live" dot with an expanding halo (in-progress statuses, chef location). */
export function PulseDot({ color = colors.purple, size = 8 }: { color?: string; size?: number }) {
  const v = useLoop(1600);
  return (
    <View style={{ width: size * 2.4, height: size * 2.4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute', width: size * 2.4, height: size * 2.4, borderRadius: size * 1.2, backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ---------- Numbers ----------
/** Counts smoothly from the previous value to the new one. */
export function useAnimatedNumber(value: number, duration: number = DURATION.base): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (reduced || start === value) {
      from.current = value;
      return setShown(value);
    }
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = start + (value - start) * eased;
      setShown(Number.isInteger(value) && Number.isInteger(start) ? Math.round(next) : next);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return shown;
}

/** Briefly bumps its child when `trigger` changes (stepper values, counters). */
export function Bump({ trigger, children }: { trigger: unknown; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (reduced) return;
    v.setValue(1.25);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }).start();
  }, [trigger, v]);
  return <Animated.View style={{ transform: [{ scale: v }] }}>{children}</Animated.View>;
}

// ---------- Skeletons ----------
/** Shimmering placeholder block. */
export function Skeleton({ width = '100%', height = 14, radius = 8, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const v = useLoop(1300);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.border, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }) }, style]} />;
}

/** Card-shaped skeletons in the layout of a typical list. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Loading" accessibilityLiveRegion="polite">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={skel.card}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Skeleton width={40} height={40} radius={20} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="35%" height={11} />
            </View>
          </View>
          <Skeleton width="90%" height={12} />
          <Skeleton width="70%" height={12} />
        </View>
      ))}
    </View>
  );
}

const skel = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
});

// ---------- Celebration ----------
/** Global confetti burst. Trigger with useCelebrate.getState().celebrate(). */
export const useCelebrate = create<{ key: number; celebrate: () => void }>((set) => ({
  key: 0,
  celebrate: () => {
    haptic.success();
    set((s) => ({ key: s.key + 1 }));
  },
}));

const CONFETTI = [colors.accent, colors.purple, colors.primary, colors.accentLight, colors.success];
const PIECES = 26;

/** Mount once at the root. Brand-coloured pieces burst from the top-centre and fall away. */
export function CelebrationHost() {
  const key = useCelebrate((s) => s.key);
  if (!key || reduced) return null;
  return <Burst key={key} />;
}

function Burst() {
  const [done, setDone] = useState(false);
  const pieces = useRef(
    Array.from({ length: PIECES }, (_, i) => ({
      v: new Animated.Value(0),
      x: (Math.random() - 0.5) * 360,
      y: 380 + Math.random() * 260,
      spin: `${(Math.random() - 0.5) * 900}deg`,
      color: CONFETTI[i % CONFETTI.length],
      w: 6 + Math.random() * 6,
      round: i % 3 === 0,
    }))
  ).current;
  useEffect(() => {
    Animated.stagger(
      12,
      pieces.map((p) => Animated.timing(p.v, { toValue: 1, duration: 1300 + Math.random() * 500, easing: Easing.out(Easing.quad), useNativeDriver: true }))
    ).start(() => setDone(true));
  }, [pieces]);
  if (done) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', zIndex: 200 }]}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', top: 80, width: p.w, height: p.round ? p.w : p.w * 1.8, borderRadius: p.round ? p.w : 2, backgroundColor: p.color,
            opacity: p.v.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) },
              { translateY: p.v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, -60, p.y] }) },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', p.spin] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
