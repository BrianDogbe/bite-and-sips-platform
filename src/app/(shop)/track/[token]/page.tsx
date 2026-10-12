import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { trackingView } from '@/server/orders/queries';
import { TrackOrder } from '@/components/shop/TrackOrder';
import { isDomainError } from '@/server/errors';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Track your order', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function TrackPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ from?: string; pay?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  let view;
  try {
    view = await trackingView(token);
  } catch (e) {
    if (isDomainError(e) && e.status === 404) notFound();
    throw e;
  }
  // Serialise dates for the client component
  return <TrackOrder token={token} initial={JSON.parse(JSON.stringify(view))} fromPayment={sp.from === 'payment'} retryPay={sp.pay === 'retry'} />;
}
