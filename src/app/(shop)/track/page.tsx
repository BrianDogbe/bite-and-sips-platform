import type { Metadata } from 'next';
import { TrackLookup } from '@/components/shop/TrackLookup';
import { getCurrentUser } from '@/server/auth/current';
import Link from 'next/link';
import { BackLink } from '@/components/shop/BackLink';

export const metadata: Metadata = { title: 'Track an order' };
export const dynamic = 'force-dynamic';

export default async function TrackLookupPage() {
  const user = await getCurrentUser();
  return (
    <div className="wrap section" style={{ maxWidth: 560 }}>
      <BackLink href="/menu" label="Back to menu" />
      <h1>Track an order</h1>
      <p className="muted">Use the link we gave you after ordering, or enter your order number and the phone number you ordered with.</p>
      <TrackLookup />
      {user?.roles.includes('customer') ? (
        <p style={{ marginTop: 20 }}>
          <Link href="/account">See all your orders</Link>
        </p>
      ) : null}
    </div>
  );
}
