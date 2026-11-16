import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SERVICE_LABELS } from '../constants';
import { haptic, PressableScale, PulseDot } from '../motion';
import { colors, fonts, radius, shadow, spacing } from '../theme';
import type { Subscription, Visit, VisitStatus } from '../types';
import { dayLabel, formatCurrency, formatDate, formatTime, isEndedVisit, isLiveVisit, isSameDay, timeUntil, visitEnd, visitStart } from '../utils';
import { Badge, Card, TINTS, type Tint } from './Card';
import { HeroButton, HeroChip, type HeroAction } from './Display';
import { ChefPhoto } from './ChefCard';
import { Txt } from './Txt';

/** Upcoming visit as a card for a horizontal row: a calendar date block, the service, the slot and the chef. */
export function VisitCard({ visit, onPress }: { visit: Visit; onPress: () => void }) {
  const d = new Date(visit.date);
  const chef = visit.chef;
  return (
    <PressableScale onPress={onPress} to={0.97} feedback="select" accessibilityRole="button"
      accessibilityLabel={`${SERVICE_LABELS[visit.service]} visit on ${formatDate(visit.date)}`} style={styles.visit}>
      <View style={styles.visitTop}>
        <View style={styles.dateBlock}>
          <Txt variant="caption" color={colors.accent} style={{ fontFamily: fonts.medium }}>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</Txt>
          <Txt style={styles.dateNum}>{d.getDate()}</Txt>
          <Txt variant="caption">{d.toLocaleDateString('en-IN', { month: 'short' })}</Txt>
        </View>
        <Badge status={visit.status} />
      </View>
      <View style={{ gap: 2 }}>
        <Txt variant="h3" numberOfLines={1}>{visit.kind === 'trial' ? 'Free trial' : SERVICE_LABELS[visit.service]}</Txt>
        <View style={styles.inline}>
          <Ionicons name="time-outline" size={14} color={colors.textMuted} />
          <Txt variant="small">{visit.slot}</Txt>
        </View>
      </View>
      <View style={styles.visitChef}>
        {chef ? <ChefPhoto chef={chef} size={28} /> : <View style={styles.chefPending}><Ionicons name="person-outline" size={14} color={colors.textMuted} /></View>}
        <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>{chef?.name ?? 'Assigning your chef'}</Txt>
      </View>
    </PressableScale>
  );
}

/** The plan at a glance: visits done out of planned, period, slot and price. */
export function PlanCard({ sub, onPress }: { sub: Subscription; onPress?: () => void }) {
  const planned = sub.plannedVisits ?? 0;
  const done = Math.min(sub.completedVisits ?? 0, planned || Infinity);
  const pct = planned ? done / planned : 0;
  return (
    <Card tone="plum" onPress={onPress} style={styles.plan} accessibilityLabel={`${SERVICE_LABELS[sub.service]}, ${done} of ${planned} visits done`}>
      <View style={styles.planTop}>
        <Txt variant="eyebrow">{SERVICE_LABELS[sub.service]}</Txt>
        <View style={styles.planBadge}><Badge status={sub.status} /></View>
      </View>
      <View style={styles.inlineEnd}>
        <Txt style={styles.planBig} color={colors.textOnDark}>{done}</Txt>
        <Txt color={colors.accentLight} style={{ marginBottom: 6 }}>of {planned} plan visits done</Txt>
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: planned, now: done }}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <View style={styles.planFoot}>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt variant="small" color={colors.accentLight}>{formatDate(sub.startDate)} – {formatDate(sub.endDate)}</Txt>
          <Txt variant="small" color={colors.accentLight}>{sub.slot}</Txt>
        </View>
        <Txt style={styles.planPrice} color={colors.textOnDark}>{formatCurrency(sub.amount)}</Txt>
      </View>
    </Card>
  );
}

