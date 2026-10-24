import type { Metadata } from 'next';
import { HelpForm } from '@/components/shop/HelpForm';
import { getStorefront } from '@/server/storefront';
import { supportPrefill } from '@/server/orders/queries';
import { BackLink } from '@/components/shop/BackLink';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = { title: 'Help' };
export const dynamic = 'force-dynamic';

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const [sf, sp] = await Promise.all([getStorefront(), searchParams]);
  const r = sf.restaurant;
  const prefill = sp.t ? await supportPrefill(sp.t) : null;
  return (
    <div className="wrap section" style={{ maxWidth: 720 }}>
      <BackLink href="/menu" label="Back to menu" />
      <h1>Get help with an order</h1>
      <p className="muted">Tell us what went wrong and we’ll call you back.{r.phone ? ' For urgent problems with an order in progress, call us now.' : ''}</p>
      {r.phone && (
        <p>
          <a className="btn whitespace-normal py-2.5 text-center leading-[1.3]" href={`tel:${r.phone.replace(/\s/g, '')}`}>
            <Icon name="phone" size={18} className="flex-none" /> Call {r.name} on {r.phone}
          </a>
        </p>
      )}
      <HelpForm trackingToken={sp.t ?? null} prefill={prefill} openNow={sf.openNow} />
    </div>
  );
}
