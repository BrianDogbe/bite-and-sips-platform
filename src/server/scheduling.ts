import 'server-only';
import { sql, type Db } from './db';
import { conflict, invalid } from './errors';
import type { OrderingSettings } from './settings';
import { addMinutes, localParts, timeToMinutes, zonedToUtc, ceilToStep, localDateKey } from '@/lib/time';

export interface OperatingHour {
  id: number;
  weekday: number;
  opensAt: string; // HH:MM
  closesAt: string;
}
export interface Closure {
  id: number;
  startsAt: Date;
  endsAt: Date;
  scope: 'all' | 'pickup' | 'delivery';
  reason: string;
}
export interface ScheduleData {
  hours: OperatingHour[];
  closures: Closure[];
}

export async function loadSchedule(db: Db = sql): Promise<ScheduleData> {
  const hours = await db<OperatingHour[]>`
    select id, weekday, to_char(opens_at, 'HH24:MI') as opens_at, to_char(closes_at, 'HH24:MI') as closes_at
    from operating_hours order by weekday, opens_at`;
  const closures = await db<Closure[]>`
    select id, starts_at, ends_at, scope, reason from service_closures
    where ends_at > now() - interval '1 day' order by starts_at`;
  return { hours, closures };
}

export type FulfillmentKind = 'pickup' | 'delivery';

/** Opening intervals (UTC) for the local calendar day containing `day`. */
export function intervalsForLocalDay(day: Date, tz: string, hours: OperatingHour[]): { start: Date; end: Date }[] {
  const p = localParts(day, tz);
  return hours
    .filter((h) => h.weekday === p.weekday)
    .map((h) => {
      const o = timeToMinutes(h.opensAt);
      const c = timeToMinutes(h.closesAt);
      return {
        start: zonedToUtc(p.year, p.month, p.day, Math.floor(o / 60), o % 60, tz),
        end: zonedToUtc(p.year, p.month, p.day, Math.floor(c / 60), c % 60, tz),
      };
    });
}

export function closureAt(t: Date, kind: FulfillmentKind, closures: Closure[]): Closure | null {
  return (
    closures.find((c) => (c.scope === 'all' || c.scope === kind) && new Date(c.startsAt) <= t && t < new Date(c.endsAt)) ?? null
  );
}

export function isOpenAt(t: Date, tz: string, data: ScheduleData, kind: FulfillmentKind): boolean {
  if (closureAt(t, kind, data.closures)) return false;
  return intervalsForLocalDay(t, tz, data.hours).some((i) => i.start <= t && t < i.end);
}

export interface Slot {
  start: string; // ISO UTC
  label?: string;
  remaining: number;
  available: boolean;
}

export interface SlotQuery {
  now: Date;
  tz: string;
  kind: FulfillmentKind;
  prepMinutes: number; // longest prep time in the cart
  settings: Pick<OrderingSettings, 'slotMinutes' | 'slotCapacity' | 'minLeadMinutes' | 'maxDaysAhead' | 'lastOrderBeforeCloseMinutes'>;
  data: ScheduleData;
  usage: Map<string, number>; // ISO slot start -> active reservations
}

/** Candidate slot starts ignoring capacity — pure function, unit tested. */
export function candidateSlots(q: Omit<SlotQuery, 'usage'>): Date[] {
  const { now, tz, settings, data, kind } = q;
  const lead = Math.max(settings.minLeadMinutes, q.prepMinutes);
  const earliest = ceilToStep(addMinutes(now, lead), settings.slotMinutes);
  const out: Date[] = [];
  for (let d = 0; d <= settings.maxDaysAhead; d++) {
    const day = addMinutes(now, d * 1440);
    for (const iv of intervalsForLocalDay(day, tz, data.hours)) {
      const lastStart = addMinutes(iv.end, -settings.lastOrderBeforeCloseMinutes);
      // First slot of a session: the kitchen needs `lead` minutes after opening too.
      let s = ceilToStep(addMinutes(iv.start, Math.min(lead, settings.minLeadMinutes)), settings.slotMinutes);
      if (s < earliest) s = earliest;
      for (; s <= lastStart; s = addMinutes(s, settings.slotMinutes)) {
        if (s < iv.start || s >= iv.end) continue;
        if (closureAt(s, kind, data.closures)) continue;
        out.push(new Date(s));
      }
    }
  }
  // de-duplicate (overlapping intervals) and sort
  const uniq = [...new Map(out.map((d) => [d.getTime(), d])).values()].sort((a, b) => a.getTime() - b.getTime());
  return uniq;
}

