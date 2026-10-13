import 'server-only';
import { sql, type Db } from './db';

export interface DeliveryZone {
  id: number;
  name: string;
  description: string | null;
  centerLat: number;
  centerLng: number;
  radiusM: number;
  /** Base fee. Total fee = base + perKm × distance (capped at maxFeePesewas when set). */
  feePesewas: number;
  perKmPesewas: number;
  maxFeePesewas: number | null;
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

/**
 * Delivery fee for a zone at a given distance (metres) from the restaurant.
 * Rounded up to the nearest 50 pesewas (GH₵0.50) and capped at the zone maximum.
 * With no per-km rate this is just the zone's flat fee.
 */
export function deliveryFeeFor(zone: Pick<DeliveryZone, 'feePesewas' | 'perKmPesewas' | 'maxFeePesewas'>, distanceM: number): number {
  if (!zone.perKmPesewas) return zone.feePesewas;
  const raw = zone.feePesewas + (zone.perKmPesewas * Math.max(0, distanceM)) / 1000;
  let fee = Math.ceil(raw / 50 - 1e-9) * 50;
  if (zone.maxFeePesewas != null) fee = Math.min(fee, zone.maxFeePesewas);
  return fee;
}

export type ZoneResolution =
  | { ok: true; zone: DeliveryZone; verified: boolean; distanceM: number | null; feeDistanceM: number; feeEstimated: boolean }
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
  /** Where distance is measured from (the restaurant). Falls back to the zone centre. */
  origin?: { lat: number | null; lng: number | null } | null,
): ZoneResolution {
  const active = zones.filter((z) => z.isActive);
  if (input.lat != null && input.lng != null && Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    const matches = active
      .map((z) => ({ z, d: haversineM(z.centerLat, z.centerLng, input.lat!, input.lng!) }))
      .filter((m) => m.d <= m.z.radiusM)
      .sort((a, b) => a.z.radiusM - b.z.radiusM);
    if (!matches.length) return { ok: false, reason: 'outside_area' };
    const z = matches[0].z;
    const hasOrigin = origin?.lat != null && origin?.lng != null;
    const fromOrigin = hasOrigin ? haversineM(origin!.lat!, origin!.lng!, input.lat!, input.lng!) : matches[0].d;
    return { ok: true, zone: z, verified: true, distanceM: Math.round(matches[0].d), feeDistanceM: Math.round(fromOrigin), feeEstimated: false };
  }
  if (input.zoneId != null) {
    if (!allowManual) return { ok: false, reason: 'manual_zone_disabled' };
    const z = active.find((x) => x.id === input.zoneId);
    if (!z) return { ok: false, reason: 'zone_unavailable' };
    // No GPS: estimate with a typical distance (half the zone radius). Dispatch confirms the address by phone.
    return { ok: true, zone: z, verified: false, distanceM: null, feeDistanceM: Math.round(z.radiusM / 2), feeEstimated: true };
  }
  return { ok: false, reason: 'no_location' };
}

export const ZONE_ERRORS: Record<Exclude<ZoneResolution, { ok: true }>['reason'], string> = {
  outside_area: "Sorry — that location is outside our delivery area. You can choose pickup instead.",
  no_location: 'Please share your location or choose your delivery area.',
  zone_unavailable: 'That delivery area is not available right now.',
  manual_zone_disabled: 'Please share your location using the "Use my location" button so we can confirm delivery.',
};
