# Database

PostgreSQL 14+ (tested on 16). Schema in `db/migrations/0001_init.sql` (+ `0002` RLS lockdown, `0003` mock-provider tables). Apply with `npm run db:migrate`; applied files are checksummed — never edit an applied migration, add a new one.

## Entities
- **Identity:** `users`, `user_roles` (many roles per user), `sessions` (hashed tokens), `customer_profiles`, `rider_profiles` (duty, heartbeat, last location).
- **Configuration:** `settings` (typed JSON per key), `operating_hours`, `service_closures`, `delivery_zones`.
- **Menu:** `menu_categories`, `menu_items`, `menu_variants` (sizes), `modifier_groups`, `modifiers`, `favorites`, `customer_addresses`, `promotions`, `promotion_redemptions`.
- **Orders:** `orders` (lifecycle/payment/kitchen status columns, totals, promised time), `order_items` (immutable snapshots: name, size, modifiers JSON, unit price, allergens), `order_events` (append-only history across all domains), `slot_reservations`.
- **Payments:** `payment_attempts` (one row per provider attempt; partial unique index = at most one successful payment per order), `webhook_events` (dedupe), `refunds` (idempotency key).
- **Fulfilment:** `fulfillments` (one per order; delivery address snapshot, method, rider/partner, PIN attempts, proof), `delivery_assignments` (history; at most one live per order), `provider_bookings` (idempotency key; at most one live per order), `rider_locations` (purged by retention job).
- **Operations:** `operational_exceptions`, `stock_items`, `stock_movements` (every change), `recipe_lines`, `suppliers`, `expenses`, `support_cases`, `support_notes`, `notifications` (outbox), `audit_events`, `rate_limits`.

## Rules enforced
- Money columns are `INTEGER` pesewas with `CHECK` constraints; `orders.total = subtotal − discount + delivery + service + tax` is a table constraint; `line_total = unit × quantity`.
- Order history is immutable: changing menu prices never touches `order_items`.
- Timestamps are `timestamptz` (UTC); display uses the restaurant timezone setting (Africa/Accra by default).
- Order numbers (`BS-XXXXXX`) are random, not sequential; guest tracking uses a separate 256-bit token.
- Stock can't go negative (`CHECK`) unless the item explicitly allows it.
- Indexes cover order search/status/date filters, kitchen queue, pending payments, rider assignments and location lookups.
- `0002_rls_lockdown.sql` enables Row Level Security with no policies on every table: the app (table owner via `DATABASE_URL`) is unaffected, while Supabase's anon/authenticated REST roles get no access.
