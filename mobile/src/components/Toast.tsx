import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../motion';
import { useToast } from '../store';
import { colors, radius } from '../theme';
import { Txt } from './Txt';

/** Global success/error message. Trigger with useToast.getState().show('Saved'). Springs in from the top; swipe up to dismiss. */
export function ToastHost() {
  const { message, tone, hide } = useToast();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-140)).current;
  const [shown, setShown] = useState<{ message: string; tone: typeof tone } | null>(null);

  const dismiss = () => Animated.timing(y, { toValue: -140, duration: 180, useNativeDriver: true }).start(() => (setShown(null), hide()));

  useEffect(() => {
    if (!message) return;
    setShown({ message, tone });
    (tone === 'error' ? haptic.error : tone === 'success' ? haptic.success : haptic.light)();
    y.setValue(-140);
    Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 9 }).start();
    const t = setTimeout(dismiss, 2800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, tone]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => y.setValue(Math.min(0, g.dy)),
      onPanResponderRelease: (_, g) =>
        g.dy < -24 || g.vy < -0.5 ? dismiss() : Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current;

  if (!shown) return null;
  const icon = shown.tone === 'success' ? 'checkmark-circle' : shown.tone === 'error' ? 'alert-circle' : 'information-circle';
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]} accessibilityLiveRegion="polite">
      <Animated.View {...pan.panHandlers} style={[styles.toast, { transform: [{ translateY: y }] }]}>
        <Ionicons name={icon} size={20} color={shown.tone === 'error' ? '#F4A79F' : colors.accent} />
        <Txt variant="bodyStrong" color={colors.textOnDark} style={{ flex: 1 }}>{shown.message}</Txt>
        <View style={styles.grip} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 100 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 14,
    elevation: 8, shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 14,
  },
  grip: { position: 'absolute', bottom: 5, alignSelf: 'center', left: '50%', marginLeft: -14, width: 28, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,248,239,0.25)' },
});
