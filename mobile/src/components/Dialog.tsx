import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../motion';
import { colors, radius, spacing } from '../theme';
import { Button } from './Button';
import { TextField } from './Form';
import { Txt } from './Txt';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** When set, shows a required text input (e.g. decline / reassignment reason). */
  inputLabel?: string;
  onConfirm: (input: string) => void;
  onCancel: () => void;
}

const OFFSCREEN = Dimensions.get('window').height;

/** Bottom sheet: the backdrop fades, the sheet springs up, and it can be dragged down to close. */
export function ConfirmDialog({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, loading, inputLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const [input, setInput] = useState('');
  const [mounted, setMounted] = useState(visible);
  const y = useRef(new Animated.Value(OFFSCREEN)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const busy = useRef(loading);
  busy.current = loading;
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    if (visible) {
      setInput('');
      setMounted(true);
      if (destructive) haptic.warning();
      y.setValue(OFFSCREEN);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 4 }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(y, { toValue: OFFSCREEN, duration: 220, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && !busy.current,
      onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) =>
        g.dy > 110 || g.vy > 0.8 ? cancel.current() : Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current;

  const needsInput = !!inputLabel;
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]}>
          <Pressable style={{ flex: 1 }} onPress={() => !loading && onCancel()} accessibilityLabel="Close dialog" />
        </Animated.View>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: y }] }]} accessibilityViewIsModal>
          <View {...pan.panHandlers} style={styles.handleZone}>
            <View style={styles.handle} />
          </View>
          <Txt variant="h2">{title}</Txt>
          {message && <Txt variant="body" color={colors.textSecondary}>{message}</Txt>}
          {needsInput && <TextField label={inputLabel} value={input} onChangeText={setInput} multiline placeholder="Add a short reason" />}
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              title={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              loading={loading}
              disabled={needsInput && input.trim().length < 3}
              onPress={() => onConfirm(input.trim())}
            />
            <Button title={cancelLabel} variant="ghost" onPress={onCancel} disabled={loading} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(63,26,66,0.45)' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
  handleZone: { alignItems: 'center', paddingTop: 10, paddingBottom: 8, marginHorizontal: -spacing.lg },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
});
