import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChipGroup, ErrorState, LoadingState, Txt } from '../../components';
import { DIET_LABELS } from '../../constants';
import { bookingService } from '../../services';
import type { DietType } from '../../types';
import { colors } from '../../theme';

export * from './address';

/** Preferred language (A5). Options come from GET /config so the app only offers what the server accepts. */
export function LanguagePicker({ value, onChange, error }: { value?: string; onChange: (v: string) => void; error?: string }) {
  const config = useQuery({ queryKey: ['config'], queryFn: bookingService.getConfig, staleTime: 5 * 60 * 1000 });
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label">Preferred language</Txt>
      {config.isPending ? (
        <LoadingState label="Loading languages…" />
      ) : config.isError ? (
        <ErrorState error={config.error} onRetry={() => config.refetch()} />
      ) : (
        <ChipGroup options={config.data.languages ?? []} value={value} onChange={(v) => onChange(v as string)} />
      )}
      {error ? <Txt variant="caption" color={colors.error}>{error}</Txt> : <Txt variant="caption">We’ll try to match you with a chef who speaks it.</Txt>}
    </View>
  );
}

/** Dietary preference (A5). */
export function DietPicker({ value, onChange }: { value?: DietType | null; onChange: (v: DietType) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label">Dietary preference</Txt>
      <ChipGroup options={(Object.keys(DIET_LABELS) as DietType[]).map((d) => ({ value: d, label: DIET_LABELS[d] }))} value={value ?? undefined} onChange={(v) => onChange(v as DietType)} />
    </View>
  );
}
