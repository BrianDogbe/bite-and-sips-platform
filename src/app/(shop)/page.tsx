import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { getStorefront, getMenuForStorefront, publicZones } from '@/server/storefront';
import { summarizeHours } from '@/components/shop/HoursList';
import { DEFAULT_STORY } from '@/lib/about-story';
import { formatGHS } from '@/lib/money';
import { formatLocalDateTime } from '@/lib/time';
import { StepTile } from '@/components/shop/StepTile';
import { StoryPlayer } from '@/components/shop/StoryPlayer';
import type { ClientMenuItem } from '@/components/shop/types';

export const dynamic = 'force-dynamic';

const KICKER = 'text-[0.78rem] font-extrabold uppercase tracking-[0.14em] text-caramel';
const VISIT_ICO = 'grid size-10 flex-none place-items-center rounded-full bg-[var(--caramel)] text-espresso';

function StepCard({ n, title, href, footer, highlight, children }: { n: number; title: string; href: string; footer: string; highlight: boolean; children: React.ReactNode }) {
  return (
    <article className={`group flex flex-col px-7 pb-6 pt-7 text-ivory transition-colors duration-[250ms] motion-reduce:transition-none ${highlight ? 'bg-sage' : 'bg-espresso hover:bg-sage'}`}>
      <div className="mb-7 flex items-center justify-between">
        <span className={`text-[0.8rem] font-extrabold uppercase tracking-[0.16em] ${highlight ? 'text-ivory' : 'text-[#d9cfc0] group-hover:text-ivory'}`}>Step {String(n).padStart(2, '0')}</span>
        <span className="flex gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((d) => (
            <i key={d} className={`block h-0.5 w-4 ${d <= n ? 'bg-[var(--caramel)]' : 'bg-[rgba(247,242,233,0.3)]'}`} />
          ))}
        </span>
      </div>
      <h3 className="mb-3 mt-0 font-[family-name:var(--font-display)] text-[1.6rem] font-normal leading-[1.15] text-white">{title}</h3>
      <p className={`m-0 mb-5 text-[0.98rem] leading-[1.55] ${highlight ? 'text-ivory' : 'text-[#e6ddcf] group-hover:text-ivory'}`}>{children}</p>
      <Link href={href} className="mt-auto flex items-center justify-between border-t border-[rgba(247,242,233,0.2)] pt-4 text-[0.8rem] font-extrabold uppercase tracking-[0.14em] text-white no-underline">
        <span>{footer}</span>
        <span className="grid size-10 place-items-center rounded-full border border-[rgba(247,242,233,0.6)] text-[1.1rem] tracking-normal transition-[background-color,color] duration-200 group-hover:border-[var(--caramel)] group-hover:bg-[var(--caramel)] group-hover:text-espresso motion-reduce:transition-none" aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export default async function Home() {
  const [sf, menu, zones, hdrs] = await Promise.all([
    getStorefront(),
    getMenuForStorefront(),
    publicZones(),
    headers(),
  ]);
  const r = sf.restaurant;
  const tz = r.timezone;
  const items = menu.items as unknown as ClientMenuItem[];
  const CATEGORY_PHOTOS: Record<string, string> = {
    sandwiches: '/brand/tuna-sandwich.jpg',
    salads: '/brand/crunchy-salad.jpg',
    combo: '/brand/snack-box.jpg',
    drinks: '/brand/cat-drinks.jpg',
  };
  const BLURBS: Record<string, string> = {
    shawarma: 'Grilled wraps packed with seasoned meat, fresh vegetables and our signature sauce.',
    sandwiches: 'Made-to-order sandwiches on soft or toasted bread, with extras to build your own.',
    salads: 'Crisp, colourful salads with grilled chicken, boiled egg and a pot of signature sauce.',
    'salads & wraps': 'Crisp salads and grilled wraps, made fresh to order.',
    combo: 'A meal and a drink together, plus boxes made for sharing or a long meeting.',
    boxes: 'Boxes made for sharing or a long meeting.',
    'combo packages': 'A meal and a drink together, ready in one go.',
    drinks: 'Chilled milk drinks in regular and large, in strawberry and chocolate.',
    sips: 'Chilled milk drinks in regular and large.',
  };
  const groups = menu.categories
    .map((c) => {
      const inCat = items.filter((i) => i.categoryId === c.id && i.orderable);
      return {
        id: c.id,
        name: c.name,
        count: inCat.length,
        details: inCat.map((i) => i.name).join(' · '),
        blurb: BLURBS[c.name.trim().toLowerCase()] ?? '',
        image: CATEGORY_PHOTOS[c.name.trim().toLowerCase()] ?? inCat.find((i) => i.imageUrl)?.imageUrl ?? null,
      };
    })
    .filter((g) => g.count > 0);
  const aboutText = (r.about ? r.about.split(/\n{2,}/)[0] : DEFAULT_STORY[0]).trim();
  const aboutSentences = aboutText.split(/(?<=\.)\s+/);
  const aboutTeaser = aboutSentences[0].length > 200 ? `${aboutSentences[0].slice(0, 200).replace(/\s+\S*$/, '')}…` : aboutSentences.slice(0, 2).join(' ').length <= 240 ? aboutSentences.slice(0, 2).join(' ') : aboutSentences[0];
  const now = new Date();
  const activeClosure = sf.closures.find((c) => new Date(c.startsAt) <= now);
  const upcomingClosure = sf.closures.find((c) => new Date(c.startsAt) > now);

  const saveData = hdrs.get('save-data')?.toLowerCase() === 'on';
  const tagline = (r.tagline || 'Good food. Good mood.').split(/(?<=[.!])\s+/).map((s) => s.replace(/[.!]$/, '')).filter(Boolean);
  const marqueeWords = [...tagline, ...groups.map((g) => g.name)];

  return (
    <>
      <section className="relative flex min-h-svh items-center overflow-hidden border-b border-[var(--border)] bg-[#f3e9d9] text-espresso max-[860px]:flex-col max-[860px]:items-stretch [@media(max-height:480px)_and_(orientation:landscape)]:py-4" aria-labelledby="hero-title">
        <Image src="/brand/hero-bg.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[right_center] max-[860px]:relative! max-[860px]:order-2 max-[860px]:block max-[860px]:h-auto! max-[860px]:min-h-60 max-[860px]:flex-1 max-[860px]:object-[78%_center]" />
        <div className="relative block w-full max-w-none px-[clamp(20px,5vw,80px)] pb-[clamp(40px,6vw,80px)] pt-24 max-[860px]:pb-6 max-[860px]:pt-[92px]">
          <div className="max-w-[min(40%,540px)] text-left max-[860px]:max-w-none">
            <h1 id="hero-title" className="mb-[0.35em] text-[length:clamp(2.8rem,6.2vw,5.6rem)] font-normal leading-[0.98] tracking-[-0.015em] text-espresso [-webkit-text-stroke:0.6px_var(--espresso)] min-[861px]:text-[length:clamp(2.8rem,5.2vw,5rem)]">
              Every Bite,
              <br />
              Pure Delight
            </h1>
            <p className="m-0 mb-6 max-w-[36ch] text-[length:clamp(1.05rem,1.8vw,1.25rem)] text-[var(--charcoal)] min-[861px]:max-w-[30ch]">{`Freshly made sandwiches, salads, wraps and sips from ${r.name}. Order for pickup or have it delivered.`}</p>
            {(activeClosure || !sf.ordering.acceptingOrders || !sf.openNow) && (
              <p className="alert warn m-0 mb-4 max-w-[460px]" role="status">
                {activeClosure
                  ? `Temporarily closed${activeClosure.reason ? `: ${activeClosure.reason}` : ''}`
                  : !sf.ordering.acceptingOrders
                    ? sf.ordering.pauseMessage
                    : 'We’re closed right now. You can still schedule an order for later at checkout.'}
              </p>
            )}
            <div className="mb-[clamp(28px,5vw,56px)] mt-2 flex flex-wrap gap-3">
              <Link href="/menu" className="btn primary lg">
                Order now <span aria-hidden="true">→</span>
              </Link>
              <Link href="/about" className="btn lg">
                About us
              </Link>
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-x-0 gap-y-[18px] p-0 text-sage max-[600px]:flex-col max-[600px]:gap-y-3.5">
              <li className="flex items-center gap-2.5 border-r border-[var(--espresso-2)] pr-[22px] mr-[22px] last:mr-0 last:border-r-0 last:pr-0 max-[860px]:mr-3.5 max-[860px]:pr-3.5 max-[600px]:border-r-0 max-[600px]:pr-0">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 19c0-8 5-14 15-14 0 9-5 15-13 15" />
                  <path d="M5 19c3-5 6-8 10-10" />
                </svg>
                <span className="grid leading-[1.25] text-espresso">
                  <strong className="text-[0.9rem]">Fresh ingredients</strong>
                  <small className="text-[0.78rem] text-muted">Always</small>
                </span>
              </li>
              <li className="flex items-center gap-2.5 border-r border-[var(--espresso-2)] pr-[22px] mr-[22px] last:mr-0 last:border-r-0 last:pr-0 max-[860px]:mr-3.5 max-[860px]:pr-3.5 max-[600px]:border-r-0 max-[600px]:pr-0">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 10h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4Z" />
                  <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
                  <path d="M8 3c-1 1.5 1 2.5 0 4M12 3c-1 1.5 1 2.5 0 4" />
                </svg>
                <span className="grid leading-[1.25] text-espresso">
                  <strong className="text-[0.9rem]">Great taste</strong>
                  <small className="text-[0.78rem] text-muted">Every time</small>
                </span>
              </li>
              <li className="flex items-center gap-2.5 border-r border-[var(--espresso-2)] pr-[22px] mr-[22px] last:mr-0 last:border-r-0 last:pr-0 max-[860px]:mr-3.5 max-[860px]:pr-3.5 max-[600px]:border-r-0 max-[600px]:pr-0">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 6h11v10H2zM13 9h4l3 3v4h-7" />
                  <circle cx="6.5" cy="17.5" r="1.8" />
                  <circle cx="16.5" cy="17.5" r="1.8" />
                </svg>
                <span className="grid leading-[1.25] text-espresso">
                  <strong className="text-[0.9rem]">Fast &amp; reliable</strong>
                  <small className="text-[0.78rem] text-muted">Delivery &amp; pickup</small>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div className="group flex select-none overflow-hidden bg-[var(--caramel)] py-4 text-espresso" aria-hidden="true">
        {[0, 1].map((n) => (
          <div className="flex min-w-full shrink-0 animate-marquee justify-around [animation-duration:48s] group-hover:[animation-play-state:paused] motion-reduce:animate-none" key={n}>
            {marqueeWords.map((t) => (
              <span key={t} className="inline-flex items-center whitespace-nowrap px-6 font-[family-name:var(--font-display)] text-[length:clamp(1.3rem,2.4vw,1.85rem)] after:ml-12 after:size-1.5 after:rounded-full after:bg-espresso after:content-['']">
                {t}
              </span>
            ))}
          </div>
        ))}
      </div>

      {upcomingClosure && (
        <div className="mx-auto mt-5 w-full max-w-[var(--maxw)] px-[var(--gutter)]">
          <p className="alert info">
            Heads up: {upcomingClosure.scope === 'all' ? 'we’re closed' : `${upcomingClosure.scope} is unavailable`} from {formatLocalDateTime(upcomingClosure.startsAt, tz)} to{' '}
            {formatLocalDateTime(upcomingClosure.endsAt, tz)} ({upcomingClosure.reason}).
          </p>
        </div>
      )}

      <section className="mx-auto w-full max-w-[var(--maxw)] px-[var(--gutter)] pb-[clamp(72px,10vw,144px)] pt-[clamp(88px,12vw,160px)] min-[1001px]:max-w-none min-[1001px]:px-[clamp(20px,5vw,80px)]" aria-labelledby="featured-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="featured-title" className="mb-1 mt-0 text-[length:clamp(1.7rem,3.4vw,2.4rem)] after:mt-2.5 after:block after:h-[3px] after:w-11 after:rounded-sm after:bg-[var(--caramel)] after:content-['']">From the kitchen</h2>
            <p className="m-0 max-w-[52ch] text-muted">Pick a category to start with. The full menu has everything.</p>
          </div>
          <Link href="/menu" className="group/link inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent pb-0.5 font-extrabold text-espresso no-underline hover:border-[var(--caramel)]">
            See the full menu <span aria-hidden="true" className="transition-transform duration-200 group-hover/link:translate-x-1 motion-reduce:transition-none">→</span>
          </Link>
        </div>
        {groups.length ? (
          <div className="flex flex-wrap justify-center gap-6 min-[1001px]:flex-nowrap min-[1001px]:justify-stretch min-[1001px]:gap-5">
            {groups.map((g) => (
              <Link key={g.id} href={`/menu#cat-${g.id}`} className="group flex flex-[0_0_calc((100%-48px)/3)] flex-col overflow-hidden rounded-[18px] border border-[rgba(53,37,31,0.25)] bg-[var(--caramel)] text-espresso no-underline max-[1000px]:basis-[calc((100%-24px)/2)] max-[640px]:basis-full min-[1001px]:min-w-0 min-[1001px]:flex-1">
                <div className="relative aspect-[3/2] bg-ivory-2">
                  {g.image ? (
                    <Image src={g.image} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1100px) 33vw, 230px" className="object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_30%_30%,var(--espresso-2),var(--espresso))] font-[family-name:var(--font-display)] text-[4rem] text-[var(--caramel)]" aria-hidden="true">
                      {g.name.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 px-5 pb-4 pt-[18px]">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-[family-name:var(--font-display)] text-[1.6rem] leading-[1.1] text-espresso">{g.name}</span>
                    <span className="flex-none text-[0.9rem] font-bold tabular-nums text-espresso">
                      {g.count} {g.count === 1 ? 'item' : 'items'}
                    </span>
                  </span>
                  {g.blurb && <span className="line-clamp-2 min-h-[2.8em] text-[0.95rem] leading-[1.4] text-espresso">{g.blurb}</span>}
                  <span className="mt-auto flex items-center justify-between border-t border-[rgba(53,37,31,0.25)] pt-3 text-[1.02rem] font-extrabold text-espresso">
                    <span>See {g.name.toLowerCase()}</span>
                    <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-espresso text-ivory transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none">→</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty panel">
            <h3>The menu is coming soon</h3>
            <p>We haven’t published any dishes yet.</p>
          </div>
        )}
      </section>

      {!saveData && <StoryPlayer src="/brand/story.mp4" poster="/brand/hero-bg.jpg" title="Good food. Good mood." subtitle="Made fresh, ready for pickup or on its way to you." />}

      <section className="border-y border-[var(--border)] bg-ivory-2 py-[clamp(72px,10vw,144px)]" aria-labelledby="how-title">
        <div className="mx-auto w-full max-w-[var(--maxw)] px-[var(--gutter)]">
          <h2 id="how-title" className="mb-6">How ordering works</h2>
          <div className="grid auto-rows-[minmax(300px,auto)] grid-cols-4 gap-px overflow-hidden rounded-[var(--r-lg)] border border-[rgba(53,37,31,0.5)] bg-[rgba(255,255,255,0.16)] max-[1000px]:grid-cols-2 max-[640px]:grid-cols-1">
            <StepCard n={1} title="Pick your food" href="/menu" footer="No account needed" highlight={false}>
              Choose sizes, sides and extras. You don’t need an account.
            </StepCard>
            <StepTile label="Photos of our sandwiches and salads" images={[{ src: '/brand/tuna-sandwich.jpg', alt: 'Cut tuna and egg sandwiches in a kraft box' }, { src: '/brand/crunchy-salad.jpg', alt: 'Salad with egg and grilled chicken' }]} />
            <StepCard n={2} title="Choose pickup or delivery" href="/about" footer="Pickup or delivery" highlight={false}>
              Pick a pickup time, or share your location so we can confirm we deliver to you.
            </StepCard>
            <StepTile label="Photos of a snack box and our drinks" images={[{ src: '/brand/snack-box.jpg', alt: 'Snack box with sandwiches, fruit and a drink' }, { src: '/brand/cat-drinks.jpg', alt: 'A Bite & Sips cup and smoothie' }]} />
            <StepTile label="Photos of our table" images={[{ src: '/brand/cat-drinks.jpg', alt: 'A Bite & Sips cup and smoothie' }, { src: '/brand/tuna-sandwich.jpg', alt: 'Cut tuna and egg sandwiches in a kraft box' }]} />
            <StepCard n={3} title="Pay securely" href="/policies" footer="Secure payment" highlight>
              {sf.ordering.onlinePayments ? 'Mobile Money or card through our payment provider.' : ''}{sf.ordering.cashOnPickup || sf.ordering.cashOnDelivery ? ' Cash is accepted where shown at checkout.' : ''}
            </StepCard>
            <StepTile label="More photos of our food" images={[{ src: '/brand/crunchy-salad.jpg', alt: 'Salad with egg and grilled chicken' }, { src: '/brand/snack-box.jpg', alt: 'Snack box with sandwiches, fruit and a drink' }]} />
            <StepCard n={4} title="Track it live" href="/track" footer="Live tracking" highlight={false}>
              Your tracking page updates as the kitchen cooks and your food heads out.
            </StepCard>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[var(--maxw)] px-[var(--gutter)] py-[clamp(72px,10vw,144px)]" aria-labelledby="delivery-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="delivery-title" className="mb-1 mt-0 text-[length:clamp(1.7rem,3.4vw,2.4rem)] after:mt-2.5 after:block after:h-[3px] after:w-11 after:rounded-sm after:bg-[var(--caramel)] after:content-['']">Visit us or get it delivered</h2>
            <p className="m-0 max-w-[52ch] text-muted">Collect your order at the counter, or have it brought to your door.</p>
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-stretch gap-6 max-[900px]:grid-cols-1">
          {sf.ordering.pickupEnabled && (
            <article className="flex flex-col gap-5 rounded-[20px] bg-espresso p-[clamp(24px,3vw,36px)] text-[#e6ddcf]">
              <span className={`${KICKER} !text-[var(--caramel)]`}>Pickup</span>
              <ul className="m-0 grid list-none gap-[22px] p-0">
                <li className="flex items-start gap-4">
                  <span className={VISIT_ICO} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg></span>
                  <div>
                    <strong className="block text-[1.1rem] text-white">{r.addressLine ? [r.addressLine, r.city].filter(Boolean).join(', ') : 'Address to be announced'}</strong>
                    {r.pickupInstructions && <small className="mt-0.5 block text-[0.95rem] text-[#d9cfc0]">{r.pickupInstructions}</small>}
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <span className={VISIT_ICO} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
                  <div>
                    <strong className="block text-[1.1rem] text-white">Opening hours</strong>
                    <dl className="m-0 mt-1.5 grid gap-1">
                      {summarizeHours(sf.hours).map((g) => (
                        <div key={g.days} className="flex gap-4">
                          <dt className="min-w-[78px] text-[#d9cfc0]">{g.days}</dt>
                          <dd className="m-0 tabular-nums text-white">{g.time}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </li>
                {r.phone && (
                  <li className="flex items-start gap-4">
                    <span className={VISIT_ICO} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1Z" /></svg></span>
                    <div>
                      <strong className="block text-[1.1rem] text-white">Call us</strong>
                      <small className="mt-0.5 block text-[0.95rem] text-[#d9cfc0]">
                        <a className="inline-flex min-h-11 items-center text-white" href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a>
                      </small>
                    </div>
                  </li>
                )}
              </ul>
              <Link href="/menu" className="btn lg mt-auto self-start border-[var(--caramel)] bg-[var(--caramel)] text-espresso">
                Order for pickup <span aria-hidden="true">→</span>
              </Link>
            </article>
          )}

          <article className="flex flex-col gap-5 rounded-[20px] bg-white p-[clamp(24px,3vw,36px)]">
            <span className={KICKER}>Delivery</span>
            {sf.ordering.deliveryEnabled ? (
              zones.length ? (
                <>
                  <h3 className="m-0 text-[1.6rem]">We deliver to</h3>
                  <ul className="m-0 grid list-none gap-2.5 p-0">
                    {zones.map((z) => (
                      <li key={z.id} className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-2.5 last:border-b-0">
                        <span>{z.name}</span>
                        <span className="grid text-right font-extrabold tabular-nums">
                          {z.perKmPesewas ? `from ${formatGHS(z.feePesewas)} + ${formatGHS(z.perKmPesewas)}/km` : formatGHS(z.feePesewas)}
                          <small className="font-medium text-muted">{z.minOrderPesewas ? `min. ${formatGHS(z.minOrderPesewas)}` : 'no minimum'}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="muted small m-0">The delivery fee depends on how far you are from us — it’s confirmed at checkout once we know where you are.</p>
                </>
              ) : (
                <>
                  <h3 className="m-0 text-[1.6rem]">Delivery areas coming soon</h3>
                  <p className="m-0">We will publish our delivery areas here.</p>
                </>
              )
            ) : (
              <>
                <h3 className="m-0 text-[1.6rem]">Not available right now</h3>
                <p className="m-0">Delivery is paused at the moment. Pickup is still open.</p>
              </>
            )}
            <Link href="/menu" className="group/link mt-auto inline-flex min-h-11 items-center gap-2 self-start border-b-2 border-transparent pb-0.5 font-extrabold text-espresso no-underline hover:border-[var(--caramel)]">
              Order for delivery <span aria-hidden="true" className="transition-transform duration-200 group-hover/link:translate-x-1 motion-reduce:transition-none">→</span>
            </Link>
          </article>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-12 gap-y-6 rounded-[20px] border border-[var(--border)] bg-ivory-2 p-[clamp(24px,3vw,36px)]">
          <div className="max-w-[62ch] flex-[1_1_420px]">
            <span className={KICKER}>About us</span>
            <h3 className="mb-2 mt-1 text-[1.6rem]">{r.name}</h3>
            <p className="m-0">{aboutTeaser}</p>
          </div>
          <div className="grid justify-items-start gap-3.5">
            <Link href="/about" className="btn primary">
              Read our story
            </Link>
            <Link href="/help" className="group/link inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent pb-0.5 font-extrabold text-espresso no-underline hover:border-[var(--caramel)]">
              Need help with an order? <span aria-hidden="true" className="transition-transform duration-200 group-hover/link:translate-x-1 motion-reduce:transition-none">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
