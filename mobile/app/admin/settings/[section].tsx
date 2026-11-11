import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Notice, Screen, TextField } from '../../../src/components';
import { useAdminInvalidate } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { adminService } from '../../../src/services';
import { useToast } from '../../../src/store';
import type { SettingsSection, SettingsSectionKey } from '../../../src/types';

const SLOT_RE = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

function validate(section: SettingsSection, values: Record<string, string>) {
  const errors: Record<string, string> = {};
  section.fields.forEach((f) => {
    const v = (values[f.key] ?? '').trim();
    if (!v) errors[f.key] = 'Required';
    else if (f.keyboard === 'numeric' && (!/^\d+(\.\d+)?$/.test(v) || Number(v) < 0)) errors[f.key] = 'Enter a positive number';
    else if (section.key === 'slots' && !v.split(',').every((s) => SLOT_RE.test(s.trim()))) errors[f.key] = 'Use HH:MM-HH:MM separated by commas';
    else if (section.key === 'trials' && Number(v) < 1) errors[f.key] = 'At least 1 trial';
  });
  let formError: string | undefined;
  if (section.key === 'ranking' && !Object.keys(errors).length) {
    const total = section.fields.reduce((a, f) => a + Number(values[f.key]), 0);
    if (total !== 100) formError = `Weights add up to ${total}. They must total 100.`;
  }
  return { errors, formError };
}

/** Generic editable form for a settings section. */
export default function SettingsSectionScreen() {
  const { section } = useLocalSearchParams<{ section: SettingsSectionKey }>();
  const invalidate = useAdminInvalidate();
  const query = useQuery({ queryKey: ['admin', 'settings', section], queryFn: () => adminService.getSettingsSection(section) });
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (query.data) setValues(Object.fromEntries(query.data.fields.map((f) => [f.key, f.value])));
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => adminService.saveSettingsSection(section, values),
    onSuccess: async () => {
      await invalidate();
      useToast.getState().show('Settings saved');
      router.back();
    },
  });
  const check = query.data ? validate(query.data, values) : { errors: {}, formError: undefined };
  const ok = !Object.keys(check.errors).length && !check.formError;
  return (
    <Screen
      title={query.data?.title ?? 'Settings'}
      subtitle={query.data?.description}
      footer={<Button title="Save changes" loading={save.isPending} disabled={!query.data} onPress={() => (setTouched(true), ok && save.mutate())} />}
    >
      <QueryView query={query} empty={{ title: 'Unknown settings section' }}>
        {(s) => (
          <>
            {s.fields.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                value={values[f.key] ?? ''}
                onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
                keyboardType={f.keyboard === 'numeric' ? 'decimal-pad' : 'default'}
                suffix={f.unit}
                hint={f.hint}
                multiline={s.key === 'slots'}
                error={touched ? check.errors[f.key] : undefined}
              />
            ))}
            {touched && check.formError && <Notice tone="error">{check.formError}</Notice>}
            <Notice>Changes apply to new requests and assignments. Existing bookings keep their current terms.</Notice>
            {save.isError && <Notice tone="error">{save.error.message}</Notice>}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
