-- Bite & Sips — initial schema
-- Conventions:
--   * Money is stored as INTEGER pesewas (1 GHS = 100 pesewas). Never floats.
--   * Timestamps are TIMESTAMPTZ (stored UTC). Display uses the configured restaurant timezone.
--   * Order, payment, kitchen and fulfillment states are separate columns / tables.
--   * Business-critical transitions are enforced in application services (src/server) and
--     protected by CHECK constraints + optimistic version columns here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Identity & access
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT,
  phone               TEXT,
  full_name           TEXT NOT NULL,
  password_hash       TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_count  INTEGER NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX users_phone_idx ON users (phone);

CREATE TABLE user_roles (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner','manager','kitchen','dispatcher','rider','support','customer')),
  granted_by  UUID REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    TEXT NOT NULL UNIQUE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE customer_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notify_sms        BOOLEAN NOT NULL DEFAULT TRUE,
  notify_email      BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_opt_in  BOOLEAN NOT NULL DEFAULT FALSE,
  loyalty_points    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rider_profiles (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type       TEXT NOT NULL DEFAULT 'motorbike',
  vehicle_plate      TEXT,
  is_on_duty         BOOLEAN NOT NULL DEFAULT FALSE,
  last_heartbeat_at  TIMESTAMPTZ,
  last_lat           DOUBLE PRECISION,
  last_lng           DOUBLE PRECISION,
  last_accuracy_m    DOUBLE PRECISION,
  last_location_at   TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Settings & operations configuration
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id)
);

-- Weekly opening hours, local restaurant time. Several intervals per weekday allowed.
CREATE TABLE operating_hours (
  id        SERIAL PRIMARY KEY,
  weekday   SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
  opens_at  TIME NOT NULL,
  closes_at TIME NOT NULL,
  CHECK (closes_at > opens_at)
);

