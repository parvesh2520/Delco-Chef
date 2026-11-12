import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Card, Txt } from '../../components';
import { SERVICE_LABELS } from '../../constants';
import { colors } from '../../theme';
import type { AttendanceRecord, ChefSuggestion, Payment, ServiceRequest } from '../../types';
import { formatCurrency, formatDate, formatDateTime, humanize } from '../../utils';

/** Invalidate all admin queries after a mutation. */
export const useAdminInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['admin'] });
};

export const Row = ({ children, gap = 8 }: { children: React.ReactNode; gap?: number }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }}>{children}</View>
);

export const Meta = ({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) => (
  <Row gap={4}>
    <Ionicons name={icon} size={14} color={colors.textSecondary} />
    <Txt variant="small">{text}</Txt>
  </Row>
);

export function RequestCard({ r, onPress }: { r: ServiceRequest; onPress?: () => void }) {
  return (
    <Card onPress={onPress ?? (() => router.push(`/admin/request/${r.id}`))} accessibilityLabel={`Request from ${r.customerName}`}>
      <Row>
        <Txt variant="h3" style={{ flex: 1 }}>{r.customerName}</Txt>
        <Badge status={r.status} />
      </Row>
      <Txt variant="bodyStrong" color={colors.purple}>{SERVICE_LABELS[r.service]}</Txt>
      <Row gap={14}>
        <Meta icon="location-outline" text={r.address.line2 ?? r.address.city} />
        <Meta icon="time-outline" text={r.requirements.slot} />
        <Meta icon="people-outline" text={`${r.requirements.members}`} />
      </Row>
      <Txt variant="caption">
        {r.assignedChefName ? `Chef: ${r.assignedChefName}` : 'No chef assigned'} · Created {formatDateTime(r.createdAt)}
      </Txt>
    </Card>
  );
}

export function SuggestionCard({ s, rank, onPress }: { s: ChefSuggestion; rank?: number; onPress?: () => void }) {
  return (
    <Card onPress={s.eligible ? onPress : undefined} tone={s.eligible ? 'default' : 'cream'} accessibilityLabel={`${s.chefName}${s.eligible ? `, score ${s.score}` : ', not eligible'}`}>
      <Row>
        {rank !== undefined && (
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: rank === 1 ? colors.accent : colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="label">#{rank}</Txt>
          </View>
        )}
        <Txt variant="h3" style={{ flex: 1 }}>{s.chefName}</Txt>
        {s.eligible ? <Badge tone="success" label={`Score ${s.score}`} /> : <Badge tone="error" label="Ineligible" />}
      </Row>
      <Row gap={14}>
        <Meta icon="navigate-outline" text={`${s.distanceKm} km`} />
        <Meta icon="star-outline" text={s.rating ? s.rating.toFixed(1) : 'New'} />
        <Meta icon="briefcase-outline" text={`${s.activeJobs} active`} />
        <Meta icon="ribbon-outline" text={`${s.experienceYears} yrs`} />
      </Row>
      <Txt variant="small">{s.cuisines.join(' · ')}</Txt>
      {s.eligible ? (
        <Txt variant="caption">
          Distance {s.breakdown.distance} · Rating {s.breakdown.rating} · Workload {s.breakdown.workload} · Cuisine {s.breakdown.cuisine}
        </Txt>
      ) : (
        s.reasons.map((reason) => (
          <Row key={reason} gap={6}>
            <Ionicons name="close-circle" size={14} color={colors.error} />
            <Txt variant="small" color={colors.error} style={{ flex: 1 }}>{reason}</Txt>
          </Row>
        ))
      )}
    </Card>
  );
}

export function PaymentCard({ p }: { p: Payment }) {
  return (
    <Card onPress={() => router.push(`/admin/payments/${p.id}`)}>
      <Row>
        <Txt variant="h3" style={{ flex: 1 }}>{p.customerName}</Txt>
        <Badge status={p.status} />
      </Row>
      <Row gap={14}>
        <Txt variant="bodyStrong">{formatCurrency(p.amount)}</Txt>
        <Txt variant="small">{SERVICE_LABELS[p.service]}</Txt>
      </Row>
      <Txt variant="caption">Link expires {formatDateTime(p.linkExpiresAt)} · {p.attempts} attempt(s)</Txt>
    </Card>
  );
}

export function AttendanceCard({ a }: { a: AttendanceRecord }) {
  return (
    <Card onPress={() => router.push(`/admin/attendance/${a.id}`)}>
      <Row>
        <Txt variant="h3" style={{ flex: 1 }}>{a.chefName}</Txt>
        <Badge status={a.status} />
      </Row>
      <Txt variant="small">{a.customerName} · {formatDate(a.date)} · {a.slot}</Txt>
      {a.exception && <Badge tone={a.status === 'resolved' ? 'neutral' : 'error'} label={humanize(a.exception)} />}
    </Card>
  );
}


// ---------------- Part C board (C5) and stage summary (C9) ----------------

/** The board's columns, in order, with the backend's stage keys (app/domain/board.py). Closed cards leave the board. */
export const BOARD_COLUMNS: { stage: string; title: string; hint: string }[] = [
  { stage: 'request', title: 'Request', hint: 'Assign a chef from the ranked list' },
  { stage: 'trial1_scheduled', title: 'Trial 1 · Scheduled', hint: 'Moves on when the visit is completed' },
  { stage: 'trial1_awaiting_decision', title: 'Trial 1 · Awaiting decision', hint: 'Customer decides, or push trial 2' },
  { stage: 'trial2_requested', title: 'Trial 2 · Requested', hint: 'Assign a chef from the ranked list' },
  { stage: 'trial2_scheduled', title: 'Trial 2 · Scheduled', hint: 'Moves on when the visit is completed' },
  { stage: 'trial2_awaiting_decision', title: 'Trial 2 · Awaiting decision', hint: 'Customer subscribes or rejects' },
  { stage: 'subscription_requested', title: 'Subscription requested', hint: 'Payment done is set only by a confirmed payment' },
  { stage: 'payment_done', title: 'Payment done', hint: 'Subscription active' },
];

export const STAGE_LABELS: Record<string, string> = {
  ...Object.fromEntries(BOARD_COLUMNS.map((c) => [c.stage, c.title])),
  closed: 'Closed',
};

/**
 * Stages from which an Admin may close a card by hand (mirror of MANUAL_ADMIN_MOVES on the server, used only to decide
 * whether to show the button; the server validates every move and refuses anything else with a specific error).
 */
export const CLOSABLE_STAGES = ['request', 'subscription_requested'];

const ACTOR_LABELS: Record<string, string> = {
  customer: 'Customer', admin: 'Admin', admin_assign: 'Admin (assign)', admin_push: 'Admin (push trial 2)',
  system: 'System', payment: 'Payment', customer_cancel: 'Customer (cancelled)',
};

/** Every move of one card: from → to, who, when, note (C5). */
export function BoardHistory({ moves }: { moves: import('../../services').BoardMove[] }) {
  if (!moves.length) return <Txt variant="small">No moves recorded yet.</Txt>;
  return (
    <Card>
      {moves.map((m, i) => (
        <View key={`${m.at}-${i}`} style={{ gap: 2, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
          <Txt variant="bodyStrong">{m.from ? `${STAGE_LABELS[m.from] ?? humanize(m.from)} → ` : 'Created in '}{STAGE_LABELS[m.to] ?? humanize(m.to)}</Txt>
          <Txt variant="small">{formatDateTime(m.at)} · {m.by && m.by !== m.actorKind ? `${m.by} (${ACTOR_LABELS[m.actorKind] ?? humanize(m.actorKind)})` : ACTOR_LABELS[m.actorKind] ?? humanize(m.actorKind)}</Txt>
          {!!m.note && <Txt variant="caption">“{m.note}”</Txt>}
        </View>
      ))}
    </Card>
  );
}

const FUNNEL: { key: keyof import('../../services').StageSummary['stages']; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'assigned', label: 'Chef assigned' },
  { key: 'trialDone', label: 'Trial done' },
  { key: 'subscriptionRequested', label: 'Subscription requested' },
  { key: 'paid', label: 'Paid' },
];

/** C9: customers reaching each stage, conversion between stages and average time to assignment, as the server reports them. */
export function StageSummaryCard({ s }: { s: import('../../services').StageSummary }) {
  const top = Math.max(s.stages.requested, 1);
  const avg = s.avgMinutesToAssignment;
  return (
    <Card>
      {FUNNEL.map((f, i) => {
        const n = s.stages[f.key];
        const prev = i ? FUNNEL[i - 1].key : null;
        const conv = prev ? s.conversionPercent[`${prev}->${f.key}`] : undefined;
        return (
          <View key={f.key} style={{ gap: 4 }}>
            <Row>
              <Txt variant="bodyStrong" style={{ flex: 1 }}>{f.label}</Txt>
              {conv !== undefined && <Txt variant="caption">{conv}% from previous</Txt>}
              <Txt variant="h3">{n}</Txt>
            </Row>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
              <View style={{ height: 6, width: `${(n / top) * 100}%`, backgroundColor: colors.accent }} />
            </View>
          </View>
        );
      })}
      <Txt variant="small">
        Average time from request to assignment: {avg === null ? 'no assignments yet' : avg >= 60 ? `${Math.round((avg / 60) * 10) / 10} h` : `${avg} min`}
      </Txt>
    </Card>
  );
}
