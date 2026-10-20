import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { PageBanner } from '@/components/shop/PageBanner';
import { getStorefront, getMenuForStorefront, publicZones } from '@/server/storefront';
import { DEFAULT_STORY, CATEGORY_BLURBS, VALUES, PROCESS } from '@/lib/about-story';

const KICKER = 'text-[0.78rem] font-extrabold uppercase tracking-[0.14em] text-caramel';
const H2 = 'mb-[clamp(28px,4vw,48px)] mt-1.5 max-w-[24ch] text-[clamp(1.8rem,3.6vw,2.6rem)]';
const STORY_P = 'max-w-[62ch] text-[clamp(1.1rem,1.5vw,1.3rem)] leading-[1.7]';

// Grid placement of each "What we make" tile (position in the grid decides its size)
const BENTO_POS = [
  'col-[1/3] row-[1/3] max-[860px]:col-[1/-1] max-[860px]:row-auto max-[520px]:col-auto',
  '',
  '',
  'col-4 row-[1/3] max-[860px]:col-auto max-[860px]:row-auto',
  'col-[1/-1] max-[520px]:col-auto',
];

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
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-[clamp(28px,6vw,88px)] max-[860px]:grid-cols-1">
          <div>
            <h2 className="mb-5 mt-0 text-[clamp(2.4rem,4.5vw,3.6rem)] leading-[1.1]">Our story</h2>
            {r.about ? (
              r.about.split(/\n{2,}/).map((p, i) => <p key={i} className={STORY_P}>{p}</p>)
            ) : (
              DEFAULT_STORY.map((p, i) => <p key={i} className={STORY_P}>{p}</p>)
            )}
                        <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/menu" className="btn primary lg">
                See the menu
              </Link>
              <Link href="/help" className="btn lg">
                Contact us
              </Link>
            </div>
          </div>
          <div className="relative mt-[0.35em] aspect-[6/5] w-[88%] justify-self-end overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] shadow-[var(--shadow-2)] max-[860px]:mt-0 max-[860px]:aspect-[4/3] max-[860px]:w-full">
            <Image src="/brand/snack-box.jpg" alt="A snack box from the menu" fill sizes="(max-width: 860px) 100vw, 50vw" className="object-cover" />
          </div>
        </div>
      </section>

      <section className="section border-y border-[var(--border)] bg-ivory-2">
        <div className="wrap">
          <p className={KICKER}>What we stand for</p>
          <h2 className={H2}>The way we cook, and the way we serve</h2>
          <div className="mt-10 grid gap-6">
            {VALUES.map((v, i) => (
              <div key={v.title} className={`grid min-h-[clamp(280px,30vw,380px)] gap-6 max-[860px]:min-h-0 max-[860px]:grid-cols-1 ${i % 2 ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]' : 'grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]'}`}>
                <div className={`relative min-h-[240px] overflow-hidden rounded-2xl max-[860px]:aspect-[16/10] ${i % 2 ? 'order-2 max-[860px]:order-none' : ''}`}>
                  <Image src={VALUE_PHOTOS[i % VALUE_PHOTOS.length].src} alt={VALUE_PHOTOS[i % VALUE_PHOTOS.length].alt} fill sizes="(max-width: 860px) 100vw, 62vw" className="object-cover" />
                </div>
                <article className="flex flex-col justify-start rounded-2xl border border-[var(--border)] bg-white p-[clamp(24px,3vw,40px)] shadow-[var(--shadow-1,0_6px_22px_rgba(53,37,31,0.08))]">
                  <span className="font-[family-name:var(--font-display)] text-[2.2rem] leading-none text-[color:var(--caramel)]">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mb-3.5 mt-3 text-[clamp(1.3rem,1.8vw,1.6rem)]">{v.title}</h3>
                  <p className="m-0 text-[1.02rem] leading-[1.65] text-muted">{v.text}</p>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {cats.length > 0 && (
        <section className="section wrap">
          <p className={KICKER}>What we make</p>
          <h2 className={H2}>Something for every kind of hunger</h2>
          <div className="mt-10 grid grid-cols-4 gap-4 [grid-auto-rows:clamp(190px,19vw,270px)] max-[860px]:grid-cols-2 max-[860px]:[grid-auto-rows:220px] max-[520px]:grid-cols-1">
            {cats.map((c, ci) => {
              const photo = MAKE_PHOTOS[c.name.trim().toLowerCase()];
              return (
                <Link key={c.id} href={`/menu#cat-${c.id}`} className={`group relative isolate flex items-end overflow-hidden rounded-[20px] text-white no-underline ${photo ? 'bg-espresso' : 'bg-[linear-gradient(135deg,var(--caramel),var(--espresso))]'} ${BENTO_POS[ci] ?? 'max-[860px]:col-auto'}`}>
                  {photo && <Image src={photo} alt="" fill sizes="(max-width: 860px) 100vw, 50vw" className="z-[-2] object-cover transition-transform duration-500 ease-[ease] group-hover:scale-105" />}
                  <span className="absolute inset-0 z-[-1] bg-[linear-gradient(to_top,rgba(53,37,31,0.88),rgba(53,37,31,0.15)_70%)]" />
                  <span className="flex flex-col gap-1.5 p-[clamp(16px,2vw,26px)]">
                    <span className="text-[0.74rem] font-extrabold uppercase tracking-[0.12em] text-[#f0e8db]">
                      {c.count} {c.count === 1 ? 'dish' : 'dishes'}
                    </span>
                    <h3 className="m-0 text-[clamp(1.5rem,2.2vw,2.2rem)] text-white">{c.name}</h3>
                    <p className={`m-0 max-w-[44ch] text-[0.95rem] leading-[1.45] text-[#f0e8db] ${ci === 1 || ci === 2 ? 'hidden' : ''}`}>{CATEGORY_BLURBS[c.name.trim().toLowerCase()] ?? ''}</p>
                    <span className="mt-1.5 font-extrabold" aria-hidden="true">
                      View →
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="section">
        <div className="wrap">
          <p className={KICKER}>From our kitchen to your table</p>
          <h2 className={H2}>What happens after you order</h2>
          <ol className="m-0 mt-10 grid list-none grid-cols-2 gap-x-[clamp(32px,6vw,96px)] p-0 max-[700px]:grid-cols-1">
            {PROCESS.map((p, i) => (
              <li key={p.title} className="border-t border-espresso pb-14 pt-9 max-[700px]:pb-9 max-[700px]:pt-7">
                <span className="mb-9 block text-espresso max-[700px]:mb-[22px]" aria-hidden="true">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {PROC_ICONS[i % PROC_ICONS.length]}
                  </svg>
                </span>
                <h3 className="mb-3.5 mt-0 font-[family-name:var(--font-body)] text-[clamp(1.3rem,2vw,1.7rem)] font-bold">{p.title}</h3>
                <p className="m-0 max-w-[44ch] text-[clamp(1.02rem,1.4vw,1.2rem)] leading-[1.7]">{p.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section wrap" aria-labelledby="faq-title">
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] items-start gap-[clamp(32px,6vw,96px)] max-[860px]:grid-cols-1">
          <div>
            <p className={KICKER}>Questions</p>
            <h2 id="faq-title" className={H2}>Good to know</h2>
            <p className="muted">Can’t find your answer? We are happy to help.</p>
            <Link href="/help" className="group/link inline-flex items-center gap-2 border-b-2 border-transparent pb-0.5 font-extrabold text-espresso no-underline hover:border-[var(--caramel)]">
              Contact us <span aria-hidden="true" className="transition-transform duration-200 ease-[ease] group-hover/link:translate-x-1 motion-reduce:transition-none">→</span>
            </Link>
          </div>
          <div>
            {faqs.map((f) => (
              <details key={f.q} className="group border-b border-[var(--border)] py-1">
                <summary className="flex cursor-pointer list-none justify-between gap-4 py-[18px] text-[1.1rem] font-extrabold after:text-[1.4rem] after:leading-none after:text-caramel after:content-['+'] group-open:after:content-['–'] [&::-webkit-details-marker]:hidden">{f.q}</summary>
                <p className="m-0 mb-[18px] max-w-[62ch] leading-[1.65] text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-espresso py-[clamp(48px,7vw,88px)] text-[#e6ddcf]">
        <div className="wrap flex flex-wrap items-center justify-between gap-x-12 gap-y-6">
          <div>
            <h2 className="m-0 mb-2 text-[clamp(1.8rem,3.6vw,2.6rem)] text-white">Hungry? Let’s get you sorted.</h2>
            <p className="m-0">Good food. Good mood. Order for pickup or delivery in a few taps.</p>
          </div>
          <Link href="/menu" className="btn lg border-[var(--caramel)] bg-[var(--caramel)] text-espresso">
            See the menu <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
