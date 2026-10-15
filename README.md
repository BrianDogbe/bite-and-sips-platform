# Bite & Sips platform

Ordering, kitchen, dispatch, rider and administration platform for an independent restaurant or cafeteria in Ghana. Prices are in Ghana cedis (GH₵).

The whole platform is **one Next.js application** backed by **one PostgreSQL database**:

| Part | URL (path) | Optional subdomain | Who uses it |
|---|---|---|---|
| Customer website | `/` | `biteandsips.com` | Customers (guest or account) |
| Admin portal | `/admin` | `admin.biteandsips.com` | Owner and managers |
| Kitchen display | `/kitchen` | `kitchen.biteandsips.com` | Kitchen staff (tablet / TV) |
| Rider app (installable PWA) | `/rider` | `rider.biteandsips.com` | In-house riders |
| Fulfilment & integrations | `src/server/fulfillment` | none | Shared backend module |

All four interfaces read and write the same records through the same server-side business rules. Order, payment, kitchen and fulfilment states are tracked separately.

---

## Quick start (Windows, macOS or Linux)

**You need:** [Node.js 20 LTS or 22 LTS](https://nodejs.org) and PostgreSQL 14+. For PostgreSQL, use either [Docker Desktop](https://www.docker.com/products/docker-desktop/) (`docker compose up -d`), the [PostgreSQL Windows installer](https://www.postgresql.org/download/windows/), or a free [Supabase](https://supabase.com) project.

```powershell
cd "C:\bite-and-sips platform"
npm install
copy .env.example .env.local      # then edit .env.local (DATABASE_URL, APP_SECRET, CRON_SECRET)
npm run db:migrate                # creates the tables
npm run db:seed:demo -- --staff   # OPTIONAL demo menu + demo staff accounts (development only)
npm run dev                       # http://localhost:3001
```

Create your real owner account (prompts for a password):

```powershell
npm run db:create-owner -- --email you@example.com --name "Your Name"
```

Then sign in at `http://localhost:3001/admin/login`. The overview page has a **Before you launch** checklist.

Demo staff (only if you seeded with `--staff`; password `demo-password-123`): `owner@demo.local`, `kitchen@demo.local` (→ `/kitchen`), `rider@demo.local` (→ `/rider`).

### Trying an order end-to-end locally
1. Open `/menu`, add dishes, and go to checkout.
2. Pay online with `PAYMENT_PROVIDER=mock`. A **simulated** payment page lets you approve, decline or leave the payment pending, and approving sends a signed webhook through the real verification path. To pay cash instead, switch on "cash on pickup" in Admin → Settings.
3. Watch the order arrive on `/kitchen`, work through *Start cooking → Ready*, and see the tracking page update live.
4. For delivery: assign a rider in Admin → Dispatch. On `/rider` the rider accepts and picks up the order, then enters the 4-digit PIN shown on the customer's tracking page.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js development server / production build / production server |
| `npm run typecheck` | TypeScript check |
| `npm test` | Integration and unit tests against a **real PostgreSQL test database** (`TEST_DATABASE_URL`, default `postgres://postgres@127.0.0.1:5432/biteandsips_test`; it is wiped by the tests) |
| `npm run db:migrate` | Apply SQL migrations in `db/migrations` |
| `npm run db:seed:demo` | Demo data (refuses to run in production; `--staff` adds demo logins, `--reset` recreates) |
| `npm run db:create-owner` | Create or promote an owner account |
| `npm run jobs:run` | Run background jobs once (schedule every minute, or use `/api/cron/run`) |
| `npm run verify` | typecheck + tests + production build |

---

## What's in the box

- **Customer website.** It covers:
  - Homepage with live open/closed status and the earliest pickup time.
  - Searchable, filterable menu with sizes, required and optional extras, special instructions and allergen display (allergens are shown only when verified).
  - Cart, guest checkout or optional account, scheduled pickup with real slot capacity, and delivery by GPS or by area with a zone fee and minimum order.
  - Payment through Paystack or cash, a live tracking page (timeline, rider, staleness-aware location, delivery PIN), self-cancellation, help requests, reorder and account history.
- **Admin portal.** It covers:
  - Overview, orders (search and filters, full history, notes, cancellation, refunds, cash), kitchen monitor and dispatch board.
  - Menu editor (categories, dishes, sizes, option groups, photos, availability, serving times, recipes) and promotions.
  - Inventory (movements, counts, wastage, suppliers, low stock), customers and support cases.
  - Finance (paid vs gross vs refunds vs fees vs costs, reconciliation, expenses, CSV export) and reports.
  - Staff and roles, settings (hours, closures, zones, charges, policies, tracking) and the audit log.
- **Kitchen display.** Live queue columns, timers, due and late indicators, new-order chime with a visual fallback, sold-out switch, manager alerts, connection/staleness indicator and safe concurrent use.
- **Rider PWA.** Duty toggle with heartbeat, offers that hide the address until accepted, navigation links, step-by-step statuses, cash collection, PIN proof of delivery, failed-delivery reporting, location sharing only during active deliveries, and history.
- **Fulfilment layer.** Pickup, in-house riders, a third-party partner adapter interface (idempotent bookings, reconciliation of unknown outcomes, webhooks, out-of-order protection) and manual partner bookings.

See `docs/` for the details:

| Doc | Contents |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Structure, modules, realtime, decisions |
| [DATABASE](docs/DATABASE.md) | Schema and data rules |
| [ORDER-LIFECYCLE](docs/ORDER-LIFECYCLE.md) | State machines and exception handling |
| [PERMISSIONS](docs/PERMISSIONS.md) | Roles and what each can do |
| [PAYMENTS](docs/PAYMENTS.md) | Paystack setup, webhooks, refunds, reconciliation |
| [DELIVERY](docs/DELIVERY.md) | In-house riders, partners, location and privacy |
| [ENVIRONMENT](docs/ENVIRONMENT.md) | Every environment variable |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Hosting, domains, cron, backups, monitoring, recovery |
| [SECURITY-PRIVACY](docs/SECURITY-PRIVACY.md) | Controls and what to review before launch |
| [TESTING](docs/TESTING.md) | What was tested, results, what's still pending |
| [OWNER-CHECKLIST](docs/OWNER-CHECKLIST.md) | Information and decisions the owner must supply |
| [DESIGN](docs/DESIGN.md) | Provisional brand identity and image sources |

## Honest status

| Area | Status |
|---|---|
| Ordering, pricing, slots, zones, kitchen, in-house delivery, refunds, inventory, reports | Implemented and covered by integration tests against PostgreSQL |
| Paystack | Adapter implemented to Paystack's public API (initialize, verify, signed webhooks, refunds). **Not yet run against a Paystack account.** Do one full test-mode transaction before going live (docs/PAYMENTS.md) |
| SMS (Hubtel) / email (Resend) | Adapters written but **unverified without credentials**. Default `log` driver only writes to the server log. Tracking-page notifications work |
| Third-party delivery APIs | Adapter interface plus manual booking. **No real Ghana partner API is integrated** (none was available with credentials). A dev-only *simulated* partner exists for demos |
| Maps | Uses an OpenStreetMap embed plus device GPS. No geocoding of typed addresses (customers share GPS or pick an area, and unverified locations are flagged) |
| Photo storage | Local disk (`UPLOAD_DIR`). Needs a persistent disk or an object-storage adapter on serverless hosts |

## Backend and realtime
The API can run as a separate Fastify service with Socket.IO WebSockets, and Tailwind CSS is available for the UI.
See [docs/BACKEND.md](docs/BACKEND.md).
