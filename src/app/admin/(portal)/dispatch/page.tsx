import { requirePagePerm } from '@/server/auth/current';
import { getSettings } from '@/server/settings';
import { DispatchBoard } from '@/components/admin/DispatchBoard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dispatch' };

export default async function DispatchPage() {
  await requirePagePerm('dispatch.manage', '/admin/login');
  const tz = (await getSettings('restaurant')).timezone;
  return (
    <>
      <div className="admin-top">
        <h1>Dispatch</h1>
      </div>
      <DispatchBoard timezone={tz} />
    </>
  );
}
