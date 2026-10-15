import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { PageBanner } from '@/components/shop/PageBanner';
import { getStorefront, getMenuForStorefront, publicZones } from '@/server/storefront';
import { DEFAULT_STORY, CATEGORY_BLURBS, VALUES, PROCESS } from '@/lib/about-story';

const VALUE_PHOTOS = [
  { src: '/brand/crunchy-salad.jpg', alt: 'A fresh salad with grilled chicken and a boiled egg' },
  { src: '/brand/tuna-sandwich.jpg', alt: 'A creamy tuna sandwich' },
  { src: '/brand/snack-box.jpg', alt: 'A snack box from the menu' },
  { src: '/brand/cat-drinks.jpg', alt: 'Chilled milk drinks' },
];

const MAKE_PHOTOS: Record<string, string> = {
  sandwiches: '/brand/tuna-sandwich.jpg',
  salads: '/brand/crunchy-salad.jpg',
  combo: '/brand/snack-box.jpg',
  drinks: '/brand/cat-drinks.jpg',
};

const PROC_ICONS = [
  <path key="a" d="M4 4h16v12h-5l-1.5 3h-3L9 16H4zM4 12h4.5l1 2h5l1-2H20" />,
  <path key="b" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-4-9 3 3 5-6" />,
  <path key="c" d="M5 11h14v2a7 7 0 0 1-14 0zM3 11h18M9 7c0-1.5 1.5-1.5 1.5-3M14 7c0-1.5 1.5-1.5 1.5-3" />,
  <path key="d" d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19.2a1.7 1.7 0 1 0 0-.1zM17 19.2a1.7 1.7 0 1 0 0-.1z" />,
];

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
      <PageBanner eyebrow={r.name} title="About us" sub="Fresh food, made with care, for pickup or delivery." />

      <section className="section wrap max-w-none px-[clamp(20px,5vw,80px)] pt-[clamp(72px,10vw,140px)]">
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
            <Image src="/brand/snack-box.jpg" alt="A snack box from the menu" fill sizes="(max-width: 860px) 100vw, 50vw" />
          </div>
        </div>
      </section>

      <section className="section about-values">
        <div className="wrap">
          <p className="info-kicker">What we stand for</p>
          <h2>The way we cook, and the way we serve</h2>
          <div className="values-board">
            {VALUES.map((v, i) => (
              <div key={v.title} className={`values-row${i % 2 ? ' flip' : ''}`}>
                <div className="values-photo">
                  <Image src={VALUE_PHOTOS[i % VALUE_PHOTOS.length].src} alt={VALUE_PHOTOS[i % VALUE_PHOTOS.length].alt} fill sizes="(max-width: 860px) 100vw, 62vw" />
                </div>
                <article className="value-card">
                  <span className="value-num">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{v.title}</h3>
                  <p>{v.text}</p>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {cats.length > 0 && (
        <section className="section wrap">
          <p className="info-kicker">What we make</p>
          <h2>Something for every kind of hunger</h2>
          <div className="bento">
            {cats.map((c) => {
              const photo = MAKE_PHOTOS[c.name.trim().toLowerCase()];
              return (
                <Link key={c.id} href={`/menu#cat-${c.id}`} className={`bento-tile${photo ? '' : ' plain'}`}>
                  {photo && <Image src={photo} alt="" fill sizes="(max-width: 860px) 100vw, 50vw" className="bento-img" />}
                  <span className="bento-shade" />
                  <span className="bento-body">
                    <span className="bento-count">
                      {c.count} {c.count === 1 ? 'dish' : 'dishes'}
                    </span>
                    <h3>{c.name}</h3>
                    <p>{CATEGORY_BLURBS[c.name.trim().toLowerCase()] ?? ''}</p>
                    <span className="bento-go" aria-hidden="true">
                      View →
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="section about-process">
        <div className="wrap">
          <p className="info-kicker">From our kitchen to your table</p>
          <h2>What happens after you order</h2>
          <ol className="proc-grid">
            {PROCESS.map((p, i) => (
              <li key={p.title}>
                <span className="proc-ico" aria-hidden="true">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {PROC_ICONS[i % PROC_ICONS.length]}
                  </svg>
                </span>
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
