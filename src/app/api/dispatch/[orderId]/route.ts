import { NextResponse } from 'next/server';
import { handler, noStore, readJson, assertSameOrigin } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { assignRider, unassignRider, overrideDelivery, failDelivery, resolveFailedDelivery } from '@/server/fulfillment/inhouse';
import { requestPartnerDelivery, recordManualBooking, updateManualBookingStatus, cancelPartnerBooking, reconcileUnknownBooking } from '@/server/fulfillment/partners';
import { invalid } from '@/server/errors';

export const dynamic = 'force-dynamic';

type Body = {
  action?: string;
  riderUserId?: string;
  allowOffline?: boolean;
  riderFeePesewas?: number | null;
  reason?: string;
  provider?: string;
  providerName?: string;
  externalRef?: string;
  feePesewas?: number | null;
  notes?: string;
  status?: 'courier_assigned' | 'picked_up' | 'on_the_way' | 'delivered' | 'failed' | 'cancelled';
  courierName?: string;
  courierPhone?: string;
  idempotencyKey?: string;
  bookingId?: string;
  outcome?: 'booked' | 'not_booked';
  next?: 'returned' | 'unassigned';
};

export const POST = handler(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  assertSameOrigin(req);
  const { orderId } = await ctx.params;
  const user = await getCurrentUser();
  const b = (await readJson(req)) as Body;
  const key = b.idempotencyKey && /^[A-Za-z0-9_-]{8,80}$/.test(b.idempotencyKey) ? b.idempotencyKey : null;
  switch (b.action) {
    case 'assign':
      await assignRider(user, { orderId, riderUserId: String(b.riderUserId), allowOffline: !!b.allowOffline, riderFeePesewas: b.riderFeePesewas ?? null, reason: b.reason });
      break;
    case 'unassign':
      await unassignRider(user, orderId, String(b.reason ?? ''));
      break;
    case 'override':
      await overrideDelivery(user, orderId, String(b.reason ?? ''));
      break;
    case 'fail':
      await failDelivery(user, orderId, String(b.reason ?? ''));
      break;
    case 'resolve_failed':
      await resolveFailedDelivery(user, orderId, b.next === 'returned' ? 'returned' : 'unassigned', String(b.reason ?? ''));
      break;
    case 'partner_request':
      if (!key) throw invalid('Missing request key.');
      await requestPartnerDelivery(user, { orderId, provider: String(b.provider), idempotencyKey: key });
      break;
    case 'manual_booking':
      if (!key) throw invalid('Missing request key.');
      await recordManualBooking(user, { orderId, providerName: String(b.providerName ?? ''), externalRef: b.externalRef ?? null, feePesewas: b.feePesewas ?? null, notes: b.notes ?? null, idempotencyKey: key });
      break;
    case 'partner_status':
      if (!b.status) throw invalid('Choose a status.');
      await updateManualBookingStatus(user, { orderId, status: b.status, note: b.reason ?? null, finalFeePesewas: b.feePesewas ?? null, courierName: b.courierName ?? null, courierPhone: b.courierPhone ?? null });
      break;
    case 'partner_cancel':
      await cancelPartnerBooking(user, orderId, String(b.reason ?? ''));
      break;
    case 'partner_reconcile':
      await reconcileUnknownBooking(
        user,
        String(b.bookingId),
        b.outcome === 'booked' ? { outcome: 'booked', externalId: String(b.externalRef ?? ''), feePesewas: b.feePesewas ?? null } : b.outcome === 'not_booked' ? { outcome: 'not_booked' } : undefined,
      );
      break;
    default:
      throw invalid('Unknown action.');
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
});
