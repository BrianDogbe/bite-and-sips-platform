'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart, newIdempotencyKey, type CartLine } from '@/lib/cart';
import { formatGHS } from '@/lib/money';
import { formatLocalTime, localDateKey } from '@/lib/time';
import { postJson } from '@/lib/use-live';
import { Icon } from '../Icon';
import { ItemSheet } from './ItemSheet';
import type { ClientMenuItem } from './types';

interface Zone {
  id: number;
  name: string;
  description: string | null;
  feePesewas: number;
  minOrderPesewas: number;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
}
interface Ordering {
  acceptingOrders: boolean;
  pauseMessage: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  onlinePayments: boolean;
  testPayments: boolean;
  cashOnPickup: boolean;
  cashOnDelivery: boolean;
  cancellationPolicy: string;
  taxLabel: string;
  allowManualZone: boolean;
  maxItemQuantity: number;
}
interface QuoteResp {
  lines: { index: number; unitPricePesewas: number; lineTotalPesewas: number }[];
  problems: { index: number; code: string; message: string }[];
  subtotalPesewas: number;
  discountPesewas: number;
  deliveryFeePesewas: number;
  serviceChargePesewas: number;
  taxPesewas: number;
  totalPesewas: number;
  maxPrepMinutes: number;
  promo: { code: string; description: string | null } | null;
  promoError: string | null;
  zone: { id: number; name: string; verified: boolean; etaMinMinutes: number | null; etaMaxMinutes: number | null } | null;
  fulfillmentError: string | null;
  minOrderError: string | null;
  charges: { taxLabel: string };
}
interface Slot {
  start: string;
  remaining: number;
  available: boolean;
}
type Phase = 'idle' | 'submitting' | 'redirecting';
const KEY_STORE = 'bs_checkout_key';

