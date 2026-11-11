import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
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

export function ConfirmDialog({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, loading, inputLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const [input, setInput] = useState('');
  useEffect(() => {
    if (visible) setInput('');
  }, [visible]);
  const needsInput = !!inputLabel;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Close dialog">
        <Pressable style={styles.sheet} onPress={() => {}} accessibilityViewIsModal>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(63,26,66,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
});
