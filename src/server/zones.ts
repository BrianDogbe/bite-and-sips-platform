import 'server-only';
import { sql, type Db } from './db';

export interface DeliveryZone {
  id: number;
  name: string;
  description: string | null;
  centerLat: number;
  centerLng: number;
  radiusM: number;
  feePesewas: number;
  minOrderPesewas: number;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  isActive: boolean;
  sortOrder: number;
  isDemo: boolean;
}

export async function listZones(opts: { activeOnly?: boolean } = {}, db: Db = sql): Promise<DeliveryZone[]> {
  return db<DeliveryZone[]>`
    select * from delivery_zones where ${!opts.activeOnly} or is_active order by sort_order, radius_m`;
}

/** Great-circle distance in metres. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type ZoneResolution =
  | { ok: true; zone: DeliveryZone; verified: boolean; distanceM: number | null }
  | { ok: false; reason: 'outside_area' | 'no_location' | 'zone_unavailable' | 'manual_zone_disabled' };

/**
 * Resolve the delivery zone.
 *  - With coordinates: the smallest active zone containing the point. Marked verified.
 *  - Without coordinates: the customer-selected zone (if manual selection is allowed). NOT verified —
 *    dispatch sees a warning and should confirm the address by phone.
 */
export function resolveZone(
  zones: DeliveryZone[],
  input: { lat?: number | null; lng?: number | null; zoneId?: number | null },
  allowManual: boolean,
): ZoneResolution {
  const active = zones.filter((z) => z.isActive);
  if (input.lat != null && input.lng != null && Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    const matches = active
      .map((z) => ({ z, d: haversineM(z.centerLat, z.centerLng, input.lat!, input.lng!) }))
      .filter((m) => m.d <= m.z.radiusM)
      .sort((a, b) => a.z.radiusM - b.z.radiusM);
    if (!matches.length) return { ok: false, reason: 'outside_area' };
    return { ok: true, zone: matches[0].z, verified: true, distanceM: Math.round(matches[0].d) };
  }
  if (input.zoneId != null) {
    if (!allowManual) return { ok: false, reason: 'manual_zone_disabled' };
    const z = active.find((x) => x.id === input.zoneId);
    if (!z) return { ok: false, reason: 'zone_unavailable' };
    return { ok: true, zone: z, verified: false, distanceM: null };
  }
  return { ok: false, reason: 'no_location' };
}

export const ZONE_ERRORS: Record<Exclude<ZoneResolution, { ok: true }>['reason'], string> = {
  outside_area: "Sorry — that location is outside our delivery area. You can choose pickup instead.",
  no_location: 'Please share your location or choose your delivery area.',
  zone_unavailable: 'That delivery area is not available right now.',
  manual_zone_disabled: 'Please share your location using the "Use my location" button so we can confirm delivery.',
};
