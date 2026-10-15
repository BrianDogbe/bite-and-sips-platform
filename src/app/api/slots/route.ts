import { NextResponse } from '@/server/response';
import { handler, noStore } from '@/server/http';
import { availableSlots, loadSchedule, hoursSummary } from '@/server/scheduling';
import { getAllSettings } from '@/server/settings';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const kind = url.searchParams.get('type') === 'delivery' ? 'delivery' : 'pickup';
  const prep = Math.min(240, Math.max(0, Number(url.searchParams.get('prep')) || 0));
  const { ordering, restaurant } = await getAllSettings();
  const slots = await availableSlots({ tz: restaurant.timezone, kind, prepMinutes: prep, settings: ordering });
  const sched = await loadSchedule();
  const summary = hoursSummary(sched, restaurant.timezone);
  return NextResponse.json(
    {
      timezone: restaurant.timezone,
      acceptingOrders: ordering.acceptingOrders,
      pauseMessage: ordering.acceptingOrders ? null : ordering.pauseMessage,
      openNow: summary.openNow,
      slots: slots.slice(0, 200),
    },
    { headers: noStore },
  );
});