type IconName = keyof typeof Ionicons.glyphMap;
/** A booking in progress: coloured icon tile, title, detail, status and (for plans) a visits progress bar. */
export function BookingCard({ icon, tint, title, subtitle, right, progress, onPress }: {
  icon: IconName; tint: Tint; title: string; subtitle: string; right?: React.ReactNode; progress?: { done: number; total: number }; onPress: () => void;
}) {
  const t = TINTS[tint];
  const pct = progress && progress.total ? Math.min(progress.done / progress.total, 1) : 0;
  return (
    <PressableScale onPress={onPress} to={0.98} feedback="select" accessibilityRole="button" accessibilityLabel={title} style={styles.booking}>
      <View style={styles.bookingRow}>
        <View style={[styles.tile, { backgroundColor: t.bg }]}>
          <Ionicons name={icon} size={22} color={t.fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="h3" numberOfLines={1}>{title}</Txt>
          <Txt variant="small" numberOfLines={1}>{subtitle}</Txt>
        </View>
        {right}
      </View>
      {progress && progress.total > 0 && (
        <View style={{ gap: 6 }}>
          <View style={styles.bookingTrack}><View style={[styles.bookingFill, { width: `${Math.round(pct * 100)}%` }]} /></View>
          <Txt variant="caption">{progress.done} of {progress.total} plan visits done{progress.done === 0 ? " · trial visits aren’t counted" : ""}</Txt>
        </View>
      )}
    </PressableScale>
  );
}

/** Square shortcut tile with a coloured icon disc, for a row of quick actions. */
export function QuickAction({ icon, tint, label, caption, onPress }: { icon: IconName; tint: Tint; label: string; caption?: string; onPress: () => void }) {
  const t = TINTS[tint];
  return (
    <PressableScale onPress={onPress} to={0.96} feedback="select" accessibilityRole="button" accessibilityLabel={label} style={styles.quick}>
      <View style={[styles.quickIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={20} color={t.fg} />
      </View>
      <View style={{ gap: 2 }}>
        <Txt variant="label" numberOfLines={2}>{label}</Txt>
        {caption && <Txt variant="caption" numberOfLines={1}>{caption}</Txt>}
      </View>
    </PressableScale>
  );
}

const STEPS = ['Confirmed', 'On the way', 'Arrived', 'Cooking', 'Done'] as const;

/** Where the visit is now, from the server's visit status (and the tracking "arriving" flag). */
export function visitStep(status?: string, arriving?: boolean): number {
  switch (status) {
    case 'chef_travelling': return arriving ? 2 : 1;
    case 'arrived': return 2;
    case 'checked_in':
    case 'cooking': return 3;
    case 'completed': return 4;
    default: return 0;
  }
}

/** Five-step progress strip for a visit. */
export function VisitSteps({ step }: { step: number }) {
  return (
    <View style={styles.steps} accessibilityLabel={`Visit progress: ${STEPS[step]}`}>
      {STEPS.map((label, i) => {
        const done = i < step || step === STEPS.length - 1;
        const current = i === step && !done;
        return (
          <View key={label} style={styles.step}>
            <View style={styles.stepRow}>
              <View style={[styles.bar, { opacity: i === 0 ? 0 : 1 }, i <= step && styles.barOn]} />
              <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]}>
                {done ? <Ionicons name="checkmark" size={12} color={colors.textOnDark} /> : current ? <PulseDot color={colors.accent} size={8} /> : null}
              </View>
              <View style={[styles.bar, { opacity: i === STEPS.length - 1 ? 0 : 1 }, i < step && styles.barOn]} />
            </View>
            <Txt variant="caption" center color={i <= step ? colors.text : colors.textMuted} style={current ? { fontFamily: fonts.medium } : undefined}>{label}</Txt>
          </View>
        );
      })}
    </View>
  );
}

/** 1–5 star picker; read-only when `onChange` is omitted. */
export function Stars({ value, onChange, size = 32 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.25 }} accessibilityRole={onChange ? 'adjustable' : undefined} accessibilityLabel={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Ionicons name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.accent : colors.border} />;
        return onChange ? (
          <Pressable key={n} hitSlop={6} onPress={() => (haptic.select(), onChange(n))} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>
            {icon}
          </Pressable>
        ) : <View key={n}>{icon}</View>;
      })}
    </View>
  );
}

// ---------- Next visit hero ----------
const LIVE_LABEL: Partial<Record<VisitStatus, string>> = {
  chef_travelling: 'Chef on the way', arrived: 'Chef has arrived', checked_in: 'Cooking now', cooking: 'Cooking now',
};

/** What is happening with the visit now, or how long until it starts. */
function visitCountdown(v: Visit, now: number): { label: string; live: boolean } {
  const live = LIVE_LABEL[v.status];
  if (live) return { label: live, live: true };
  if (v.status === 'pending_assignment') return { label: 'Matching your chef', live: false };
  const start = visitStart(v);
  return start <= now ? { label: 'Starting now', live: true } : { label: `Starts in ${timeUntil(start, now)}`, live: false };
}

