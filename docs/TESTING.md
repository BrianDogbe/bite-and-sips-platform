# Testing

## How to run
```bash
# needs a PostgreSQL database that may be wiped:
set TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/biteandsips_test   (Windows: set / PowerShell: $env:TEST_DATABASE_URL=...)
npm test            # all integration + unit tests (node:test via tsx)
npm run typecheck
npm run build       # Next.js production build
```

## Results from the build environment (12 Oct 2026)
These ran against **PostgreSQL 16** with Node 22.

| Suite | Tests | Result | Covers |
|---|---|---|---|
| `tests/ordering.test.ts` | 14 | ✅ pass | Pricing from the DB, invalid/sold-out modifiers and items, service charge and tax rounding, client price tampering ignored, immutable snapshots, idempotent concurrent duplicate submissions, **slot capacity under 5 concurrent checkouts**, expired/invalid slots, zones (inside, outside, minimum order, manual), cash pickup flow, concurrent kitchen conflicts, customer cancellation rules, pausing, staff cancellation permission and audit |
| `tests/payments.test.ts` | 13 | ✅ pass | Verified webhook success, repeated and distinct duplicate webhooks, invalid signature, forged webhook while the provider says pending, failed then retry, wrong amount, wrong currency, MoMo pending resume (no double charge), duplicate payment flagged, refunds (permissions, limits, pending → processed, idempotent, partial → full), paid-then-cancelled, payment-window expiry and late payment, Paystack signature/parsing/status mapping, provider timeout |
| `tests/delivery.test.ts` | 11 | ✅ pass | Full in-house delivery (assign → accept → pickup → location → cash → PIN), offline/stale riders, decline/reassign/unassign history, unrelated rider blocked, PIN brute-force lock and override, failed delivery and reattempt, location rules (off duty, no delivery, invalid, too old, future, stale display, purge), no location before pickup, partner booking idempotency/rejection/timeout reconciliation/cancellation failure/fee reconciliation, manual partner fallback, partner webhook signature, duplicates and out-of-order updates |
| `tests/security.test.ts` | 10 | ✅ pass | Password hashing, generic login errors, lockout, wrong portal, session revocation, rate limiter, unguessable tracking tokens, guest lookup needs a matching phone, server-side permission checks across finance/orders/kitchen/refunds/menu/staff/dispatch, kitchen payload has no phone or money, rider sees only their own jobs and no address before accepting, role removal revokes sessions, last-owner protection, audit records, settings validation, **no secrets or server imports in client code** |
| `tests/unit-scheduling.test.ts` | 10 | ✅ pass | Timezones, slot generation (lead time, prep, closing cutoff, step), closures by scope, capacity, split shifts, zone resolution, money parsing/rounding, promotions, state-machine legality, permission matrix |
| **Total** | **58** | **58 passed, 0 failed** | |

TypeScript (`tsc --noEmit`, strict) passed with no errors.

### Rendering and browser checks
These ran with a local harness. Next.js itself couldn't be installed in the build environment (see below).
- **Server render of every page:** all 53 page/route combinations rendered without errors against a seeded database. This covered storefront, admin (every section and settings tab), kitchen and rider, and the permission redirects (guest → admin, kitchen → finance, support → settings, rider → kitchen).
- **Browser end-to-end:** Chromium via Playwright, mounting the real client components against the real API route handlers. All 18 steps passed:
  - Menu, required-option validation, live price, cart and server-verified totals.
  - Form validation, cash pickup order and tracking page.
  - Kitchen ticket shown once, start → ready, customer page updating live, handoff blocked until cash is recorded.
  - Online checkout redirecting to the payment page.
  - Delivery checkout with a manual area, rider going on duty, kitchen assigning, rider offer hiding the address, pickup blocked until ready, kitchen readying, pickup, cash, wrong PIN rejected, correct PIN, customer page showing "Delivered".
  - Guest lookup, with no uncaught browser errors.
- Screenshots were reviewed at 390 px (phone) and 1280 px (desktop) widths.

## Not yet verified — must be done on a real setup
| Item | Why pending | How to verify |
|---|---|---|
| `npm install` + `next build` with the real Next.js 15 / React 19 packages | The build environment couldn't download npm packages (registry blocked by network policy). The code was type-checked against React's real type definitions and minimal Next.js stubs, and rendered through the harness | Run `npm run verify` on your machine. Report any build error |
| Paystack test-mode transactions, webhooks and refunds | No credentials | docs/PAYMENTS.md checklist |
| Hubtel SMS / Resend email delivery | No credentials | Set provider + keys, enable in Settings, place a test order |
| GPS behaviour on riders' phones (locked screen, backgrounding, weak signal) | Needs real Android devices | One test delivery per rider phone. Watch the "last sent" indicator and the customer page staleness |
| Kitchen chime on the actual tablet | Browser audio policy needs a user tap | Tap "Sound on" and place a test order |
| Formal accessibility audit (axe/Lighthouse) and performance budget | Tools unavailable offline | Run Lighthouse on `/`, `/menu`, `/checkout` after deployment. The design already uses semantic HTML, labelled inputs, visible focus rings, aria-live status regions, reduced-motion support, text labels alongside colour, and 44 px+ touch targets |
| Load testing | Out of scope here | Optional, e.g. k6 against checkout and kitchen queue |
| Backup restore drill | Needs your production database | docs/DEPLOYMENT.md |
