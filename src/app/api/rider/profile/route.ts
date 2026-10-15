import { NextResponse } from '@/server/response';
import { handler, noStore, readJson, assertSameOrigin } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { updateRiderVehicle } from '@/server/fulfillment/inhouse';
import { changeOwnPassword } from '@/server/staff';
import { requirePerm } from '@/server/auth/guard';
import { invalid } from '@/server/errors';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const user = requirePerm(await getCurrentUser(), 'rider.deliver');
  const b = (await readJson(req)) as { action?: string; vehicleType?: string; vehiclePlate?: string; current?: string; next?: string };
  if (b.action === 'vehicle') {
    await updateRiderVehicle(user, { vehicleType: String(b.vehicleType ?? ''), vehiclePlate: b.vehiclePlate });
  } else if (b.action === 'password') {
    if (!b.current || !b.next) throw invalid('Enter your current and new password.');
    await changeOwnPassword(user, b.current, b.next);
  } else throw invalid('Unknown action.');
  return NextResponse.json({ ok: true }, { headers: noStore });
});
