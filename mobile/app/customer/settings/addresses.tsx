import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, Notice, QueryView, Screen, TINTS, Txt, type Tint } from '../../../src/components';
import { haptic } from '../../../src/motion';
import { bookingService, customerService } from '../../../src/services';
import { useToast } from '../../../src/store';
import { colors, fonts, radius, shadow, spacing } from '../../../src/theme';
import type { Address } from '../../../src/types';

type Icon = keyof typeof Ionicons.glyphMap;

/** Icon from the address label the customer chose (Home, Work, Parents…). */
function lookOf(label: string): { icon: Icon; tint: Tint } {
  const l = label.toLowerCase();
  if (/home|house|flat/.test(l)) return { icon: 'home-outline', tint: 'orange' };
  if (/work|office/.test(l)) return { icon: 'briefcase-outline', tint: 'plum' };
  if (/parent|mom|dad|family/.test(l)) return { icon: 'people-outline', tint: 'green' };
  return { icon: 'location-outline', tint: 'accent' };
}

function AddressCard({ a, canDelete, onDelete }: { a: Address; canDelete: boolean; onDelete: () => void }) {
  const look = lookOf(a.label);
  const t = TINTS[look.tint];
  return (
    <View style={styles.shadow}>
    <View style={[styles.card, a.isDefault && styles.cardDefault]}>
      <View style={styles.head}>
        <View style={[styles.tile, { backgroundColor: t.bg }]}>
          <Ionicons name={look.icon} size={22} color={t.fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.titleRow}>
            <Txt variant="h3">{a.label}</Txt>
            {a.isDefault && (
              <View style={styles.defaultPill}>
                <Ionicons name="star" size={11} color={colors.success} />
                <Txt variant="caption" color={colors.success} style={{ fontFamily: fonts.medium }}>Default</Txt>
              </View>
            )}
          </View>
          <Txt variant="small" color={colors.textSecondary}>
            {a.line1}{a.line2 ? `, ${a.line2}` : ''}
          </Txt>
          <Txt variant="small">{a.city} {a.pincode}</Txt>
        </View>
      </View>
      {!!a.landmark && (
        <View style={styles.landmark}>
          <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
          <Txt variant="caption" style={{ flex: 1 }}>Near {a.landmark}</Txt>
        </View>
      )}
      <View style={styles.actions}>
        <Pressable onPress={() => (haptic.select(), router.push({ pathname: '/customer/settings/address-form', params: { id: a.id } }))}
          accessibilityRole="button" accessibilityLabel={`Edit ${a.label}`} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Ionicons name="create-outline" size={18} color={colors.purple} />
          <Txt style={styles.actionText} color={colors.purple}>Edit</Txt>
        </Pressable>
        <View style={styles.vr} />
        <Pressable onPress={canDelete ? () => (haptic.select(), onDelete()) : undefined} disabled={!canDelete}
          accessibilityRole="button" accessibilityLabel={`Delete ${a.label}`} accessibilityState={{ disabled: !canDelete }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed, !canDelete && { opacity: 0.4 }]}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
          <Txt style={styles.actionText} color={colors.error}>Delete</Txt>
        </Pressable>
      </View>
    </View>
    </View>
  );
}

/** Manage addresses. */
export default function Addresses() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['addresses'], queryFn: customerService.listAddresses });
  const config = useQuery({ queryKey: ['config'], queryFn: bookingService.getConfig, staleTime: 5 * 60 * 1000 });
  const max = config.data?.maxAddresses ?? 3;
  const count = query.data?.length ?? 0;
  const atLimit = count >= max;
  const [toDelete, setToDelete] = useState<Address | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => customerService.deleteAddress(id),
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['addresses'] });
      useToast.getState().show('Address removed');
    },
  });
  return (
    <Screen
      eyebrow={query.isSuccess ? `${count} of ${max} saved` : 'Account'}
      title="Your addresses"
      subtitle="Where your Delco chef comes to cook"
      footer={<Button title={atLimit ? `Limit of ${max} reached` : 'Add a new address'} icon="add" disabled={!query.isSuccess || atLimit} onPress={() => router.push('/customer/settings/address-form')} />}
    >
      {remove.isError && <Notice tone="error">{remove.error.message}</Notice>}
      {atLimit && <Notice>You can save up to {max} addresses. Delete one to add another.</Notice>}
      <QueryView query={query} empty={{ title: 'No addresses yet', message: 'Add the address where the chef should come.', icon: 'location-outline' }}>
        {(list) => {
          const sorted = [...list].sort((x, y) => Number(y.isDefault) - Number(x.isDefault));
          return sorted.map((a) => (
            <AddressCard key={a.id} a={a} canDelete={!(a.isDefault && list.length > 1)} onDelete={() => setToDelete(a)} />
          ));
        }}
      </QueryView>
      {query.isSuccess && count > 1 && (
        <Txt variant="caption" center>Your default address can be deleted once it’s the only one left</Txt>
      )}
      <ConfirmDialog
        visible={!!toDelete}
        title="Delete this address?"
        message={toDelete ? `${toDelete.label} · ${toDelete.line1}` : undefined}
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && !remove.isPending && remove.mutate(toDelete.id)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: radius.lg, backgroundColor: colors.card, ...shadow },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: 'transparent' },
  cardDefault: { borderColor: colors.successLight },
  head: { flexDirection: 'row', gap: 12, padding: spacing.md, paddingBottom: 12 },
  tile: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  defaultPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.successLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  landmark: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.md, marginBottom: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.backgroundSecondary },
  actions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 },
  actionText: { fontFamily: fonts.medium, fontSize: 15 },
  pressed: { backgroundColor: colors.sand },
  vr: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
