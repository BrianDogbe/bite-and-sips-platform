import { NextResponse } from 'next/server';
import { handler, noStore } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { dispatchBoard } from '@/server/orders/queries';
import { listRiders } from '@/server/fulfillment/inhouse';
import { partnerAdapters } from '@/server/fulfillment/partners';
import { getSettings } from '@/server/settings';
import { requirePerm } from '@/server/auth/guard';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const user = requirePerm(await getCurrentUser(), 'dispatch.manage');
  const [orders, riders, s] = await Promise.all([dispatchBoard(user), listRiders(), getSettings('delivery')]);
  return NextResponse.json(
    {
      serverTime: new Date().toISOString(),
      orders,
      riders,
      partners: partnerAdapters().map((p) => ({ key: p.key, label: p.label, simulated: p.simulated, capabilities: p.capabilities })),
      locationStaleSeconds: s.locationStaleSeconds,
      defaultRiderFeePesewas: s.defaultRiderFeePesewas,
    },
    { headers: noStore },
  );
});
