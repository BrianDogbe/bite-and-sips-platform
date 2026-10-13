# Delivery and fulfilment

## Delivery zones
Admin → Settings → Delivery zones. Each zone is a circle (centre point plus radius) with a fee, a minimum order and a typical delivery time. A customer's GPS point gets the **smallest** zone that contains it, so rings around the restaurant give distance-based pricing. If manual selection is allowed, customers without GPS pick an area; those orders are marked **location not verified** for dispatch. Typed addresses are not geocoded, so no address is ever presented as validated when it wasn't.

## In-house riders (`src/server/fulfillment/inhouse.ts`)
- **Availability:** riders toggle On duty, and the app sends a heartbeat every 30 s. A rider counts as *online* only with a recent heartbeat (setting: default 120 s), never because of an old session.
- **Assignment:** Dispatch assigns or reassigns. Offline riders need an explicit override, which is recorded. The full assignment history and reasons are kept.
- **Rider steps:** Accept or Decline (with a reason) → At restaurant → Picked up (only when the kitchen has marked the order ready) → Start trip → Arrived → PIN. Cash-on-delivery must be recorded before the PIN.
- **Proof of delivery:** a 4-digit PIN derived by HMAC from the order ID (never stored) is shown only on the customer's tracking page. The attempt limit is configurable, after which the delivery locks and only an owner or manager override with a written reason can complete it.
- **Failure:** the reason is recorded, the order is flagged, the customer is notified, and dispatch chooses to reattempt or mark it returned.
- **Navigation:** riders get Google Maps directions links to the restaurant and the customer. There is no in-app routing.

## Location sharing
- **When:** only while the rider is on duty **and** has an accepted, active delivery. The browser asks permission and the reason is explained on screen.
- **Validation:** coordinates and device timestamps are checked (future or older than 10 minutes is rejected) and updates are rate limited.
- **Customer view:** the customer sees the location only between pickup and arrival, with a "last updated" time. Positions older than the stale threshold are labelled as possibly out of date.
- **Retention:** history is purged after `locationRetentionDays` (default 30) by the jobs runner.
- **Browser limits:** browsers pause GPS when the phone locks or the browser goes to the background. The rider app requests a screen wake lock while delivering and shows the last successful send time. Uninterrupted tracking is **not** guaranteed. Test this on the riders' actual Android phones.

## Third-party partners (`src/server/fulfillment/partners.ts`)
Every partner implements `DeliveryPartnerAdapter` and declares its capabilities: create, quote, cancel, webhook, polling, courier details, tracking URL and lookup by reference. The dispatch UI only offers what a partner supports.

| Feature | Behaviour |
|---|---|
| Duplicate protection | The booking row (unique idempotency key, at most one live booking per order) is committed **before** calling the partner |
| Timeout | Booking marked `unknown`; no rebooking until reconciled, either by asking the partner (if supported) or by staff confirming |
| Rejection | Back to dispatch, with an attention flag |
| Webhooks | `POST /api/partners/<key>/webhook`. Signature checked per adapter, deduped, out-of-order or regressive updates ignored |
| Cancellation failure | Booking `cancel_failed` plus attention. The booking isn't silently dropped |
| Fee reconciliation | Final fee recorded per booking and used in Finance delivery costs |

**Manual partner fallback:** for partners without an API (phone or WhatsApp bookings), staff record the partner name, reference, fee and notes, then update the status by hand. The customer sees that status updates come from staff.

**Integrated partners today:** none. No Ghana delivery partner API with credentials was available. A *Sandbox courier (SIMULATION)* adapter exists for development demos (`DELIVERY_SANDBOX_PROVIDER=true`, never in production). To add a real partner, implement the interface, call `registerPartnerAdapter()` at startup, add its webhook secret to the environment, and document its capabilities here.