/** "7:30 pm" → ["7:30", "PM"], so the hour can be set large and the period small. */
function splitTime(ms: number): [string, string] {
  const s = formatTime(new Date(ms).toISOString());
  const m = /^(.*?)\s*([ap]\.?\s?m\.?)$/i.exec(s);
  return m ? [m[1], m[2].replace(/[.\s]/g, '').toUpperCase()] : [s, ''];
}

/** A visit is behind the customer once it ended on the server or its slot is over. */
const isPast = (v: Visit, now: number) => isEndedVisit(v) || (!isLiveVisit(v) && visitEnd(v) <= now);

/**
 * The next visit, large: its start time, a live countdown, the chef and the day's other visits on a timeline.
 * `today` holds every visit on the hero's day (finished ones too), so a second visit later in the day shows where it sits.
 */
export function VisitHero({ visit, now, today, onPress, actions = [] }: { visit: Visit; now: number; today: Visit[]; onPress?: () => void; actions?: HeroAction[] }) {
  const start = visitStart(visit);
  const [hm, period] = splitTime(start);
  const cd = visitCountdown(visit, now);
  const index = today.findIndex((v) => v.id === visit.id);
  const chef = visit.chef;
  const chefName = chef?.name ?? visit.chefName;
  const service = visit.kind === 'trial' ? 'Free trial' : SERVICE_LABELS[visit.service];
  const [main, ...rest] = actions;
  return (
    <Card tone="plum" onPress={onPress} style={styles.hero} accessibilityLabel={`${dayLabel(start, now)} at ${hm} ${period}. ${cd.label}. ${service}`}>
      <View style={styles.heroTop}>
        <Txt variant="eyebrow" color={colors.accent}>
          {dayLabel(start, now)}{today.length > 1 && index >= 0 ? ` · Visit ${index + 1} of ${today.length}` : ''}
        </Txt>
        <View style={[styles.heroPill, cd.live && styles.heroPillLive]}>
          {cd.live ? <PulseDot color={colors.accent} size={6} /> : <Ionicons name="time-outline" size={13} color={colors.accent} />}
          <Txt variant="label" color={colors.textOnDark}>{cd.label}</Txt>
        </View>
      </View>

      <View>
        <View style={styles.heroTime}>
          <Txt variant="hero" color={colors.textOnDark}>{hm}</Txt>
          {!!period && <Txt style={styles.heroPeriod} color={colors.accent}>{period}</Txt>}
        </View>
        <Txt variant="body" color={colors.accentLight}>{service} · {visit.slot}</Txt>
      </View>

      {isSameDay(start, now) && today.length > 0 && <DayLine visits={today} current={visit} now={now} />}

      <View style={styles.heroChef}>
        {chef ? <ChefPhoto chef={chef} size={36} /> : (
          <View style={styles.heroChefPending}><Ionicons name="person-outline" size={16} color={colors.accentLight} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong" color={colors.textOnDark} numberOfLines={1}>{chefName || 'Assigning your chef'}</Txt>
          <Txt variant="caption" color={colors.accentLight}>{chefName ? 'Your Delco chef' : 'We’ll notify you once it’s confirmed'}</Txt>
        </View>
      </View>

      {main && <HeroButton {...main} />}
      {rest.length > 0 && <View style={styles.heroMore}>{rest.map((a) => <HeroChip key={a.title} {...a} />)}</View>}
    </Card>
  );
}

/** The day from morning to night: finished visits ticked, the next one ringed, and a marker at the current time. */
function DayLine({ visits, current, now }: { visits: Visit[]; current: Visit; now: number }) {
  const day = new Date(visitStart(current));
  const from = Math.min(new Date(day).setHours(6, 0, 0, 0), ...visits.map(visitStart));
  const to = Math.max(new Date(day).setHours(23, 0, 0, 0), ...visits.map(visitEnd));
  const pct = (t: number) => `${Math.min(1, Math.max(0, (t - from) / (to - from))) * 100}%` as const;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.dayLine} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.dayTrack}><View style={[styles.dayPast, { width: pct(now) }]} /></View>
        {visits.map((v) => (
          <View key={v.id} style={[styles.dayDot, { left: pct(visitStart(v)) }, isPast(v, now) && styles.dayDotDone, v.id === current.id && styles.dayDotCurrent]}>
            {isPast(v, now) && <Ionicons name="checkmark" size={9} color={colors.primary} />}
          </View>
        ))}
        {now > from && now < to && <View style={[styles.nowMark, { left: pct(now) }]} />}
      </View>
      {visits.length > 1 && (
        <View style={styles.dayChips}>
          {visits.map((v) => {
            const done = isPast(v, now);
            const isCurrent = v.id === current.id;
            return (
              <View key={v.id} style={[styles.dayChip, isCurrent && styles.dayChipCurrent]}>
                <Ionicons name={done ? 'checkmark-circle' : isCurrent ? 'radio-button-on' : 'ellipse-outline'} size={12} color={done ? colors.accentLight : colors.accent} />
                <Txt variant="caption" color={done ? colors.accentLight : colors.textOnDark} style={[done && styles.chipDone, isCurrent && { fontFamily: fonts.medium }]}>
                  {formatTime(new Date(visitStart(v)).toISOString())}
                </Txt>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ---------- Week agenda ----------
/**
 * Seven days from today as a strip of day pills (a dot per booked visit); below it, the chosen day's visits on a
 * timeline. Opens on the first day that still has a visit ahead.
 */
export function WeekAgenda({ visits, now, onOpen, onBook }: { visits: Visit[]; now: number; onOpen: (v: Visit) => void; onBook: () => void }) {
  const base = new Date(now);
  const days = Array.from({ length: 7 }, (_, i) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + i));
  const byDay = days.map((d) =>
    visits.filter((v) => v.status !== 'cancelled' && isSameDay(visitStart(v), d)).sort((a, b) => visitStart(a) - visitStart(b)));
  const [sel, setSel] = useState(() => Math.max(0, byDay.findIndex((list) => list.some((v) => !isPast(v, now)))));
  const list = byDay[sel];
  const nextId = list.find((v) => !isPast(v, now))?.id;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.week} accessibilityRole="tablist">
        {days.map((d, i) => {
          const on = i === sel;
          const n = byDay[i].length;
          return (
            <PressableScale key={d.toDateString()} onPress={() => setSel(i)} feedback="select" to={0.92}
              accessibilityRole="tab" accessibilityState={{ selected: on }}
              accessibilityLabel={`${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}, ${n} visit${n === 1 ? '' : 's'}`}
              style={[styles.weekDay, on && styles.weekDayOn]}>
              <Txt variant="caption" color={on ? colors.accent : colors.textMuted} style={{ fontFamily: fonts.medium }}>
                {i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}
              </Txt>
              <Txt style={styles.weekNum} color={on ? colors.textOnDark : colors.text}>{d.getDate()}</Txt>
              <View style={styles.weekDots}>
                {byDay[i].slice(0, 3).map((v) => (
                  <View key={v.id} style={[styles.weekDot, { backgroundColor: on ? colors.accent : isPast(v, now) ? colors.border : colors.purple }]} />
                ))}
              </View>
            </PressableScale>
          );
        })}
      </View>

      {list.length ? (
        <View>
          {list.map((v, i) => <AgendaRow key={v.id} visit={v} past={isPast(v, now)} next={v.id === nextId} last={i === list.length - 1} onPress={() => onOpen(v)} />)}
        </View>
      ) : (
        <View style={styles.emptyDay}>
          <View style={styles.emptyIcon}><Ionicons name="cafe-outline" size={22} color={colors.purple} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong">Nothing booked for {sel === 0 ? 'today' : days[sel].toLocaleDateString('en-IN', { weekday: 'long' })}</Txt>
            <Txt variant="small">Want a chef that day? Booking takes a minute.</Txt>
          </View>
          <PressableScale onPress={onBook} to={0.94} accessibilityRole="button" accessibilityLabel="Book a chef" style={styles.emptyBtn}>
            <Ionicons name="add" size={20} color={colors.textOnDark} />
          </PressableScale>
        </View>
      )}
    </View>
  );
}

/** One visit on the agenda: time on the left, a rail with a status dot, then the visit card. */
function AgendaRow({ visit, past, next, last, onPress }: { visit: Visit; past: boolean; next: boolean; last: boolean; onPress: () => void }) {
  const [hm, period] = splitTime(visitStart(visit));
  const chefName = visit.chef?.name ?? visit.chefName;
  const title = visit.kind === 'trial' ? 'Free trial' : SERVICE_LABELS[visit.service];
  return (
    <View style={[styles.agendaRow, past && { opacity: 0.6 }]}>
      <View style={styles.agendaTime}>
        <Txt style={styles.agendaHm}>{hm}</Txt>
        <Txt variant="caption">{period}</Txt>
      </View>
      <View style={styles.rail}>
        <View style={[styles.railDot, past && styles.railDotPast, next && styles.railDotNext]}>
          {past ? <Ionicons name="checkmark" size={10} color={colors.textOnDark} /> : next ? <PulseDot color={colors.accent} size={5} /> : null}
        </View>
        {!last && <View style={styles.railLine} />}
      </View>
      <PressableScale onPress={onPress} to={0.98} feedback="select" accessibilityRole="button"
        accessibilityLabel={`${title} at ${hm} ${period}`} style={[styles.agendaCard, next && styles.agendaCardNext]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="h3" numberOfLines={1}>{title}</Txt>
          <Txt variant="small" numberOfLines={1}>{chefName || 'Assigning your chef'} · {visit.slot}</Txt>
        </View>
        <Badge status={visit.status} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  booking: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 12, ...shadow },
  bookingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  bookingTrack: { height: 6, borderRadius: 3, backgroundColor: colors.sand, overflow: 'hidden' },
  bookingFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  quick: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 10, minHeight: 112, ...shadow },
  quickIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  visit: { width: 232, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 12, ...shadow },
  visitTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  dateBlock: { width: 56, alignItems: 'center', paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border },
  dateNum: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 28, color: colors.text },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inlineEnd: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  visitChef: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  chefPending: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  plan: { padding: spacing.lg, gap: 12 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planBadge: { backgroundColor: colors.card, borderRadius: radius.sm },
  planBig: { fontFamily: fonts.heading, fontSize: 44, lineHeight: 50 },
  planPrice: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 },
  planFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,248,239,0.16)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  steps: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  bar: { flex: 1, height: 2, backgroundColor: colors.border },
  barOn: { backgroundColor: colors.accent },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  dotCurrent: { borderColor: colors.accent },
  hero: { padding: spacing.lg, gap: spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,248,239,0.1)', borderWidth: 1, borderColor: 'rgba(255,248,239,0.18)',
  },
  heroPillLive: { paddingLeft: 4, borderColor: colors.accent },
  heroTime: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  heroPeriod: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 30, marginBottom: 6 },
  heroChef: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,248,239,0.2)',
  },
  heroChefPending: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,248,239,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroMore: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayLine: { height: 18, justifyContent: 'center' },
  dayTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,248,239,0.16)', overflow: 'hidden' },
  dayPast: { height: 4, backgroundColor: 'rgba(232,152,62,0.55)' },
  dayDot: {
    position: 'absolute', width: 14, height: 14, marginLeft: -7, borderRadius: 7, borderWidth: 2, borderColor: colors.accentLight,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  dayDotDone: { backgroundColor: colors.accentLight },
  dayDotCurrent: { width: 18, height: 18, marginLeft: -9, borderRadius: 9, borderWidth: 3, borderColor: colors.accent },
  nowMark: { position: 'absolute', width: 2, height: 18, marginLeft: -1, borderRadius: 1, backgroundColor: colors.textOnDark },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(255,248,239,0.08)' },
  dayChipCurrent: { backgroundColor: 'rgba(232,152,62,0.22)' },
  chipDone: { textDecorationLine: 'line-through' },
  week: { flexDirection: 'row', gap: 6 },
  weekDay: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.card, ...shadow },
  weekDayOn: { backgroundColor: colors.primary },
  weekNum: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26 },
  weekDots: { flexDirection: 'row', gap: 3, height: 5 },
  weekDot: { width: 5, height: 5, borderRadius: 3 },
  agendaRow: { flexDirection: 'row', gap: 10 },
  agendaTime: { width: 52, alignItems: 'flex-end', paddingTop: 14 },
  agendaHm: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 22, color: colors.text },
  rail: { width: 18, alignItems: 'center', paddingTop: 18 },
  railDot: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.purple, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
  },
  railDotPast: { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
  railDotNext: { borderColor: colors.accent },
  railLine: { flex: 1, width: 2, marginTop: 4, backgroundColor: colors.border },
  agendaCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: 'transparent', ...shadow,
  },
  agendaCardNext: { borderColor: colors.accent },
  emptyDay: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  emptyBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
