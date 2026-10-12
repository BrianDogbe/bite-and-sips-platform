import Link from 'next/link';
import Image from 'next/image';
import { getStorefront, getMenuForStorefront, publicZones } from '@/server/storefront';
import { summarizeHours } from '@/components/shop/HoursList';
import { DEFAULT_STORY } from '@/lib/about-story';
import { formatGHS } from '@/lib/money';
import { formatLocalDateTime } from '@/lib/time';
import { StepTile } from '@/components/shop/StepTile';
import { StoryVideo } from '@/components/shop/StoryVideo';
import type { ClientMenuItem } from '@/components/shop/types';

export const dynamic = 'force-dynamic';

function StepCard({ n, title, href, footer, highlight, children }: { n: number; title: string; href: string; footer: string; highlight: boolean; children: React.ReactNode }) {
  return (
    <article className={`step-card${highlight ? ' hi' : ''}`}>
      <div className="step-top">
        <span className="step-label">Step {String(n).padStart(2, '0')}</span>
        <span className="step-dashes" aria-hidden="true">
          {[1, 2, 3, 4].map((d) => (
            <i key={d} className={d <= n ? 'on' : ''} />
          ))}
        </span>
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      <Link href={href} className="step-foot">
        <span>{footer}</span>
        <span className="step-arrow" aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export default async function Home() {
  const [sf, menu, zones] = await Promise.all([
    getStorefront(),
    getMenuForStorefront(),
    publicZones(),
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
  const activeClosure = sf.closures.find((c) => new Date(c.startsAt) <= new Date());
  const upcomingClosure = sf.closures.find((c) => new Date(c.startsAt) > new Date());

  return (
    <>
      <section className="hero hero-photo" aria-labelledby="hero-title">
        <Image src="/brand/hero-bg.jpg" alt="" fill priority sizes="100vw" className="hero-bg" />
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <p className="hero-eyebrow">Sandwiches · Salads · Wraps · Sips</p>
            <h1 id="hero-title">
              Good food.
              <br />
              Good mood.
            </h1>
            <p className="hero-lede">{`Freshly made sandwiches, salads, wraps and sips from ${r.name}. Order for pickup or have it delivered.`}</p>
            {(activeClosure || !sf.ordering.acceptingOrders || !sf.openNow) && (
              <p className="alert warn hero-notice" role="status">
                {activeClosure
                  ? `Temporarily closed${activeClosure.reason ? `: ${activeClosure.reason}` : ''}`
                  : !sf.ordering.acceptingOrders
                    ? sf.ordering.pauseMessage
                    : 'We’re closed right now. You can still schedule an order for later at checkout.'}
              </p>
            )}
            <div className="hero-cta">
              <Link href="/menu" className="btn primary lg">
                Order now <span aria-hidden="true">→</span>
              </Link>
              <Link href="/about" className="btn lg">
                About us
              </Link>
            </div>
            <ul className="hero-perks">
              <li>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 19c0-8 5-14 15-14 0 9-5 15-13 15" />
                  <path d="M5 19c3-5 6-8 10-10" />
                </svg>
                <span>
                  <strong>Fresh ingredients</strong>
                  <small>Always</small>
                </span>
              </li>
              <li>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 10h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4Z" />
                  <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
                  <path d="M8 3c-1 1.5 1 2.5 0 4M12 3c-1 1.5 1 2.5 0 4" />
                </svg>
                <span>
                  <strong>Great taste</strong>
                  <small>Every time</small>
                </span>
              </li>
              <li>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 6h11v10H2zM13 9h4l3 3v4h-7" />
                  <circle cx="6.5" cy="17.5" r="1.8" />
                  <circle cx="16.5" cy="17.5" r="1.8" />
                </svg>
                <span>
                  <strong>Fast &amp; reliable</strong>
                  <small>Delivery &amp; pickup</small>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div className="marquee" aria-label="Good food. Good mood. Fresh ingredients, great taste, delivery and pickup.">
        {[0, 1].map((n) => (
          <div className="marquee-track" key={n} aria-hidden={n === 1 ? 'true' : undefined}>
            {['Good food', 'Good mood', 'Fresh ingredients', 'Great taste', 'Pickup & delivery', 'Shawarma', 'Sandwiches', 'Salads', 'Combo', 'Drinks'].map((t) => (
              <span key={t} className="marquee-item">
                {t}
              </span>
            ))}
          </div>
        ))}
      </div>

      {upcomingClosure && (
        <div className="wrap" style={{ marginTop: 20 }}>
          <p className="alert info">
            Heads up: {upcomingClosure.scope === 'all' ? 'we’re closed' : `${upcomingClosure.scope} is unavailable`} from {formatLocalDateTime(upcomingClosure.startsAt, tz)} to{' '}
            {formatLocalDateTime(upcomingClosure.endsAt, tz)} ({upcomingClosure.reason}).
          </p>
        </div>
      )}

      <section className="section wrap featured-section" aria-labelledby="featured-title">
        <div className="section-head">
          <div>
            <h2 id="featured-title">From the kitchen</h2>
            <p>Pick a category to start with. The full menu has everything.</p>
          </div>
          <Link href="/menu" className="text-link">
            See the full menu <span aria-hidden="true">→</span>
          </Link>
        </div>
        {groups.length ? (
          <div className="cat-grid">
            {groups.map((g) => (
              <Link key={g.id} href={`/menu#cat-${g.id}`} className="cat-card">
                <div className="cat-img">
                  {g.image ? (
                    <Image src={g.image} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1100px) 33vw, 230px" />
                  ) : (
                    <div className="cat-noimg" aria-hidden="true">
                      {g.name.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="cat-body">
                  <div className="cat-meta">
                    <span>Category</span>
                    <span>
                      {g.count} {g.count === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <span className="cat-name">{g.name}</span>
                  {g.blurb && <span className="cat-blurb">{g.blurb}</span>}
                  <span className="cat-browse">
                    <span>View</span>
                    <span aria-hidden="true">→</span>
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

      <StoryVideo src="/brand/story.mp4" poster="/brand/hero-bg.jpg" title="Good food. Good mood." subtitle="Made fresh, ready for pickup or on its way to you." />

      <section className="section how" aria-labelledby="how-title">
        <div className="wrap">
          <h2 id="how-title" style={{ marginBottom: 24 }}>How ordering works</h2>
          <div className="step-grid">
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

      <section className="section wrap info-section" aria-labelledby="delivery-title">
        <div className="section-head">
          <div>
            <h2 id="delivery-title">Visit us or get it delivered</h2>
            <p>Collect your order at the counter, or have it brought to your door.</p>
          </div>
        </div>
        <div className="visit-grid">
          {sf.ordering.pickupEnabled && (
            <article className="visit-panel">
              <span className="info-kicker">Pickup</span>
              <ul className="visit-rows">
                <li>
                  <span className="foot-ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg></span>
                  <div>
                    <strong>{r.addressLine ? [r.addressLine, r.city].filter(Boolean).join(', ') : 'Address to be announced'}</strong>
                    {r.pickupInstructions && <small>{r.pickupInstructions}</small>}
                  </div>
                </li>
                <li>
                  <span className="foot-ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
                  <div>
                    <strong>Opening hours</strong>
                    <dl className="visit-hours">
                      {summarizeHours(sf.hours).map((g) => (
                        <div key={g.days}>
                          <dt>{g.days}</dt>
                          <dd>{g.time}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </li>
                {r.phone && (
                  <li>
                    <span className="foot-ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1Z" /></svg></span>
                    <div>
                      <strong>Call us</strong>
                      <small>
                        <a href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a>
                      </small>
                    </div>
                  </li>
                )}
              </ul>
              <Link href="/menu" className="btn lg visit-cta">
                Order for pickup <span aria-hidden="true">→</span>
              </Link>
            </article>
          )}

          <article className="visit-card">
            <span className="info-kicker">Delivery</span>
            {sf.ordering.deliveryEnabled ? (
              zones.length ? (
                <>
                  <h3>We deliver to</h3>
                  <ul className="zone-list">
                    {zones.map((z) => (
                      <li key={z.id}>
                        <span className="zone-name">{z.name}</span>
                        <span className="zone-fee">
                          {formatGHS(z.feePesewas)}
                          <small>{z.minOrderPesewas ? `min. ${formatGHS(z.minOrderPesewas)}` : 'no minimum'}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="muted small">Your fee is confirmed at checkout once we know where you are.</p>
                </>
              ) : (
                <>
                  <h3>Delivery areas coming soon</h3>
                  <p>We will publish our delivery areas here.</p>
                </>
              )
            ) : (
              <>
                <h3>Not available right now</h3>
                <p>Delivery is paused at the moment. Pickup is still open.</p>
              </>
            )}
            <Link href="/menu" className="text-link visit-cta">
              Order for delivery <span aria-hidden="true">→</span>
            </Link>
          </article>
        </div>

        <div className="about-strip">
          <div>
            <span className="info-kicker">About us</span>
            <h3>{r.name}</h3>
            <p>{aboutTeaser}</p>
          </div>
          <div className="about-strip-links">
            <Link href="/about" className="btn primary">
              Read our story
            </Link>
            <Link href="/help" className="text-link">
              Need help with an order? <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