export function computeSlots(q: SlotQuery): Slot[] {
  return candidateSlots(q).map((s) => {
    const used = q.usage.get(s.toISOString()) ?? 0;
    const remaining = Math.max(0, q.settings.slotCapacity - used);
    return { start: s.toISOString(), remaining, available: remaining > 0 };
  });
}

export async function slotUsage(from: Date, to: Date, db: Db = sql): Promise<Map<string, number>> {
  const rows = await db<{ slotStart: Date; n: number }[]>`
    select slot_start, count(*)::int as n from slot_reservations
    where released_at is null and slot_start >= ${from} and slot_start <= ${to}
    group by slot_start`;
  return new Map(rows.map((r) => [new Date(r.slotStart).toISOString(), r.n]));
}

export async function availableSlots(
  args: { now?: Date; tz: string; kind: FulfillmentKind; prepMinutes: number; settings: SlotQuery['settings'] },
  db: Db = sql,
): Promise<Slot[]> {
  const now = args.now ?? new Date();
  const data = await loadSchedule(db);
  const usage = await slotUsage(now, addMinutes(now, (args.settings.maxDaysAhead + 1) * 1440), db);
  return computeSlots({ ...args, now, data, usage });
}

/**
 * Validate a requested slot (or pick the earliest for ASAP) and claim kitchen capacity.
 * Must be called inside the order-creation transaction, followed by `insertReservation`
 * in the same transaction. The per-slot advisory lock is held until COMMIT, which serialises
 * concurrent checkouts so slot capacity can never be exceeded.
 */
export async function claimSlot(
  t: Db,
  args: {
    requested: string | null; // ISO or null = ASAP
    now: Date;
    tz: string;
    kind: FulfillmentKind;
    prepMinutes: number;
    settings: SlotQuery['settings'];
  },
): Promise<{ slotStart: Date; isAsap: boolean }> {
  const data = await loadSchedule(t);
  const candidates = candidateSlots({ ...args, data });
  if (!candidates.length) throw conflict('There are no available times right now. Please check our opening hours.');

  const tryOrder: Date[] = args.requested
    ? (() => {
        const req = new Date(args.requested);
        if (Number.isNaN(req.getTime())) throw invalid('Invalid pickup time.');
        const match = candidates.find((c) => c.getTime() === req.getTime());
        if (!match) throw conflict('That time is no longer available. Please choose another time.', { code: 'slot_unavailable' });
        return [match];
      })()
    : candidates.slice(0, 24); // ASAP: earliest slot with room (look ahead a few hours)

  for (const s of tryOrder) {
    await t`select pg_advisory_xact_lock(hashtext(${'slot:' + s.toISOString()}))`;
    const [{ n }] = await t<{ n: number }[]>`
      select count(*)::int as n from slot_reservations where slot_start = ${s} and released_at is null`;
    if (n < args.settings.slotCapacity) return { slotStart: s, isAsap: !args.requested };
  }
  if (args.requested) throw conflict('That time just filled up. Please choose another time.', { code: 'slot_full' });
  throw conflict('The kitchen is fully booked for the next few hours. Please schedule a later time.', { code: 'slot_full' });
}

export async function insertReservation(t: Db, orderId: string, slotStart: Date) {
  await t`insert into slot_reservations (order_id, slot_start) values (${orderId}, ${slotStart})`;
}

export async function releaseSlot(t: Db, orderId: string) {
  await t`update slot_reservations set released_at = now() where order_id = ${orderId} and released_at is null`;
}

/** Human summary of today's hours, used on the storefront. */
export function hoursSummary(data: ScheduleData, tz: string, now = new Date()) {
  const todays = intervalsForLocalDay(now, tz, data.hours);
  const openNow = isOpenAt(now, tz, data, 'pickup') || isOpenAt(now, tz, data, 'delivery');
  return { todayKey: localDateKey(now, tz), intervals: todays, openNow, hasHours: data.hours.length > 0 };
}
