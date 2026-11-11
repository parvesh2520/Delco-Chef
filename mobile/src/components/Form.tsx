import React, { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../theme';
import { Txt } from './Txt';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
}

export function TextField({ label, error, hint, prefix, suffix, style, multiline, ...rest }: TextFieldProps) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label">{label}</Txt>
      <View style={[styles.inputWrap, multiline && { alignItems: 'flex-start' }, !!error && { borderColor: colors.error }]}>
        {prefix && <Txt variant="bodyStrong" color={colors.textSecondary}>{prefix}</Txt>}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          style={[styles.input, multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }, style]}
          {...rest}
        />
        {suffix && <Txt variant="small">{suffix}</Txt>}
      </View>
      {error ? <Txt variant="caption" color={colors.error}>{error}</Txt> : hint ? <Txt variant="caption">{hint}</Txt> : null}
    </View>
  );
}

/** Segmented digit boxes over a hidden input (OTP / 4-digit visit code). */
export function CodeInput({ length, value, onChange, error }: { length: number; value: string; onChange: (v: string) => void; error?: string }) {
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => ref.current?.focus()} style={styles.codeRow} accessibilityLabel={`${length}-digit code`}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={[styles.codeBox, value.length === i && { borderColor: colors.accent }, !!error && { borderColor: colors.error }]}>
            <Txt variant="h2">{value[i] ?? ''}</Txt>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus
        style={styles.hidden}
      />
      {error && <Txt variant="caption" color={colors.error} center>{error}</Txt>}
    </View>
  );
}

export interface ChipGroupProps<T extends string> {
  options: readonly T[] | { value: T; label: string }[];
  value: T[] | T | undefined;
  onChange: (v: T[] | T) => void;
  multi?: boolean;
}

/** Single- or multi-select pill chips. */
export function ChipGroup<T extends string>({ options, value, onChange, multi }: ChipGroupProps<T>) {
  const opts = (options as (T | { value: T; label: string })[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const toggle = (v: T) => {
    if (!multi) return onChange(v);
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  return (
    <View style={styles.chips}>
      {opts.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Pressable key={o.value} onPress={() => toggle(o.value)} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
            {on && <Ionicons name="checkmark" size={14} color={colors.textOnDark} />}
            <Txt variant="label" color={on ? colors.textOnDark : colors.primary}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tab-like segmented control. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: value === o.value }} style={[styles.segItem, value === o.value && styles.segOn]}>
          <Txt variant="label" color={value === o.value ? colors.textOnDark : colors.primary}>{o.label}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

/** Plus/minus number stepper. */
export function Stepper({ label, value, onChange, min = 1, max = 20 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <View style={styles.stepperRow}>
      <Txt variant="bodyStrong" style={{ flex: 1 }}>{label}</Txt>
      <Pressable accessibilityLabel={`Decrease ${label}`} onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepBtn}>
        <Ionicons name="remove" size={18} color={colors.primary} />
      </Pressable>
      <Txt variant="h3" style={{ minWidth: 28, textAlign: 'center' }}>{value}</Txt>
      <Pressable accessibilityLabel={`Increase ${label}`} onPress={() => onChange(Math.min(max, value + 1))} style={styles.stepBtn}>
        <Ionicons name="add" size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

/** Checkbox row for consent / confirmations. */
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.checkRow}>
      <View style={[styles.checkBox, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {checked && <Ionicons name="checkmark" size={16} color={colors.textOnDark} />}
      </View>
      <Txt variant="body" style={{ flex: 1 }}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14 },
  input: { flex: 1, minHeight: 50, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  codeBox: { width: 48, height: 58, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segment: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill },
  segOn: { backgroundColor: colors.primary },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, marginTop: 1 },
});
