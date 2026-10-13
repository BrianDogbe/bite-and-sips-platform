-- Cash a rider has handed back to the restaurant. A rider's balance is the cash they collected minus these hand-ins.
CREATE TABLE rider_cash_handovers (
  id             BIGSERIAL PRIMARY KEY,
  rider_user_id  UUID NOT NULL REFERENCES users(id),
  amount_pesewas INTEGER NOT NULL CHECK (amount_pesewas > 0),
  note           TEXT,
  received_by    UUID NOT NULL REFERENCES users(id),
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rider_cash_handovers_rider_idx ON rider_cash_handovers (rider_user_id, received_at DESC);
ALTER TABLE rider_cash_handovers ENABLE ROW LEVEL SECURITY;
