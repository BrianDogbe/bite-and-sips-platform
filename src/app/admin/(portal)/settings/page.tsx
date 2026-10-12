import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { getAllSettings } from '@/server/settings';
import { loadSchedule } from '@/server/scheduling';
import { listZones } from '@/server/zones';
import { upcomingClosures } from '@/server/ops';
import { activePaymentProvider } from '@/server/payments/provider';
import { env } from '@/server/env';
import { pesewasToCedisString, formatGHS } from '@/lib/money';
import { formatLocalDateTime } from '@/lib/time';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { ActionButton } from '@/components/ActionButton';
import { Badge } from '@/components/Badge';
import * as A from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

const TABS = [
  ['restaurant', 'Restaurant'],
  ['ordering', 'Ordering & payments'],
  ['hours', 'Hours & closures'],
  ['zones', 'Delivery zones'],
  ['delivery', 'Delivery, stock & alerts'],
] as const;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function Check({ name, label, checked, hint }: { name: string; label: string; checked: boolean; hint?: string }) {
  return (
    <label className="check">
      <input type="checkbox" name={name} defaultChecked={checked} />
      <span>
        {label}
        {hint && <span className="hint" style={{ display: 'block' }}>{hint}</span>}
      </span>
    </label>
  );
}
function F({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePagePerm('settings.manage', '/admin/login');
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'restaurant';
  const [s, sched, zones, closures] = await Promise.all([getAllSettings(), loadSchedule(), listZones(), upcomingClosures()]);
  const r = s.restaurant;
  const o = s.ordering;
  const d = s.delivery;
  const provider = activePaymentProvider();
  const e = env();

  return (
    <>
      <div className="admin-top">
        <h1>Settings</h1>
      </div>
      <nav className="tabs" aria-label="Settings sections">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/admin/settings?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>
            {l}
          </Link>
        ))}
      </nav>

      {tab === 'restaurant' && (
        <ActionForm action={A.restaurantAction} className="panel stack" key="restaurant">
          <div className="grid-2">
            <F id="r-name" label="Restaurant name"><input id="r-name" name="name" className="input" defaultValue={r.name} required maxLength={80} /></F>
            <F id="r-tag" label="Tagline"><input id="r-tag" name="tagline" className="input" defaultValue={r.tagline} maxLength={140} /></F>
            <F id="r-phone" label="Phone"><input id="r-phone" name="phone" className="input" defaultValue={r.phone} /></F>
            <F id="r-wa" label="WhatsApp number"><input id="r-wa" name="whatsapp" className="input" defaultValue={r.whatsapp} /></F>
            <F id="r-email" label="Email"><input id="r-email" name="email" type="email" className="input" defaultValue={r.email} /></F>
            <F id="r-tz" label="Timezone" hint="Ghana: Africa/Accra"><input id="r-tz" name="timezone" className="input" defaultValue={r.timezone} /></F>
            <F id="r-addr" label="Street address"><input id="r-addr" name="addressLine" className="input" defaultValue={r.addressLine} /></F>
            <F id="r-city" label="City / area"><input id="r-city" name="city" className="input" defaultValue={r.city} /></F>
            <F id="r-lat" label="Latitude" hint="Used for rider navigation. Find it by long-pressing the shop in Google Maps."><input id="r-lat" name="lat" className="input" inputMode="decimal" defaultValue={r.lat ?? ''} /></F>
            <F id="r-lng" label="Longitude"><input id="r-lng" name="lng" className="input" inputMode="decimal" defaultValue={r.lng ?? ''} /></F>
          </div>
          <F id="r-about" label="About the restaurant (homepage)"><textarea id="r-about" name="about" className="textarea" defaultValue={r.about} maxLength={2000} /></F>
          <F id="r-pick" label="Pickup instructions"><input id="r-pick" name="pickupInstructions" className="input" defaultValue={r.pickupInstructions} maxLength={500} /></F>
          <div className="grid-2">
            <F id="r-ig" label="Instagram URL"><input id="r-ig" name="instagram" className="input" defaultValue={r.instagram} /></F>
            <F id="r-fb" label="Facebook URL"><input id="r-fb" name="facebook" className="input" defaultValue={r.facebook} /></F>
            <F id="r-tt" label="TikTok URL"><input id="r-tt" name="tiktok" className="input" defaultValue={r.tiktok} /></F>
            <F id="r-x" label="X URL"><input id="r-x" name="x" className="input" defaultValue={r.x} /></F>
          </div>
          <Check name="isConfigured" label="These are the restaurant’s real details" checked={r.isConfigured} hint="Removes the setup reminder and the “placeholder policies” notice." />
          <SubmitButton>Save restaurant details</SubmitButton>
        </ActionForm>
      )}

      {tab === 'ordering' && (
        <ActionForm action={A.orderingAction} className="stack" key="ordering">
          <section className="panel stack">
            <h2 style={{ fontSize: '1.15rem' }}>Taking orders</h2>
            <Check name="acceptingOrders" label="Accept online orders" checked={o.acceptingOrders} hint="Untick to pause ordering instantly (e.g. kitchen overwhelmed)." />
            <F id="o-pm" label="Message shown while paused"><input id="o-pm" name="pauseMessage" className="input" defaultValue={o.pauseMessage} maxLength={200} /></F>
            <div className="row">
              <Check name="pickupEnabled" label="Pickup" checked={o.pickupEnabled} />
              <Check name="deliveryEnabled" label="Delivery" checked={o.deliveryEnabled} />
            </div>
            <Check name="autoAcceptOrders" label="Auto-accept paid orders in the kitchen" checked={o.autoAcceptOrders} hint="When off, kitchen staff tap “Accept” on each new order." />
          </section>
          <section className="panel stack">
            <h2 style={{ fontSize: '1.15rem' }}>Kitchen capacity and scheduling</h2>
            <div className="grid-2">
              <F id="o-sm" label="Slot length (minutes)"><input id="o-sm" name="slotMinutes" type="number" min={5} max={60} className="input" defaultValue={o.slotMinutes} /></F>
              <F id="o-sc" label="Orders per slot" hint="Hard limit; customers can’t pick full slots."><input id="o-sc" name="slotCapacity" type="number" min={1} max={200} className="input" defaultValue={o.slotCapacity} /></F>
              <F id="o-lead" label="Minimum lead time (minutes)" hint="The longest dish prep time is used if higher."><input id="o-lead" name="minLeadMinutes" type="number" min={0} max={240} className="input" defaultValue={o.minLeadMinutes} /></F>
              <F id="o-days" label="Days ahead customers can schedule"><input id="o-days" name="maxDaysAhead" type="number" min={0} max={14} className="input" defaultValue={o.maxDaysAhead} /></F>
              <F id="o-last" label="Last order before closing (minutes)"><input id="o-last" name="lastOrderBeforeCloseMinutes" type="number" min={0} max={240} className="input" defaultValue={o.lastOrderBeforeCloseMinutes} /></F>
              <F id="o-max" label="Max quantity per dish"><input id="o-max" name="maxItemQuantity" type="number" min={1} max={50} className="input" defaultValue={o.maxItemQuantity} /></F>
            </div>
          </section>
          <section className="panel stack">
            <h2 style={{ fontSize: '1.15rem' }}>Payments</h2>
            <p className="small">
              Online payment provider: {provider === 'paystack' ? <Badge tone="ok">Paystack (live configuration)</Badge> : provider === 'mock' ? <Badge tone="warn">Test mode (simulated payments)</Badge> : <Badge tone="neutral">Not configured</Badge>}. This is set by the server environment (PAYMENT_PROVIDER), not here.
            </p>
            <Check name="onlinePaymentsEnabled" label="Offer Mobile Money / card payment" checked={o.onlinePaymentsEnabled} />
            <Check name="cashOnPickupEnabled" label="Offer cash on pickup" checked={o.cashOnPickupEnabled} hint="Cash orders go to the kitchen immediately, before payment." />
            <Check name="cashOnDeliveryEnabled" label="Offer cash on delivery" checked={o.cashOnDeliveryEnabled} hint="Riders must record the cash before completing the delivery." />
            <F id="o-pw" label="Time allowed to pay online (minutes)" hint="Unpaid orders are cancelled after this (after checking with the provider)."><input id="o-pw" name="paymentWindowMinutes" type="number" min={5} max={120} className="input" defaultValue={o.paymentWindowMinutes} /></F>
          </section>
          <section className="panel stack">
            <h2 style={{ fontSize: '1.15rem' }}>Charges</h2>
            <p className="alert warn small">Confirm with your accountant which taxes and levies (e.g. VAT, NHIL, GETFund, COVID-19 levy) apply to your business before setting them. Defaults are zero.</p>
            <div className="grid-2">
              <F id="o-sc2" label="Service charge (%)"><input id="o-sc2" name="serviceChargePct" className="input" inputMode="decimal" defaultValue={o.serviceChargeBps / 100} /></F>
              <F id="o-tax" label="Taxes & levies (%)" hint="Applied to food after discount + service charge."><input id="o-tax" name="taxPct" className="input" inputMode="decimal" defaultValue={o.taxBps / 100} /></F>
              <F id="o-tl" label="Label shown to customers"><input id="o-tl" name="taxLabel" className="input" defaultValue={o.taxLabel} /></F>
              <F id="o-min" label="Minimum order (GH₵)"><input id="o-min" name="minOrder" className="input" inputMode="decimal" defaultValue={pesewasToCedisString(o.minOrderPesewas)} /></F>
            </div>
          </section>
          <section className="panel stack">
            <h2 style={{ fontSize: '1.15rem' }}>Policies</h2>
            <Check name="allowCustomerCancelBeforeKitchen" label="Let customers cancel online before the kitchen starts" checked={o.allowCustomerCancelBeforeKitchen} hint="Paid orders cancelled this way are refunded in full automatically." />
            <F id="o-cp" label="Cancellation policy"><textarea id="o-cp" name="cancellationPolicy" className="textarea" defaultValue={o.cancellationPolicy} maxLength={2000} /></F>
            <F id="o-rp" label="Refund policy"><textarea id="o-rp" name="refundPolicy" className="textarea" defaultValue={o.refundPolicy} maxLength={2000} /></F>
          </section>
          <SubmitButton className="btn primary lg">Save ordering settings</SubmitButton>
        </ActionForm>
      )}

      {tab === 'hours' && (
        <div className="two-col">
          <ActionForm action={A.hoursAction} className="panel stack" key="hours">
            <h2 style={{ fontSize: '1.15rem' }}>Weekly opening hours ({r.timezone})</h2>
            <p className="hint">Up to two periods per day (e.g. lunch and dinner). Leave blank for closed.</p>
            {DAYS.map((name, day) => {
              const list = sched.hours.filter((h) => h.weekday === day);
              return (
                <div key={day} className="row" style={{ alignItems: 'end' }}>
                  <strong style={{ width: 110 }}>{name}</strong>
                  {[0, 1].map((k) => (
                    <span key={k} className="row" style={{ gap: 4 }}>
                      <input type="time" name={`o-${day}-${k}`} className="input" style={{ width: 120 }} defaultValue={list[k]?.opensAt ?? ''} aria-label={`${name} period ${k + 1} opens`} />
                      <span>–</span>
                      <input type="time" name={`c-${day}-${k}`} className="input" style={{ width: 120 }} defaultValue={list[k]?.closesAt ?? ''} aria-label={`${name} period ${k + 1} closes`} />
                    </span>
                  ))}
                </div>
              );
            })}
            <SubmitButton>Save hours</SubmitButton>
          </ActionForm>
          <section className="panel stack">
            <h2 style={{ fontSize: '1.15rem' }}>Temporary closures</h2>
            {closures.length === 0 ? <p className="muted small">None scheduled.</p> : (
              <ul className="event-list">
                {closures.map((c) => (
                  <li key={c.id}>
                    <span className="small">{c.scope}</span>
                    <span>
                      {formatLocalDateTime(c.startsAt, r.timezone)} to {formatLocalDateTime(c.endsAt, r.timezone)}: {c.reason}{' '}
                      <ActionButton className="btn sm ghost" action={A.removeClosureAction.bind(null, c.id)}>Remove</ActionButton>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={A.closureAction} className="stack" resetOnSuccess>
              <input type="hidden" name="tz" value={r.timezone} />
              <F id="cl-s" label={`Starts (${r.timezone})`}><input id="cl-s" name="startsAt" type="datetime-local" className="input" required /></F>
              <F id="cl-e" label="Ends"><input id="cl-e" name="endsAt" type="datetime-local" className="input" required /></F>
              <F id="cl-sc" label="Affects"><select id="cl-sc" name="scope" className="select"><option value="all">All ordering</option><option value="delivery">Delivery only</option><option value="pickup">Pickup only</option></select></F>
              <F id="cl-r" label="Reason (shown to customers)"><input id="cl-r" name="reason" className="input" required maxLength={120} placeholder="e.g. Public holiday" /></F>
              <SubmitButton className="btn">Add closure</SubmitButton>
            </ActionForm>
          </section>
        </div>
      )}

      {tab === 'zones' && (
        <div className="two-col">
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>Zones</h2>
            <p className="hint">Each zone is a circle around a point. A customer’s GPS location gets the smallest zone that contains it. Use rings from the restaurant (e.g. 0–3 km, 3–7 km) for distance-based fees.</p>
            {zones.length === 0 ? <p className="muted">No zones yet. Customers can’t order delivery until you add one.</p> : zones.map((z) => (
              <details key={z.id} className="panel tight" style={{ marginBottom: 10 }}>
                <summary>
                  <strong>{z.name}</strong> {formatGHS(z.feePesewas)}, {(z.radiusM / 1000).toFixed(1)} km {!z.isActive && <Badge tone="neutral">Off</Badge>} {z.isDemo && <Badge tone="warn">Demo</Badge>}
                </summary>
                <ZoneForm z={z} />
              </details>
            ))}
          </section>
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>Add a zone</h2>
            <ZoneForm z={null} defaults={{ lat: r.lat, lng: r.lng }} />
          </section>
        </div>
      )}

      {tab === 'delivery' && (
        <ActionForm action={A.deliveryAction} className="stack" key="delivery">
          <section className="panel stack">
            <h2 style={{ fontSize: '1.15rem' }}>Riders and tracking</h2>
            <div className="grid-2">
              <F id="d-on" label="Rider counts as online if active within (seconds)"><input id="d-on" name="riderOnlineWindowSeconds" type="number" min={30} max={900} className="input" defaultValue={d.riderOnlineWindowSeconds} /></F>
              <F id="d-st" label="Location is “stale” after (seconds)"><input id="d-st" name="locationStaleSeconds" type="number" min={30} max={1800} className="input" defaultValue={d.locationStaleSeconds} /></F>
              <F id="d-int" label="Location update interval (seconds)"><input id="d-int" name="locationIntervalSeconds" type="number" min={5} max={300} className="input" defaultValue={d.locationIntervalSeconds} /></F>
              <F id="d-ret" label="Keep location history for (days)" hint="Older rider locations are deleted automatically."><input id="d-ret" name="locationRetentionDays" type="number" min={1} max={365} className="input" defaultValue={d.locationRetentionDays} /></F>
              <F id="d-pin" label="Wrong PIN attempts before lock"><input id="d-pin" name="pinMaxAttempts" type="number" min={3} max={10} className="input" defaultValue={d.pinMaxAttempts} /></F>
              <F id="d-fee" label="Default rider fee per delivery (GH₵)"><input id="d-fee" name="defaultRiderFee" className="input" inputMode="decimal" defaultValue={pesewasToCedisString(d.defaultRiderFeePesewas)} /></F>
            </div>
            <Check name="allowManualZoneSelection" label="Let customers pick their area instead of sharing GPS" checked={d.allowManualZoneSelection} hint="These orders are marked “location not verified” for dispatch." />
          </section>
          <section className="panel stack">
            <h2 style={{ fontSize: '1.15rem' }}>Inventory</h2>
            <Check name="autoDeductOnPrep" label="Deduct recipe ingredients when the kitchen starts an order" checked={s.inventory.autoDeductOnPrep} hint="Only dishes with a recipe are affected. Stock is not restored automatically if an order is cancelled after preparation starts." />
          </section>
          <section className="panel stack">
            <h2 style={{ fontSize: '1.15rem' }}>Customer notifications</h2>
            <p className="small">
              Tracking-page updates are always on. SMS provider: <strong>{e.NOTIFY_SMS_PROVIDER}</strong>, email provider: <strong>{e.NOTIFY_EMAIL_PROVIDER}</strong> (set in the server environment; “log” means messages are only written to the server log).
            </p>
            <Check name="smsEnabled" label="Send SMS for key updates (payment confirmed, ready, on the way, cancelled)" checked={s.notifications.smsEnabled} />
            <Check name="emailEnabled" label="Send email receipts and updates" checked={s.notifications.emailEnabled} />
          </section>
          <SubmitButton className="btn primary lg">Save</SubmitButton>
        </ActionForm>
      )}
    </>
  );
}

function ZoneForm({ z, defaults }: { z: Awaited<ReturnType<typeof listZones>>[number] | null; defaults?: { lat: number | null; lng: number | null } }) {
  return (
    <ActionForm action={A.zoneAction} className="stack" resetOnSuccess={!z}>
      {z && <input type="hidden" name="id" value={z.id} />}
      <div className="grid-2">
        <F id={`z-n-${z?.id ?? 'new'}`} label="Name"><input id={`z-n-${z?.id ?? 'new'}`} name="name" className="input" defaultValue={z?.name} required /></F>
        <F id={`z-r-${z?.id ?? 'new'}`} label="Radius (km)"><input id={`z-r-${z?.id ?? 'new'}`} name="radiusKm" className="input" inputMode="decimal" defaultValue={z ? z.radiusM / 1000 : ''} required /></F>
        <F id={`z-la-${z?.id ?? 'new'}`} label="Centre latitude"><input id={`z-la-${z?.id ?? 'new'}`} name="centerLat" className="input" inputMode="decimal" defaultValue={z?.centerLat ?? defaults?.lat ?? ''} required /></F>
        <F id={`z-ln-${z?.id ?? 'new'}`} label="Centre longitude"><input id={`z-ln-${z?.id ?? 'new'}`} name="centerLng" className="input" inputMode="decimal" defaultValue={z?.centerLng ?? defaults?.lng ?? ''} required /></F>
        <F id={`z-f-${z?.id ?? 'new'}`} label="Delivery fee (GH₵)"><input id={`z-f-${z?.id ?? 'new'}`} name="fee" className="input" inputMode="decimal" defaultValue={z ? pesewasToCedisString(z.feePesewas) : ''} required /></F>
        <F id={`z-m-${z?.id ?? 'new'}`} label="Minimum order (GH₵)"><input id={`z-m-${z?.id ?? 'new'}`} name="minOrder" className="input" inputMode="decimal" defaultValue={z ? pesewasToCedisString(z.minOrderPesewas) : '0'} /></F>
        <F id={`z-e1-${z?.id ?? 'new'}`} label="Typical delivery time from (min)"><input id={`z-e1-${z?.id ?? 'new'}`} name="etaMin" type="number" className="input" defaultValue={z?.etaMinMinutes ?? ''} /></F>
        <F id={`z-e2-${z?.id ?? 'new'}`} label="to (min)"><input id={`z-e2-${z?.id ?? 'new'}`} name="etaMax" type="number" className="input" defaultValue={z?.etaMaxMinutes ?? ''} /></F>
      </div>
      <input type="hidden" name="sortOrder" value={z?.sortOrder ?? 0} />
      <label className="check"><input type="checkbox" name="isActive" defaultChecked={z?.isActive ?? true} /> Active</label>
      <SubmitButton className="btn">{z ? 'Save zone' : 'Add zone'}</SubmitButton>
    </ActionForm>
  );
}
