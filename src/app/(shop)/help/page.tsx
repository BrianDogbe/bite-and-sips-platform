import type { Metadata } from 'next';
import { HelpForm } from '@/components/shop/HelpForm';
import { getStorefront } from '@/server/storefront';

export const metadata: Metadata = { title: 'Help' };
export const dynamic = 'force-dynamic';

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const [sf, sp] = await Promise.all([getStorefront(), searchParams]);
  const r = sf.restaurant;
  return (
    <div className="wrap section" style={{ maxWidth: 720 }}>
      <h1>Get help with an order</h1>
      <p className="muted">Tell us what went wrong and we’ll get back to you.{r.phone ? ` For urgent problems with an order in progress, call ${r.phone}.` : ''}</p>
      <HelpForm trackingToken={sp.t ?? null} />
    </div>
  );
}
