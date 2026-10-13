-- Distance-based delivery fee: fee = base (fee_pesewas) + per_km_pesewas × distance from the restaurant, optionally capped.
-- per_km_pesewas = 0 keeps the old flat-fee behaviour for existing zones.
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS per_km_pesewas INTEGER NOT NULL DEFAULT 0 CHECK (per_km_pesewas >= 0);
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS max_fee_pesewas INTEGER CHECK (max_fee_pesewas IS NULL OR max_fee_pesewas >= 0);

-- Placeholder rates for the demo Tema zone only (GH₵8 base + GH₵2 per km, max GH₵40). The owner must set the real rates.
UPDATE delivery_zones
   SET fee_pesewas = 800, per_km_pesewas = 200, max_fee_pesewas = 4000
 WHERE is_demo AND name LIKE 'Tema%' AND per_km_pesewas = 0;
