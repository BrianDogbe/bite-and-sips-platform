-- Provider-side state for the MOCK payment provider (development/testing only).
-- These tables are never used when PAYMENT_PROVIDER=paystack. They can be left empty in production.
CREATE TABLE mock_transactions (
  reference       TEXT PRIMARY KEY,
  amount_pesewas  INTEGER NOT NULL,
  currency        TEXT NOT NULL,
  email           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','abandoned')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mock_refunds (
  id              TEXT PRIMARY KEY,
  reference       TEXT NOT NULL,
  amount_pesewas  INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_refunds ENABLE ROW LEVEL SECURITY;
