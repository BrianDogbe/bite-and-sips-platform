import { requirePagePerm } from '@/server/auth/current';
import { getSettings } from '@/server/settings';
import { KitchenDisplay } from '@/components/kitchen/KitchenDisplay';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kitchen monitor' };

/** Read-only view of the live kitchen queue for the owner and managers. */
export default async function KitchenMonitor() {
  const user = await requirePagePerm('kitchen.monitor', '/admin/login');
  const tz = (await getSettings('restaurant')).timezone;
  return (
    <>
      <div className="admin-top">
        <h1>Kitchen monitor</h1>
        {user.permissions.has('kitchen.operate') && (
          <Link href="/kitchen" className="btn sm">
            Open kitchen display
          </Link>
        )}
      </div>
      <div className="monitor-wrap">
        <KitchenDisplay timezone={tz} userName={user.fullName} canMarkSoldOut={false} readOnly />
      </div>
    </>
  );
}