-- Temporary closures / service interruptions.
CREATE TABLE service_closures (
  id          SERIAL PRIMARY KEY,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','pickup','delivery')),
  reason      TEXT NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- Delivery zones: circles around a centre point. The smallest matching zone wins.
CREATE TABLE delivery_zones (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  center_lat          DOUBLE PRECISION NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
  center_lng          DOUBLE PRECISION NOT NULL CHECK (center_lng BETWEEN -180 AND 180),
  radius_m            INTEGER NOT NULL CHECK (radius_m > 0),
  fee_pesewas         INTEGER NOT NULL CHECK (fee_pesewas >= 0),
  min_order_pesewas   INTEGER NOT NULL DEFAULT 0 CHECK (min_order_pesewas >= 0),
  eta_min_minutes     INTEGER,
  eta_max_minutes     INTEGER,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_demo             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
CREATE TABLE menu_categories (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE menu_items (
  id                 SERIAL PRIMARY KEY,
  category_id        INTEGER NOT NULL REFERENCES menu_categories(id),
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  description        TEXT NOT NULL DEFAULT '',
  image_url          TEXT,
  image_alt          TEXT,
  base_price_pesewas INTEGER NOT NULL CHECK (base_price_pesewas >= 0),
  prep_minutes       INTEGER NOT NULL DEFAULT 15 CHECK (prep_minutes BETWEEN 0 AND 240),
  is_available       BOOLEAN NOT NULL DEFAULT TRUE,   -- false = sold out / temporarily unavailable
  is_featured        BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived        BOOLEAN NOT NULL DEFAULT FALSE,
  dietary_tags       TEXT[] NOT NULL DEFAULT '{}',    -- only verified tags, e.g. vegetarian, vegan, spicy
  allergens          TEXT[] NOT NULL DEFAULT '{}',
  allergens_verified BOOLEAN NOT NULL DEFAULT FALSE,
  available_days     SMALLINT[],                      -- NULL = every day (0 = Sunday)
  available_from     TIME,                            -- NULL = all opening hours
  available_until    TIME,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  unavailable_reason TEXT,
  is_demo            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX menu_items_category_idx ON menu_items (category_id) WHERE NOT is_archived;

-- Variants (sizes etc). When an item has variants the customer must pick exactly one,
-- and the variant price replaces the base price.
CREATE TABLE menu_variants (
  id             SERIAL PRIMARY KEY,
  item_id        INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  price_pesewas  INTEGER NOT NULL CHECK (price_pesewas >= 0),
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  is_available   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX menu_variants_item_idx ON menu_variants (item_id);

CREATE TABLE modifier_groups (
  id          SERIAL PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  min_select  INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select  INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  CHECK (max_select >= min_select)
);
CREATE INDEX modifier_groups_item_idx ON modifier_groups (item_id);

CREATE TABLE modifiers (
  id             SERIAL PRIMARY KEY,
  group_id       INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  price_pesewas  INTEGER NOT NULL DEFAULT 0 CHECK (price_pesewas >= 0),
  is_available   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX modifiers_group_idx ON modifiers (group_id);

CREATE TABLE favorites (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  menu_item_id  INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, menu_item_id)
);

CREATE TABLE customer_addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT 'Home',
  address_line  TEXT NOT NULL,
  landmark      TEXT,
  instructions  TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  zone_id       INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customer_addresses_user_idx ON customer_addresses (user_id);

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------
CREATE TABLE promotions (
  id                   SERIAL PRIMARY KEY,
  code                 TEXT NOT NULL,
  description          TEXT,
  discount_type        TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value       INTEGER NOT NULL CHECK (discount_value > 0), -- percent (1-100) or pesewas
  min_subtotal_pesewas INTEGER NOT NULL DEFAULT 0,
  max_discount_pesewas INTEGER,
  starts_at            TIMESTAMPTZ,
  ends_at              TIMESTAMPTZ,
  usage_limit          INTEGER,
  used_count           INTEGER NOT NULL DEFAULT 0,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percent' OR discount_value <= 100)
);
CREATE UNIQUE INDEX promotions_code_unique ON promotions (upper(code));

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number            TEXT NOT NULL UNIQUE,      -- human friendly, random (not sequential)
  tracking_token          TEXT NOT NULL UNIQUE,      -- 256-bit secret for guest tracking links
  idempotency_key         TEXT NOT NULL UNIQUE,      -- client checkout attempt key
  customer_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_name           TEXT NOT NULL,
  customer_phone          TEXT NOT NULL,
  customer_email          TEXT,
  fulfillment_type        TEXT NOT NULL CHECK (fulfillment_type IN ('pickup','delivery')),
  payment_method          TEXT NOT NULL CHECK (payment_method IN ('online','cash')),
  status                  TEXT NOT NULL DEFAULT 'pending_payment'
                            CHECK (status IN ('pending_payment','placed','in_progress','completed','cancelled')),
  payment_status          TEXT NOT NULL DEFAULT 'unpaid'
                            CHECK (payment_status IN ('unpaid','pending','paid','failed','cash_due','cash_collected',
                                                      'refund_pending','partially_refunded','refunded','reconciliation_required')),
  kitchen_status          TEXT NOT NULL DEFAULT 'not_sent'
                            CHECK (kitchen_status IN ('not_sent','new','accepted','preparing','ready','handed_off','cancelled')),
  needs_attention         BOOLEAN NOT NULL DEFAULT FALSE,
  attention_reason        TEXT,
  subtotal_pesewas        INTEGER NOT NULL CHECK (subtotal_pesewas >= 0),
  discount_pesewas        INTEGER NOT NULL DEFAULT 0 CHECK (discount_pesewas >= 0),
  delivery_fee_pesewas    INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_pesewas >= 0),
  service_charge_pesewas  INTEGER NOT NULL DEFAULT 0 CHECK (service_charge_pesewas >= 0),
  tax_pesewas             INTEGER NOT NULL DEFAULT 0 CHECK (tax_pesewas >= 0),
  total_pesewas           INTEGER NOT NULL CHECK (total_pesewas >= 0),
  refunded_pesewas        INTEGER NOT NULL DEFAULT 0 CHECK (refunded_pesewas >= 0),
  currency                TEXT NOT NULL DEFAULT 'GHS',
  promotion_id            INTEGER REFERENCES promotions(id),
  customer_notes          TEXT,
  scheduled_slot_start    TIMESTAMPTZ NOT NULL,      -- kitchen slot the order was booked into
  promised_at             TIMESTAMPTZ NOT NULL,      -- promised pickup time / target ready time for delivery
  is_asap                 BOOLEAN NOT NULL DEFAULT TRUE,
  payment_expires_at      TIMESTAMPTZ,
  placed_at               TIMESTAMPTZ,
  accepted_at             TIMESTAMPTZ,
  prep_started_at         TIMESTAMPTZ,
  ready_at                TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  cancel_reason           TEXT,
  cancelled_by            UUID REFERENCES users(id),
  stock_deducted          BOOLEAN NOT NULL DEFAULT FALSE,
  is_test                 BOOLEAN NOT NULL DEFAULT FALSE, -- created with the mock payment provider / demo
  version                 INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (total_pesewas = subtotal_pesewas - discount_pesewas + delivery_fee_pesewas + service_charge_pesewas + tax_pesewas),
  CHECK (refunded_pesewas <= total_pesewas)
);
CREATE INDEX orders_created_idx ON orders (created_at DESC);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX orders_kitchen_idx ON orders (kitchen_status) WHERE kitchen_status IN ('new','accepted','preparing','ready');
CREATE INDEX orders_customer_idx ON orders (customer_user_id, created_at DESC);
CREATE INDEX orders_phone_idx ON orders (customer_phone);
CREATE INDEX orders_payment_status_idx ON orders (payment_status);
CREATE INDEX orders_pending_payment_idx ON orders (payment_expires_at) WHERE status = 'pending_payment';

CREATE TABLE order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id          INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  variant_id            INTEGER REFERENCES menu_variants(id) ON DELETE SET NULL,
  -- immutable snapshots ------------------------------------------------------
  item_name             TEXT NOT NULL,
  variant_name          TEXT,
  modifiers             JSONB NOT NULL DEFAULT '[]',  -- [{id, group, name, pricePesewas}]
  allergens             TEXT[] NOT NULL DEFAULT '{}',
  base_price_pesewas    INTEGER NOT NULL CHECK (base_price_pesewas >= 0),
  unit_price_pesewas    INTEGER NOT NULL CHECK (unit_price_pesewas >= 0), -- base/variant + modifiers
  quantity              INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  line_total_pesewas    INTEGER NOT NULL CHECK (line_total_pesewas >= 0),
  instructions          TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  CHECK (line_total_pesewas = unit_price_pesewas * quantity)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_menu_item_idx ON order_items (menu_item_id);

-- Append-only history of every significant transition (order, payment, kitchen, fulfillment).
CREATE TABLE order_events (
  id                   BIGSERIAL PRIMARY KEY,
  order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  domain               TEXT NOT NULL CHECK (domain IN ('order','payment','kitchen','fulfillment','note','support')),
  type                 TEXT NOT NULL,
  from_state           TEXT,
  to_state             TEXT,
  message              TEXT,
  customer_visible     BOOLEAN NOT NULL DEFAULT FALSE,
  actor_user_id        UUID REFERENCES users(id),
  actor_label          TEXT,               -- 'system', 'customer', 'paystack', staff role…
  data                 JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, id);

-- Kitchen capacity reservations (one per order). Capacity is enforced under an advisory lock.
CREATE TABLE slot_reservations (
  order_id     UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  slot_start   TIMESTAMPTZ NOT NULL,
  released_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX slot_reservations_active_idx ON slot_reservations (slot_start) WHERE released_at IS NULL;

CREATE TABLE promotion_redemptions (
  id              SERIAL PRIMARY KEY,
  promotion_id    INTEGER NOT NULL REFERENCES promotions(id),
  order_id        UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  amount_pesewas  INTEGER NOT NULL,
  voided_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
CREATE TABLE payment_attempts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider                 TEXT NOT NULL CHECK (provider IN ('paystack','mock','cash')),
  reference                TEXT NOT NULL UNIQUE,
  amount_pesewas           INTEGER NOT NULL CHECK (amount_pesewas > 0),
  currency                 TEXT NOT NULL DEFAULT 'GHS',
  status                   TEXT NOT NULL DEFAULT 'initialized'
                             CHECK (status IN ('initialized','pending','successful','failed','abandoned','expired','reversed','mismatch')),
  provider_transaction_id  TEXT,
  channel                  TEXT,               -- mobile_money, card, cash …
  authorization_url        TEXT,
  fees_pesewas             INTEGER,
  paid_at                  TIMESTAMPTZ,
  gateway_response         TEXT,
  verification             JSONB,              -- sanitized verification snapshot (no card data)
  collected_by             UUID REFERENCES users(id), -- cash
  reconciliation_status    TEXT NOT NULL DEFAULT 'unreconciled'
                             CHECK (reconciliation_status IN ('unreconciled','matched','discrepancy','not_applicable')),
  settled_amount_pesewas   INTEGER,
  reconciled_at            TIMESTAMPTZ,
  reconciled_by            UUID REFERENCES users(id),
  reconciliation_note      TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_attempts_order_idx ON payment_attempts (order_id);
CREATE INDEX payment_attempts_status_idx ON payment_attempts (status, created_at);
-- Only one successful payment per order (duplicate-charge guard).
CREATE UNIQUE INDEX payment_attempts_one_success ON payment_attempts (order_id) WHERE status = 'successful';

CREATE TABLE webhook_events (
  id                BIGSERIAL PRIMARY KEY,
  provider          TEXT NOT NULL,
  dedupe_key        TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  signature_valid   BOOLEAN NOT NULL,
  payload           JSONB NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  processing_error  TEXT,
  UNIQUE (provider, dedupe_key)
);

CREATE TABLE refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_attempt_id  UUID NOT NULL REFERENCES payment_attempts(id),
  amount_pesewas      INTEGER NOT NULL CHECK (amount_pesewas > 0),
  reason              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested','pending','processed','failed','manual')),
  provider_refund_id  TEXT,
  idempotency_key     TEXT NOT NULL UNIQUE,
  requested_by        UUID REFERENCES users(id),
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at        TIMESTAMPTZ
);
CREATE INDEX refunds_order_idx ON refunds (order_id);

-- ---------------------------------------------------------------------------
-- Fulfillment
-- ---------------------------------------------------------------------------
CREATE TABLE fulfillments (
  order_id               UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  type                   TEXT NOT NULL CHECK (type IN ('pickup','delivery')),
  method                 TEXT CHECK (method IN ('pickup','in_house','third_party','manual_partner')),
  status                 TEXT NOT NULL,
  -- delivery address snapshot
  address_line           TEXT,
  landmark               TEXT,
  instructions           TEXT,
  lat                    DOUBLE PRECISION,
  lng                    DOUBLE PRECISION,
  location_verified      BOOLEAN NOT NULL DEFAULT FALSE, -- true only for device-GPS/geocoded points inside a zone
  zone_id                INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
  zone_name              TEXT,
  -- in-house rider
  rider_user_id          UUID REFERENCES users(id),
  -- third-party / manual partner
  provider_name          TEXT,
  external_ref           TEXT,
  provider_fee_pesewas   INTEGER,
  status_source          TEXT NOT NULL DEFAULT 'system' CHECK (status_source IN ('system','manual','provider')),
  tracking_url           TEXT,
  courier_name           TEXT,
  courier_phone          TEXT,
  -- proof of delivery / handoff
  pin_attempts           INTEGER NOT NULL DEFAULT 0,
  pin_locked             BOOLEAN NOT NULL DEFAULT FALSE,
  pod_method             TEXT CHECK (pod_method IN ('pin','override','pickup_code','staff_handoff','provider')),
  pod_by                 UUID REFERENCES users(id),
  pod_note               TEXT,
  picked_up_at           TIMESTAMPTZ,
  delivered_at           TIMESTAMPTZ,
  collected_at           TIMESTAMPTZ,
  failed_at              TIMESTAMPTZ,
  failure_reason         TEXT,
  version                INTEGER NOT NULL DEFAULT 1,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (type = 'pickup'   AND status IN ('pending','ready_for_pickup','collected','cancelled')) OR
    (type = 'delivery' AND status IN ('pending','unassigned','requested','assigned','accepted','at_restaurant',
                                      'picked_up','on_the_way','arrived','delivered','failed','returned','cancelled'))
  )
);
CREATE INDEX fulfillments_status_idx ON fulfillments (type, status);
CREATE INDEX fulfillments_rider_idx ON fulfillments (rider_user_id) WHERE rider_user_id IS NOT NULL;

CREATE TABLE delivery_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_user_id  UUID NOT NULL REFERENCES users(id),
  status         TEXT NOT NULL DEFAULT 'offered'
                   CHECK (status IN ('offered','accepted','declined','cancelled','completed','failed')),
  assigned_by    UUID REFERENCES users(id),
  rider_fee_pesewas INTEGER,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at   TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ,
  end_reason     TEXT
);
CREATE INDEX delivery_assignments_order_idx ON delivery_assignments (order_id);
CREATE INDEX delivery_assignments_rider_idx ON delivery_assignments (rider_user_id, assigned_at DESC);
-- At most one live assignment per order.
CREATE UNIQUE INDEX delivery_assignments_one_live ON delivery_assignments (order_id) WHERE status IN ('offered','accepted');

CREATE TABLE provider_bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL UNIQUE,
  external_id       TEXT,
  status            TEXT NOT NULL DEFAULT 'requesting'
                      CHECK (status IN ('requesting','unknown','requested','accepted','rejected','courier_assigned',
                                        'picked_up','on_the_way','delivered','failed','cancelled','cancel_failed')),
  quoted_fee_pesewas INTEGER,
  final_fee_pesewas  INTEGER,
  is_manual         BOOLEAN NOT NULL DEFAULT FALSE,
  last_error        TEXT,
  notes             TEXT,
  booked_by         UUID REFERENCES users(id),
  last_synced_at    TIMESTAMPTZ,
  reconciled_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX provider_bookings_order_idx ON provider_bookings (order_id);
CREATE UNIQUE INDEX provider_bookings_external_unique ON provider_bookings (provider, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX provider_bookings_one_live ON provider_bookings (order_id)
  WHERE status IN ('requesting','unknown','requested','accepted','courier_assigned','picked_up','on_the_way');

-- Rider GPS points. Precise location — strict access + retention purge (see jobs).
CREATE TABLE rider_locations (
  id             BIGSERIAL PRIMARY KEY,
  rider_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
  lat            DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng            DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m     DOUBLE PRECISION,
  recorded_at    TIMESTAMPTZ NOT NULL,   -- device timestamp
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rider_locations_rider_idx ON rider_locations (rider_user_id, received_at DESC);
CREATE INDEX rider_locations_order_idx ON rider_locations (order_id, received_at DESC);
CREATE INDEX rider_locations_received_idx ON rider_locations (received_at);

-- ---------------------------------------------------------------------------
-- Kitchen / operations exceptions
-- ---------------------------------------------------------------------------
CREATE TABLE operational_exceptions (
  id            BIGSERIAL PRIMARY KEY,
  order_id      UUID REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id  INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('item_unavailable','kitchen_delay','kitchen_issue','delivery_issue',
                                              'payment_issue','provider_issue','other')),
  message       TEXT NOT NULL,
  raised_by     UUID REFERENCES users(id),
  raised_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID REFERENCES users(id),
  resolution    TEXT
);
CREATE INDEX operational_exceptions_open_idx ON operational_exceptions (raised_at DESC) WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
CREATE TABLE suppliers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_items (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE,
  unit                TEXT NOT NULL CHECK (unit IN ('g','kg','ml','l','pcs','pack','crate','bag')),
  quantity            NUMERIC(14,3) NOT NULL DEFAULT 0,  -- recorded (system) quantity
  reorder_level       NUMERIC(14,3) NOT NULL DEFAULT 0,
  cost_per_unit_pesewas INTEGER,                          -- latest known cost, may be null
  supplier_id         INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  allow_negative      BOOLEAN NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_counted_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (allow_negative OR quantity >= 0)
);

CREATE TABLE stock_movements (
  id              BIGSERIAL PRIMARY KEY,
  stock_item_id   INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('receipt','adjustment','wastage','sale','sale_reversal','count')),
  quantity_delta  NUMERIC(14,3) NOT NULL,
  quantity_after  NUMERIC(14,3) NOT NULL,
  unit_cost_pesewas INTEGER,
  reason          TEXT,
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  supplier_id     INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_item_idx ON stock_movements (stock_item_id, created_at DESC);
CREATE INDEX stock_movements_order_idx ON stock_movements (order_id);

-- Recipe: ingredient quantity consumed per 1 unit of a menu item (optionally per variant).
CREATE TABLE recipe_lines (
  id             SERIAL PRIMARY KEY,
  menu_item_id   INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_id     INTEGER REFERENCES menu_variants(id) ON DELETE CASCADE,
  stock_item_id  INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  quantity       NUMERIC(14,3) NOT NULL CHECK (quantity > 0)
);
CREATE UNIQUE INDEX recipe_lines_unique ON recipe_lines (menu_item_id, COALESCE(variant_id, 0), stock_item_id);

-- ---------------------------------------------------------------------------
-- Support, notifications, audit, rate limiting
-- ---------------------------------------------------------------------------
CREATE TABLE support_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number     TEXT NOT NULL UNIQUE,
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  contact_name    TEXT NOT NULL,
  contact_phone   TEXT,
  contact_email   TEXT,
  category        TEXT NOT NULL CHECK (category IN ('missing_order','incorrect_items','payment','delivery_delay',
                                                    'wrong_address','failed_handoff','cancellation_refund','other')),
  message         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  assigned_to     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX support_cases_status_idx ON support_cases (status, created_at DESC);

CREATE TABLE support_notes (
  id          BIGSERIAL PRIMARY KEY,
  case_id     UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users(id),
  note        TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id           BIGSERIAL PRIMARY KEY,
  order_id     UUID REFERENCES orders(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('in_app','sms','email')),
  template     TEXT NOT NULL,
  dedupe_key   TEXT NOT NULL UNIQUE,
  recipient    TEXT,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  provider_ref TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);
CREATE INDEX notifications_order_idx ON notifications (order_id, created_at);
CREATE INDEX notifications_queue_idx ON notifications (created_at) WHERE status = 'queued';

CREATE TABLE audit_events (
  id             BIGSERIAL PRIMARY KEY,
  actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label    TEXT,
  action         TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT,
  data           JSONB NOT NULL DEFAULT '{}',
  ip             TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id);

CREATE TABLE rate_limits (
  key           TEXT PRIMARY KEY,
  window_start  TIMESTAMPTZ NOT NULL,
  count         INTEGER NOT NULL
);

CREATE TABLE expenses (
  id              SERIAL PRIMARY KEY,
  incurred_on     DATE NOT NULL,
  category        TEXT NOT NULL,
  description     TEXT,
  amount_pesewas  INTEGER NOT NULL CHECK (amount_pesewas > 0),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_date_idx ON expenses (incurred_on);
