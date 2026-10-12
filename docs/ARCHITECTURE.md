# Architecture

## Shape: a modular monolith
One Next.js 15 (App Router) application, TypeScript throughout, one PostgreSQL database. No microservices. Separate subdomains are optional host → path rewrites (`src/middleware.ts`), not separate apps.

```
src/
  app/
    (shop)/          customer website (home, menu, checkout, track, account, help, policies, mock pay page)
    admin/           admin portal (login + (portal) route group)
    kitchen/         kitchen display
    rider/           rider PWA (+ manifest route, service worker in /public/rider-sw.js)
    api/             JSON route handlers (public, kitchen, rider, dispatch, webhooks, cron, realtime SSE, exports)
    media/           serves uploaded menu photos
  components/        UI (shop/, kitchen/, rider/, admin/ + shared)
  lib/               client-safe code: money, time, state machines + labels, validation schemas, cart, live hook
  server/            ALL business logic (never imported by client components at runtime)
    db.ts env.ts errors.ts ids.ts log.ts audit.ts http.ts action.ts
    auth/            passwords (scrypt), sessions, permissions matrix, guards, rate limiting
    settings.ts      typed business settings (zod) stored in `settings`
    menu.ts menu-admin.ts pricing.ts scheduling.ts zones.ts promotions (in pricing/ops)
    orders/          core (locked transitions + events), create, lifecycle (kitchen, handoff, cancel, cash), queries
    payments/        provider interface, paystack, mock, service (start, verify, webhooks, refunds, jobs)
    fulfillment/     inhouse (riders, assignment, PIN, location) + partners (adapter registry, manual bookings)
    notifications/   outbox + SMS/email channel adapters
    inventory.ts reporting.ts support.ts staff.ts ops.ts storage.ts realtime.ts jobs.ts storefront.ts
db/migrations/       plain SQL migrations (applied by scripts/migrate.ts)
scripts/             migrate, seed-demo, create-owner, run-jobs
tests/               node:test integration + unit tests against real PostgreSQL
```

## Key decisions
| Decision | Why |
|---|---|
| `postgres` (postgres.js) + hand-written SQL migrations, no ORM | Transparent SQL for transactional money logic, zero native deps, works with any Postgres incl. Supabase |
| Money = integer pesewas | Exact arithmetic; percentages rounded half-up in one place (`percentOf`) |
| Separate order / payment / kitchen / fulfilment states | A paid order can wait for the kitchen; a ready order can wait for a rider; a delivery can fail after cooking |
| Row locks (`SELECT … FOR UPDATE`) + transition tables | Two tablets pressing “Start” at once → one succeeds, the other gets a clear conflict |
| Advisory lock per pickup slot | Slot capacity can't be exceeded under concurrent checkout |
| Idempotency keys (orders, refunds, partner bookings) + unique webhook dedupe | Double clicks, retries and repeated webhooks never duplicate side effects |
| Database-backed sessions (httpOnly cookie, hashed token) | Revocable (role change, deactivation, password reset) |
| Server-side authorisation in every service function | Hiding buttons is never the only protection; services are tested directly |
| Realtime = Postgres `LISTEN/NOTIFY` → Server-Sent Events | No extra infrastructure. Events carry no personal data; screens re-fetch through authorised endpoints, which also makes reconnect recovery automatic. Polling fallback built in |
| Notifications outbox with dedupe keys | Retries never double-notify; SMS/email sent after commit and retried by jobs |
| Settings in the database, validated by zod | Owner configures hours, zones, charges, policies without code changes |

## Request flow (order)
Browser cart (estimate only) → `POST /api/quote` (server prices) → `POST /api/orders` → `createOrder` (validate → re-price → zone → claim slot → snapshot items → event) → for online: `startPayment` → provider page → webhook / return → `verifyReference` (provider API) → `applyVerification` → `placeOrder` → kitchen queue (NOTIFY) → kitchen actions → fulfilment → completion → notifications.

## Realtime topics
`kitchen`, `dispatch`, `admin`, `order:<id>` (needs tracking token), `rider:<userId>`, `menu`. Authorised in `/api/realtime`. LISTEN requires a session-mode connection (on Supabase use the session pooler / direct URL, not the transaction pooler). On serverless platforms that cut long connections, screens fall back to polling every 10–15 s.
