import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getStorefront, getMenuForStorefront, publicZones } from '@/server/storefront';
import { DEFAULT_STORY, CATEGORY_BLURBS, VALUES, PROCESS } from '@/lib/about-story';

export const metadata: Metadata = { title: 'About us' };
export const dynamic = 'force-dynamic';

export default async function AboutPage() {
  const [sf, menu, zones] = await Promise.all([getStorefront(), getMenuForStorefront(), publicZones()]);
  const r = sf.restaurant;
  const o = sf.ordering;
  const cats = menu.categories
    .map((c) => ({ ...c, count: menu.items.filter((i) => i.categoryId === c.id).length }))
    .filter((c) => c.count > 0);
  const pay = [o.onlinePayments ? 'Mobile Money or card through our payment provider' : '', o.cashOnPickup || o.cashOnDelivery ? 'cash where it is shown at checkout' : ''].filter(Boolean).join(', and ');
  const faqs = [
    { q: 'Do I need an account to order?', a: 'No. You can order as a guest. An account just keeps your past orders and details in one place.' },
    { q: 'How do I pay?', a: pay ? `You can pay with ${pay}. Your total, including any delivery fee, is shown before you pay.` : 'Payment options are shown at checkout, along with your total.' },
    { q: 'How does pickup work?', a: `${o.pickupEnabled ? `Choose a pickup time at checkout, then come to ${r.addressLine ? [r.addressLine, r.city].filter(Boolean).join(', ') : 'the restaurant'} and show your order number at the counter.` : 'Pickup is not available at the moment.'}` },
    { q: 'Where do you deliver, and what does it cost?', a: o.deliveryEnabled ? (zones.length ? `We deliver to ${zones.map((z) => z.name).join(', ')}. The fee depends on where you are and is confirmed at checkout once we know your location.` : 'Delivery areas will be published soon.') : 'Delivery is not available at the moment.' },
    { q: 'Can I order for later?', a: 'Yes. Even when we are closed you can schedule an order for a later time at checkout.' },
    { q: 'What if I have an allergy?', a: 'Please tell us before you order. Use the help page or call us, and we will tell you what is in each dish. Do not rely on the website alone if an allergy could be serious.' },
    { q: 'Something is wrong with my order. What do I do?', a: 'Open the help page with your order number and tell us what happened. We will sort it out.' },
  ];

  return (
    <>
      <section className="about-hero">
        <div className="wrap">
          <p className="hero-eyebrow">About us</p>
          <h1>
            {r.name}
            <br />
            <em>Good food. Good mood.</em>
          </h1>
        </div>
      </section>

      <section className="section wrap">
        <div className="about-grid">
          <div className="about-story">
            <h2>Our story</h2>
            {r.about ? (
              r.about.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)
            ) : (
              DEFAULT_STORY.map((p, i) => <p key={i}>{p}</p>)
            )}
                        <div className="hero-cta">
              <Link href="/menu" className="btn primary lg">
                See the menu
              </Link>
              <Link href="/help" className="btn lg">
                Contact us
              </Link>
            </div>
          </div>
          <div className="about-photo">
            <Image src="/brand/snack-box.jpg" alt="A snack box from the menu" fill sizes="(max-width: 860px) 100vw, 480px" />
          </div>
        </div>
      </section>

      <section className="section about-values">
        <div className="wrap">
          <p className="info-kicker">What we stand for</p>
          <h2>The way we cook, and the way we serve</h2>
          <div className="values-grid">
            {VALUES.map((v, i) => (
              <article key={v.title} className="value-card">
                <span className="value-num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{v.title}</h3>
                <p>{v.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {cats.length > 0 && (
        <section className="section wrap">
          <p className="info-kicker">What we make</p>
          <h2>Something for every kind of hunger</h2>
          <div className="make-grid">
            {cats.map((c) => (
              <Link key={c.id} href={`/menu#cat-${c.id}`} className="make-card">
                <div>
                  <h3>{c.name}</h3>
                  <p>{CATEGORY_BLURBS[c.name.trim().toLowerCase()] ?? ''}</p>
                </div>
                <span className="make-foot">
                  <small>
                    {c.count} {c.count === 1 ? 'dish' : 'dishes'}
                  </small>
                  <span aria-hidden="true">→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section about-process">
        <div className="wrap">
          <p className="info-kicker">From our kitchen to your table</p>
          <h2>What happens after you order</h2>
          <ol className="process-list">
            {PROCESS.map((p, i) => (
              <li key={p.title}>
                <span className="process-dot">{i + 1}</span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section wrap faq-section" aria-labelledby="faq-title">
        <div className="faq-grid">
          <div>
            <p className="info-kicker">Questions</p>
            <h2 id="faq-title">Good to know</h2>
            <p className="muted">Can’t find your answer? We are happy to help.</p>
            <Link href="/help" className="text-link">
              Contact us <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="faq-list">
            {faqs.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="about-cta">
        <div className="wrap about-cta-in">
          <div>
            <h2>Hungry? Let’s get you sorted.</h2>
            <p>Good food. Good mood. Order for pickup or delivery in a few taps.</p>
          </div>
          <Link href="/menu" className="btn lg">
            See the menu <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
