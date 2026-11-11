import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from '../store';
import { colors, radius } from '../theme';
import { Txt } from './Txt';

/** Global success/error message. Trigger with useToast.getState().show('Saved'). */
export function ToastHost() {
  const { message, tone, hide } = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 2600);
    return () => clearTimeout(t);
  }, [message, hide]);
  if (!message) return null;
  const icon = tone === 'success' ? 'checkmark-circle' : tone === 'error' ? 'alert-circle' : 'information-circle';
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]} accessibilityLiveRegion="polite">
      <View style={styles.toast}>
        <Ionicons name={icon} size={20} color={tone === 'error' ? '#F4A79F' : colors.accent} />
        <Txt variant="bodyStrong" color={colors.textOnDark} style={{ flex: 1 }}>{message}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 14 },
});
