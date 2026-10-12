import type { Metadata } from 'next';
import { getStorefront } from '@/server/storefront';

export const metadata: Metadata = { title: 'Terms, privacy and refunds' };
export const dynamic = 'force-dynamic';

/**
 * Plain-language policy page built from the restaurant's settings. These texts are starting points —
 * the owner must review them (ideally with a lawyer) against Ghana's Data Protection Act, 2012 (Act 843)
 * before launch. See docs/OWNER-CHECKLIST.md.
 */
export default async function Policies() {
  const sf = await getStorefront();
  const r = sf.restaurant;
  return (
    <div className="wrap section" style={{ maxWidth: 760 }}>
      <h1>Terms, privacy and refunds</h1>
      {!r.isConfigured && <p className="alert warn">These policies are placeholders and have not yet been reviewed by the restaurant.</p>}
      <h2>Ordering</h2>
      <p>Prices are shown in Ghana cedis and are confirmed by our system when you place your order. An order is confirmed once payment is verified by our payment provider, or immediately for cash orders where cash payment is offered.</p>
      <h2>Cancellations</h2>
      <p>{sf.ordering.cancellationPolicy}</p>
      <h2>Refunds</h2>
      <p>{sf.ordering.refundPolicy}</p>
      <h2>Privacy</h2>
      <p>
        We collect your name, phone number, optional email and, for deliveries, your address and the location you choose to share. We use them only to prepare, deliver and support your order and, if you opt in, to send you updates. Card and Mobile Money details are handled by our payment provider; we never see or store your card number or PIN.
      </p>
      <p>
        Our riders share their location only while carrying an active delivery, so you can follow your order. Rider location history is deleted automatically after a limited period. Contact {r.email || 'us'} to ask what data we hold about you or to have it corrected or deleted.
      </p>
      <h2>Contact</h2>
      <p>
        {r.name}
        {r.addressLine ? `, ${r.addressLine}` : ''}
        {r.phone ? `. Phone ${r.phone}` : ''}
        {r.email ? `. Email ${r.email}` : ''}.
      </p>
    </div>
  );
}