export function Checkout({
  ordering,
  zones,
  timezone,
  menuItems,
  user,
  restaurantAddress,
}: {
  ordering: Ordering;
  zones: Zone[];
  timezone: string;
  menuItems: ClientMenuItem[];
  user: { name: string; phone: string | null; email: string | null } | null;
  restaurantAddress: string;
}) {
  const router = useRouter();
  const cart = useCart();
  const [type, setType] = useState<'pickup' | 'delivery'>(ordering.pickupEnabled ? 'pickup' : 'delivery');
  const [asap, setAsap] = useState(true);
  const [slot, setSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [addr, setAddr] = useState({ addressLine: '', landmark: '', instructions: '' });
  const [loc, setLoc] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [locStatus, setLocStatus] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [contact, setContact] = useState({ name: user?.name ?? '', phone: user?.phone?.replace(/^\+233/, '0') ?? '', email: user?.email ?? '' });
  const [pay, setPay] = useState<'online' | 'cash'>(ordering.onlinePayments ? 'online' : 'cash');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(false);
  const [quote, setQuote] = useState<QuoteResp | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<CartLine | null>(null);
  const idemKey = useRef<string>('');

  useEffect(() => {
    try {
      idemKey.current = sessionStorage.getItem(KEY_STORE) || '';
    } catch {
      /* ignore */
    }
    if (!idemKey.current) {
      idemKey.current = newIdempotencyKey();
      try {
        sessionStorage.setItem(KEY_STORE, idemKey.current);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const cashAllowed = type === 'pickup' ? ordering.cashOnPickup : ordering.cashOnDelivery;
  useEffect(() => {
    if (pay === 'cash' && !cashAllowed && ordering.onlinePayments) setPay('online');
    if (pay === 'online' && !ordering.onlinePayments && cashAllowed) setPay('cash');
  }, [type, cashAllowed, pay, ordering.onlinePayments]);

  const items = useMemo(
    () => cart.lines.map((l) => ({ menuItemId: l.menuItemId, variantId: l.variantId, modifierIds: l.modifierIds, quantity: l.quantity, instructions: l.instructions })),
    [cart.lines],
  );

  // Authoritative server quote (debounced)
  useEffect(() => {
    if (!cart.ready || !items.length) {
      setQuote(null);
      return;
    }
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const q = await postJson<QuoteResp>('/api/quote', {
          items,
          promoCode: promo,
          fulfillment: type === 'delivery' ? { type, lat: loc?.lat ?? null, lng: loc?.lng ?? null, zoneId: loc ? null : zoneId } : { type },
        });
        setQuote(q);
        setQuoteError(null);
      } catch (e) {
        setQuoteError((e as Error).message);
      } finally {
        setQuoting(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [items, promo, type, loc, zoneId, cart.ready]);

  // Slots for the chosen fulfillment type
  const prep = quote?.maxPrepMinutes ?? 0;
  useEffect(() => {
    let cancelled = false;
    setSlotsError(null);
    fetch(`/api/slots?type=${type}&prep=${prep}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { slots: Slot[] }) => {
        if (cancelled) return;
        setSlots(d.slots ?? []);
        if (slot && !d.slots?.some((s) => s.start === slot && s.available)) setSlot(null);
      })
      .catch(() => !cancelled && setSlotsError('Could not load available times.'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, prep]);

  const earliest = slots?.find((s) => s.available) ?? null;
  const slotsByDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const k = localDateKey(new Date(s.start), timezone);
      (m.get(k) ?? m.set(k, []).get(k)!).push(s);
    }
    return [...m.entries()].slice(0, 3);
  }, [slots, timezone]);
  const [day, setDay] = useState<string | null>(null);
  const activeDay = day ?? slotsByDay[0]?.[0] ?? null;

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setLocStatus('Your browser can’t share location. Choose your area instead.');
      return;
    }
    setLocStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)), accuracy: p.coords.accuracy ?? null });
        setZoneId(null);
        setLocStatus(p.coords.accuracy && p.coords.accuracy > 200 ? `Location found (accurate to about ${Math.round(p.coords.accuracy)} m). Please add a landmark.` : 'Location found.');
      },
      (err) => {
        setLocStatus(err.code === err.PERMISSION_DENIED ? 'Location permission was denied. Choose your area from the list instead.' : 'We couldn’t get your location. Choose your area instead.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (contact.name.trim().length < 2) e.name = 'Enter your name';
    if (!/^(?:\+?233|0)\d{9}$/.test(contact.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter a valid Ghana phone number, e.g. 024 123 4567';
    if (pay === 'online' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim())) e.email = 'Needed for your payment receipt';
    if (contact.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim())) e.email = 'Enter a valid email';
    if (type === 'delivery') {
      if (addr.addressLine.trim().length < 3) e.addressLine = 'Enter your street, house number or building';
      if (!loc && !zoneId) e.location = 'Share your location or choose your area';
    }
    if (!asap && !slot) e.slot = 'Choose a time';
    if (!terms) e.terms = 'Please accept to continue';
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  const blocking =
    !ordering.acceptingOrders ||
    !items.length ||
    (quote && (quote.problems.length > 0 || !!quote.fulfillmentError || !!quote.minOrderError)) ||
    (pay === 'cash' && !cashAllowed) ||
    (pay === 'online' && !ordering.onlinePayments) ||
    (asap && slots !== null && !earliest);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase !== 'idle') return; // state machine: no duplicate submissions
    setSubmitError(null);
    if (!validate()) {
      setSubmitError('Please check the highlighted fields.');
      return;
    }
    if (blocking) {
      setSubmitError('Please fix the problems with your order shown above first.');
      return;
    }
    setPhase('submitting');
    try {
      const res = await postJson<{ trackingToken: string; authorizationUrl: string | null; paymentError: string | null; paymentMethod: string }>('/api/orders', {
        idempotencyKey: idemKey.current,
        items,
        contact: { name: contact.name, phone: contact.phone, email: contact.email || null },
        fulfillment:
          type === 'pickup'
            ? { type, slot: asap ? null : slot }
            : {
                type,
                slot: asap ? null : slot,
                addressLine: addr.addressLine,
                landmark: addr.landmark || null,
                instructions: addr.instructions || null,
                lat: loc?.lat ?? null,
                lng: loc?.lng ?? null,
                zoneId: loc ? null : zoneId,
              },
        paymentMethod: pay,
        promoCode: promo,
        notes: notes || null,
        acceptTerms: true,
      });
      // An order now exists: clear the cart and start a fresh idempotency key for any future order.
      cart.clear();
      try {
        sessionStorage.removeItem(KEY_STORE);
      } catch {
        /* ignore */
      }
      setPhase('redirecting');
      if (res.authorizationUrl) window.location.assign(res.authorizationUrl);
      else router.push(`/track/${res.trackingToken}${res.paymentError ? '?pay=retry' : ''}`);
    } catch (err) {
      const ex = err as Error & { details?: { problems?: { message: string }[]; fieldErrors?: Record<string, string[]> } };
      const probs = ex.details?.problems?.map((p) => p.message).join(' ');
      setSubmitError(probs ? `${ex.message} ${probs}` : ex.message);
      setPhase('idle');
    }
  }

  if (!cart.ready) {
    return (
      <p className="muted" role="status">
        <span className="spinner" /> Loading your order…
      </p>
    );
  }
  if (!cart.lines.length) {
    return (
      <div className="empty panel">
        <h2>Your order is empty</h2>
        <p>Add something delicious from the menu to get started.</p>
        <Link href="/menu" className="btn primary lg">
          Browse the menu
        </Link>
      </div>
    );
  }

  const problemsByIndex = new Map((quote?.problems ?? []).map((p) => [p.index, p.message]));
  const priceByIndex = new Map((quote?.lines ?? []).map((l) => [l.index, l]));
  const editingItem = editing ? menuItems.find((m) => m.id === editing.menuItemId) ?? null : null;

  return (
    <form onSubmit={submit} noValidate className="checkout-grid">
      <div className="stack" style={{ ['--stack' as string]: '20px' }}>
        {!ordering.acceptingOrders && <p className="alert warn">{ordering.pauseMessage}</p>}

        <section className="panel" aria-labelledby="h-items">
          <div className="row between">
            <h2 id="h-items" style={{ margin: 0 }}>
              Your order
            </h2>
            <Link href="/menu" className="linkish">
              Add more
            </Link>
          </div>
          {cart.lines.map((l, i) => {
            const server = priceByIndex.get(i);
            const changed = server && server.unitPricePesewas !== l.unitPricePesewas;
            return (
              <div key={l.key} className="cart-line">
                <div>
                  <strong>{l.name}</strong>
                  {l.variantName && <span className="muted"> ({l.variantName})</span>}
                  {l.modifierNames.length > 0 && <div className="mods">{l.modifierNames.join(', ')}</div>}
                  {l.instructions && <div className="mods">Note: {l.instructions}</div>}
                  {problemsByIndex.get(i) && (
                    <p className="field-error" role="alert">
                      {problemsByIndex.get(i)}
                    </p>
                  )}
                  {changed && <p className="hint">Price updated to {formatGHS(server.unitPricePesewas)} each.</p>}
                  <div className="row" style={{ marginTop: 8 }}>
                    <div className="qty" role="group" aria-label={`Quantity of ${l.name}`}>
                      <button type="button" onClick={() => cart.update(l.key, { quantity: l.quantity - 1 })} aria-label="Decrease">
                        <Icon name="minus" size={16} />
                      </button>
                      <output>{l.quantity}</output>
                      <button type="button" onClick={() => cart.update(l.key, { quantity: Math.min(ordering.maxItemQuantity, l.quantity + 1) })} aria-label="Increase">
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                    {menuItems.some((m) => m.id === l.menuItemId) && (
                      <button type="button" className="linkish" onClick={() => setEditing(l)}>
                        Change options
                      </button>
                    )}
                    <button type="button" className="linkish" style={{ color: 'var(--danger)' }} onClick={() => cart.remove(l.key)}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="price">{formatGHS(server ? server.lineTotalPesewas : l.unitPricePesewas * l.quantity)}</div>
              </div>
            );
          })}
        </section>

        <section className="panel" aria-labelledby="h-ful">
          <h2 id="h-ful">Pickup or delivery</h2>
          <div className="seg" role="group" aria-label="Fulfillment">
            {ordering.pickupEnabled && (
              <button type="button" aria-pressed={type === 'pickup'} onClick={() => setType('pickup')}>
                <Icon name="store" size={18} /> Pickup
              </button>
            )}
            {ordering.deliveryEnabled && zones.length > 0 && (
              <button type="button" aria-pressed={type === 'delivery'} onClick={() => setType('delivery')}>
                <Icon name="bike" size={18} /> Delivery
              </button>
            )}
          </div>
          {type === 'pickup' && restaurantAddress && <p className="muted" style={{ marginTop: 12 }}>Collect from {restaurantAddress}.</p>}

          {type === 'delivery' && (
            <div className="stack" style={{ marginTop: 16 }}>
              <div className="field">
                <label htmlFor="addressLine">Address</label>
                <input id="addressLine" className="input" autoComplete="street-address" value={addr.addressLine} aria-invalid={!!fieldErrors.addressLine} onChange={(e) => setAddr({ ...addr, addressLine: e.target.value })} placeholder="House number, street, area" maxLength={200} />
                {fieldErrors.addressLine && <span className="field-error">{fieldErrors.addressLine}</span>}
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="landmark">Landmark</label>
                  <input id="landmark" className="input" value={addr.landmark} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} placeholder="e.g. opposite the Total filling station" maxLength={200} />
                </div>
                <div className="field">
                  <label htmlFor="dinstr">Instructions for the rider</label>
                  <input id="dinstr" className="input" value={addr.instructions} onChange={(e) => setAddr({ ...addr, instructions: e.target.value })} placeholder="Gate colour, floor, call on arrival…" maxLength={300} />
                </div>
              </div>
              <div className="field">
                <span className="label">Where should we deliver?</span>
                <div className="row">
                  <button type="button" className="btn leaf" onClick={useMyLocation}>
                    <Icon name="map" size={18} /> Use my current location
                  </button>
                  {loc && (
                    <button type="button" className="linkish" onClick={() => (setLoc(null), setLocStatus(null))}>
                      Clear location
                    </button>
                  )}
                </div>
                {locStatus && (
                  <p className="hint" role="status">
                    {locStatus}
                  </p>
                )}
                {!loc && ordering.allowManualZone && (
                  <div className="field" style={{ marginTop: 8 }}>
                    <label htmlFor="zone">Or choose your area</label>
                    <select id="zone" className="select" value={zoneId ?? ''} onChange={(e) => setZoneId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Select an area…</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} ({formatGHS(z.feePesewas)})
                        </option>
                      ))}
                    </select>
                    <span className="hint">We’ll call to confirm your exact location if you don’t share it.</span>
                  </div>
                )}
                {fieldErrors.location && <span className="field-error">{fieldErrors.location}</span>}
                {quote?.zone && (
                  <p className="alert ok small" style={{ marginTop: 8 }}>
                    Delivering to {quote.zone.name}
                    {quote.zone.etaMinMinutes != null && quote.zone.etaMaxMinutes != null ? `, usually ${quote.zone.etaMinMinutes}–${quote.zone.etaMaxMinutes} min after your food is ready` : ''}.
                    {!quote.zone.verified && ' Area chosen manually.'}
                  </p>
                )}
                {quote?.fulfillmentError && (
                  <p className="alert error small" role="alert" style={{ marginTop: 8 }}>
                    {quote.fulfillmentError}
                  </p>
                )}
              </div>
            </div>
          )}

          <fieldset className="optgroup" style={{ marginTop: 20 }}>
            <legend>{type === 'pickup' ? 'Pickup time' : 'When should it be ready?'}</legend>
            <label className="opt">
              <input type="radio" name="when" checked={asap} onChange={() => setAsap(true)} />
              <span className="grow">
                As soon as possible
                {earliest && (
                  <span className="muted">
                    {' '}
                    (around {localDateKey(new Date(earliest.start), timezone) === localDateKey(new Date(), timezone) ? '' : 'tomorrow '}
                    {formatLocalTime(earliest.start, timezone)})
                  </span>
                )}
              </span>
            </label>
            <label className="opt">
              <input type="radio" name="when" checked={!asap} onChange={() => setAsap(false)} />
              <span className="grow">Schedule for later</span>
            </label>
            {slots && !earliest && <p className="alert warn small">There are no available times at the moment. Please check our opening hours.</p>}
            {slotsError && <p className="alert error small">{slotsError}</p>}
            {!asap && slots && (
              <div style={{ marginTop: 10 }}>
                {slotsByDay.length > 1 && (
                  <div className="row" role="group" aria-label="Day" style={{ marginBottom: 10 }}>
                    {slotsByDay.map(([k, list]) => (
                      <button key={k} type="button" className="chip" aria-pressed={activeDay === k} onClick={() => setDay(k)}>
                        {new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(list[0].start))}
                      </button>
                    ))}
                  </div>
                )}
                <div className="slot-grid" role="group" aria-label="Available times">
                  {(slotsByDay.find(([k]) => k === activeDay)?.[1] ?? []).map((s) => (
                    <button key={s.start} type="button" className="slot" disabled={!s.available} aria-pressed={slot === s.start} onClick={() => setSlot(s.start)} aria-label={`${formatLocalTime(s.start, timezone)}${s.available ? '' : ', full'}`}>
                      {formatLocalTime(s.start, timezone)}
                    </button>
                  ))}
                </div>
                {fieldErrors.slot && <span className="field-error">{fieldErrors.slot}</span>}
              </div>
            )}
          </fieldset>
        </section>

        <section className="panel" aria-labelledby="h-contact">
          <h2 id="h-contact">Your details</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" className="input" autoComplete="name" value={contact.name} aria-invalid={!!fieldErrors.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} maxLength={80} />
              {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="024 123 4567" value={contact.phone} aria-invalid={!!fieldErrors.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} maxLength={16} />
              {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
            </div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="email">Email {pay === 'online' ? '' : <span className="hint">(optional)</span>}</label>
            <input id="email" className="input" type="email" autoComplete="email" value={contact.email} aria-invalid={!!fieldErrors.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} maxLength={120} />
            {pay === 'online' && <span className="hint">The payment provider sends your receipt here.</span>}
            {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="notes">
              Notes for the kitchen <span className="hint">(optional)</span>
            </label>
            <textarea id="notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
          {!user && (
            <p className="hint" style={{ marginTop: 10 }}>
              No account needed. <Link href="/account/login?next=/checkout">Sign in</Link> to save your order history.
            </p>
          )}
        </section>

        <section className="panel" aria-labelledby="h-pay">
          <h2 id="h-pay">Payment</h2>
          <fieldset className="optgroup" style={{ marginTop: 0 }}>
            <legend className="sr-only">Payment method</legend>
            {ordering.onlinePayments && (
              <label className="opt">
                <input type="radio" name="pay" checked={pay === 'online'} onChange={() => setPay('online')} />
                <span className="grow">
                  Mobile Money or card
                  <span className="hint" style={{ display: 'block' }}>
                    {ordering.testPayments ? 'Test mode: you’ll see a simulated payment page and nothing is charged.' : 'You’ll complete payment on our payment provider’s secure page.'}
                  </span>
                </span>
              </label>
            )}
            {cashAllowed && (
              <label className="opt">
                <input type="radio" name="pay" checked={pay === 'cash'} onChange={() => setPay('cash')} />
                <span className="grow">Cash on {type === 'pickup' ? 'pickup' : 'delivery'}</span>
              </label>
            )}
            {!ordering.onlinePayments && !cashAllowed && <p className="alert warn">No payment method is available for {type} right now.</p>}
          </fieldset>
        </section>
      </div>

      <aside>
        <section className="panel" aria-labelledby="h-sum">
          <h2 id="h-sum">Summary</h2>
          <div className="row" style={{ marginBottom: 12 }}>
            <label htmlFor="promo" className="sr-only">
              Promo code
            </label>
            <input id="promo" className="input grow" placeholder="Promo code" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} maxLength={30} style={{ width: 'auto' }} />
            <button type="button" className="btn" onClick={() => setPromo(promoInput.trim() || null)}>
              Apply
            </button>
          </div>
          {quote?.promoError && <p className="field-error">{quote.promoError}</p>}
          {quote?.promo && (
            <p className="alert ok small">
              {quote.promo.code} applied. {quote.promo.description}{' '}
              <button type="button" className="linkish" onClick={() => (setPromo(null), setPromoInput(''))}>
                Remove
              </button>
            </p>
          )}
          <div className="totals" aria-live="polite" aria-busy={quoting}>
            {quote ? (
              <>
                <div className="line">
                  <span>Subtotal</span>
                  <span>{formatGHS(quote.subtotalPesewas)}</span>
                </div>
                {quote.discountPesewas > 0 && (
                  <div className="line">
                    <span>Discount</span>
                    <span>−{formatGHS(quote.discountPesewas)}</span>
                  </div>
                )}
                {type === 'delivery' && (
                  <div className="line">
                    <span>Delivery</span>
                    <span>{quote.zone ? formatGHS(quote.deliveryFeePesewas) : 'Add your location'}</span>
                  </div>
                )}
                {quote.serviceChargePesewas > 0 && (
                  <div className="line">
                    <span>Service charge</span>
                    <span>{formatGHS(quote.serviceChargePesewas)}</span>
                  </div>
                )}
                {quote.taxPesewas > 0 && (
                  <div className="line">
                    <span>{quote.charges.taxLabel}</span>
                    <span>{formatGHS(quote.taxPesewas)}</span>
                  </div>
                )}
                <div className="line grand">
                  <span>Total</span>
                  <span>{formatGHS(quote.totalPesewas)}</span>
                </div>
              </>
            ) : (
              <p className="muted">{quoting ? 'Checking prices…' : quoteError ?? 'Calculating…'}</p>
            )}
          </div>
          {quote?.minOrderError && (
            <p className="alert warn small" style={{ marginTop: 10 }}>
              {quote.minOrderError}
            </p>
          )}
          {quoteError && quote && <p className="field-error">Couldn’t refresh prices: {quoteError}</p>}

          <label className="check" style={{ marginTop: 16 }}>
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-invalid={!!fieldErrors.terms} />
            <span className="small">
              I accept the <Link href="/policies" target="_blank">terms, privacy and refund policy</Link>. {ordering.cancellationPolicy}
            </span>
          </label>
          {fieldErrors.terms && <span className="field-error">{fieldErrors.terms}</span>}

          {submitError && (
            <p className="alert error" role="alert" style={{ marginTop: 12 }}>
              {submitError}
            </p>
          )}
          <button type="submit" className="btn primary lg block" style={{ marginTop: 14 }} disabled={phase !== 'idle' || !!blocking || quoting} aria-busy={phase !== 'idle'}>
            {phase === 'submitting' ? (
              <>
                <span className="spinner" /> Placing your order…
              </>
            ) : phase === 'redirecting' ? (
              <>
                <span className="spinner" /> {pay === 'online' ? 'Opening secure payment…' : 'Opening your tracking page…'}
              </>
            ) : pay === 'online' ? (
              `Pay ${quote ? formatGHS(quote.totalPesewas) : ''}`
            ) : (
              'Place order'
            )}
          </button>
          <p className="hint" style={{ marginTop: 8 }}>
            Your order is only confirmed after {pay === 'online' ? 'the payment provider confirms your payment' : 'we receive it'}. Final prices are checked by our system.
          </p>
        </section>
      </aside>
      <ItemSheet
        item={editingItem}
        initial={editing ? { variantId: editing.variantId, modifierIds: editing.modifierIds, quantity: editing.quantity, instructions: editing.instructions } : null}
        onClose={() => setEditing(null)}
        maxQty={ordering.maxItemQuantity}
        onReplace={(line) => {
          if (editing) cart.remove(editing.key);
          cart.add(line);
        }}
      />
    </form>
  );
}
