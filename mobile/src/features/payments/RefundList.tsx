import React from 'react';
import { View } from 'react-native';
import { Badge, Card, Txt } from '../../components';
import type { PaymentLinkHistory, PaymentRefund } from '../../types';
import { formatCurrency, formatDateTime, type Tone } from '../../utils';

const REFUND_STATUS: Record<PaymentRefund['status'], { label: string; tone: Tone; note: string }> = {
  requested: { label: 'Refund requested', tone: 'warning', note: 'Requested from the payment gateway. Banks usually take 5–7 working days.' },
  processed: { label: 'Refunded', tone: 'success', note: 'Confirmed by the payment gateway.' },
  failed: { label: 'Refund failed', tone: 'error', note: 'The gateway could not process it. Delco support will contact you.' },
  flagged: { label: 'Under review', tone: 'warning', note: 'Delco is reviewing this refund.' },
};

/** Refunds exactly as the server tracks them (F5). Never shows a refund as done before the gateway confirms it. */
export function RefundList({ refunds }: { refunds: PaymentRefund[] }) {
  if (!refunds.length) return null;
  return (
    <Card>
      {refunds.map((r) => {
        const st = REFUND_STATUS[r.status] ?? { label: r.status, tone: 'neutral' as Tone, note: '' };
        return (
          <View key={r.id} style={{ gap: 4, paddingVertical: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt variant="bodyStrong" style={{ flex: 1 }}>{formatCurrency(r.amount)}</Txt>
              <Badge label={st.label} tone={st.tone} />
            </View>
            <Txt variant="small">Requested {formatDateTime(r.requestedAt)}{r.confirmedAt ? ` · confirmed ${formatDateTime(r.confirmedAt)}` : ''}</Txt>
            {!!st.note && <Txt variant="caption">{st.note}</Txt>}
            {!!r.reason && <Txt variant="caption">Reason: {r.reason}</Txt>}
          </View>
        );
      })}
    </Card>
  );
}

const LINK_TONE: Record<PaymentLinkHistory['status'], Tone> = {
  active: 'info', paid: 'success', expired: 'neutral', replaced: 'neutral', cancelled: 'neutral',
};

/** Admin: every link of the order, newest first, with its status (Active, Paid, Expired, Replaced, Cancelled). */
export function LinkHistory({ links }: { links: PaymentLinkHistory[] }) {
  if (!links.length) return null;
  return (
    <Card>
      {links.map((l) => (
        <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          <View style={{ flex: 1 }}>
            <Txt variant="small">Created {formatDateTime(l.createdAt)}</Txt>
            <Txt variant="caption">{l.replacedAt ? `Replaced ${formatDateTime(l.replacedAt)}` : `Expires ${formatDateTime(l.expiresAt)}`}</Txt>
          </View>
          <Badge label={l.status.charAt(0).toUpperCase() + l.status.slice(1)} tone={LINK_TONE[l.status]} />
        </View>
      ))}
    </Card>
  );
}
