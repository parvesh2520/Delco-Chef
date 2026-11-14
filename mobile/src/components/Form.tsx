import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Bump, DURATION, FadeInUp, haptic, PopIn, PressableScale, useShake } from '../motion';
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

export function TextField({ label, error, hint, prefix, suffix, style, multiline, onFocus, onBlur, ...rest }: TextFieldProps) {
  const [x, shake] = useShake();
  const [focused, setFocused] = useState(false);
  const hadError = useRef(!!error);
  useEffect(() => {
    // Shake + error buzz only when an error newly appears, not on every render.
    if (error && !hadError.current) {
      shake();
      haptic.error();
    }
    hadError.current = !!error;
  }, [error, shake]);
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label" color={focused ? colors.purple : undefined}>{label}</Txt>
      <Animated.View
        style={[
          styles.inputWrap,
          multiline && { alignItems: 'flex-start' },
          focused && { borderColor: colors.purple },
          !!error && { borderColor: colors.error },
          { transform: [{ translateX: x }] },
        ]}
      >
        {prefix && <Txt variant="bodyStrong" color={colors.textSecondary}>{prefix}</Txt>}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          style={[styles.input, multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }, style]}
          onFocus={(e) => (setFocused(true), onFocus?.(e))}
          onBlur={(e) => (setFocused(false), onBlur?.(e))}
          {...rest}
        />
        {suffix && <Txt variant="small">{suffix}</Txt>}
      </Animated.View>
      {error ? (
        <FadeInUp key={error} distance={-4}>
          <Txt variant="caption" color={colors.error}>{error}</Txt>
        </FadeInUp>
      ) : hint ? (
        <Txt variant="caption">{hint}</Txt>
      ) : null}
    </View>
  );
}

/** Segmented digit boxes over a hidden input (OTP / 4-digit visit code). */
export function CodeInput({ length, value, onChange, error, success }: { length: number; value: string; onChange: (v: string) => void; error?: string; success?: boolean }) {
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [x, shake] = useShake();
  const hadError = useRef(!!error);
  useEffect(() => {
    if (error && !hadError.current) {
      shake();
      haptic.error();
    }
    hadError.current = !!error;
  }, [error, shake]);
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => ref.current?.focus()} accessibilityLabel={`${length}-digit code`}>
        <Animated.View style={[styles.codeRow, { transform: [{ translateX: x }] }]}>
          {Array.from({ length }).map((_, i) => (
            <CodeBox key={i} index={i} char={value[i]} active={value.length === i} error={!!error} success={!!success} />
          ))}
        </Animated.View>
      </Pressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => {
          const next = t.replace(/\D/g, '').slice(0, length);
          if (next.length > value.length) haptic.select();
          onChange(next);
        }}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus
        style={styles.hidden}
      />
      {error && <Txt variant="caption" color={colors.error} center>{error}</Txt>}
    </View>
  );
}

/** One OTP digit: pops when typed; on success the boxes turn green one after another. */
function CodeBox({ index, char, active, error, success }: { index: number; char?: string; active: boolean; error: boolean; success: boolean }) {
  const pop = useRef(new Animated.Value(1)).current;
  const green = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!char) return;
    pop.setValue(1.18);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 12 }).start();
  }, [char, pop]);
  useEffect(() => {
    Animated.timing(green, { toValue: success ? 1 : 0, duration: DURATION.base, delay: success ? index * 70 : 0, useNativeDriver: true }).start();
  }, [success, index, green]);
  return (
    <Animated.View style={[styles.codeBox, active && { borderColor: colors.accent }, error && { borderColor: colors.error }, { transform: [{ scale: pop }] }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.successLight, borderRadius: radius.md - 2, opacity: green }]} />
      <Txt variant="h2" color={success ? colors.success : undefined}>{char ?? ''}</Txt>
    </Animated.View>
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
    haptic.select();
    if (!multi) return onChange(v);
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  return (
    <View style={styles.chips}>
      {opts.map((o) => {
        const on = selected.includes(o.value);
        return (
          <PressableScale key={o.value} onPress={() => toggle(o.value)} to={0.93} feedback={false} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
            {on && (
              <PopIn>
                <Ionicons name="checkmark" size={14} color={colors.textOnDark} />
              </PopIn>
            )}
            <Txt variant="label" color={on ? colors.textOnDark : colors.primary}>{o.label}</Txt>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Tab-like segmented control. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const [w, setW] = useState(0);
  const idx = options.findIndex((o) => o.value === value);
  const x = useRef(new Animated.Value(Math.max(idx, 0))).current;
  useEffect(() => {
    if (idx >= 0) Animated.spring(x, { toValue: idx, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [idx, x]);
  const itemW = w / Math.max(options.length, 1);
  return (
    <View style={styles.segment} onLayout={(e) => setW(e.nativeEvent.layout.width - 10)}>
      {idx >= 0 && w > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.segPill, { width: itemW, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, itemW] }) }] }]}
        />
      )}
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => (haptic.select(), onChange(o.value))} accessibilityRole="tab" accessibilityState={{ selected: value === o.value }} style={styles.segItem}>
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
      <PressableScale accessibilityLabel={`Decrease ${label}`} to={0.88} feedback={value > min ? 'select' : 'warning'} onPress={() => onChange(Math.max(min, value - 1))} style={[styles.stepBtn, value <= min && { opacity: 0.45 }]}>
        <Ionicons name="remove" size={18} color={colors.primary} />
      </PressableScale>
      <Bump trigger={value}>
        <Txt variant="h3" style={{ minWidth: 28, textAlign: 'center' }}>{value}</Txt>
      </Bump>
      <PressableScale accessibilityLabel={`Increase ${label}`} to={0.88} feedback={value < max ? 'select' : 'warning'} onPress={() => onChange(Math.min(max, value + 1))} style={[styles.stepBtn, value >= max && { opacity: 0.45 }]}>
        <Ionicons name="add" size={18} color={colors.primary} />
      </PressableScale>
    </View>
  );
}

/** Checkbox row for consent / confirmations. */
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable onPress={() => (haptic.select(), onChange(!checked))} accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.checkRow}>
      <View style={[styles.checkBox, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {checked && (
          <PopIn>
            <Ionicons name="checkmark" size={16} color={colors.textOnDark} />
          </PopIn>
        )}
      </View>
      <Txt variant="body" style={{ flex: 1 }}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
  input: { flex: 1, minHeight: 52, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  codeBox: { width: 48, height: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segment: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill },
  segPill: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.pill, backgroundColor: colors.primary },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  checkBox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, marginTop: 1 },
});
