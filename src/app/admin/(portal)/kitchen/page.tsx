import { requirePagePerm } from '@/server/auth/current';
import { getSettings } from '@/server/settings';
import { KitchenDisplay } from '@/components/kitchen/KitchenDisplay';
import Link from 'next/link';
import { C_ADMIN_TOP } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kitchen monitor' };

/** Read-only view of the live kitchen queue for the owner and managers. */
export default async function KitchenMonitor() {
  const user = await requirePagePerm('kitchen.monitor', '/admin/login');
  const tz = (await getSettings('restaurant')).timezone;
  return (
    <>
      <div className={`${C_ADMIN_TOP} admin-top`}>
        <h1>Kitchen monitor</h1>
        {user.permissions.has('kitchen.operate') && (
          <Link href="/kitchen" className="btn sm">
            Open kitchen display
          </Link>
        )}
      </div>
      <div className="[border-radius:18px] overflow-hidden [border:1px_solid_var(--line,_var(--border))]">
        <KitchenDisplay timezone={tz} userName={user.fullName} canMarkSoldOut={false} readOnly />
      </div>
    </>
  );
}
