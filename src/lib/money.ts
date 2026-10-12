/**
 * Money helpers. All amounts are integer pesewas (1 GHS = 100 pesewas).
 * Safe to import from client and server code.
 */
export type Pesewas = number;

export function assertPesewas(n: number): Pesewas {
  if (!Number.isSafeInteger(n)) throw new Error(`Invalid money amount: ${n}`);
  return n;
}

const fmt = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 });

/** 1250 -> "GH₵12.50" (exact rendering depends on the runtime's ICU data). */
export function formatGHS(p: Pesewas): string {
  return fmt.format(p / 100);
}

/** Parse a cedi amount typed by staff ("12.5", "12.50", "1,200") into pesewas. Returns null when invalid. */
export function parseCedisToPesewas(input: string): Pesewas | null {
  const cleaned = input.replace(/[,\s]/g, '').replace(/^GH(S|₵)?/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const p = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(p) ? p : null;
}

export function pesewasToCedisString(p: Pesewas): string {
  const sign = p < 0 ? '-' : '';
  const a = Math.abs(p);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/** Percentage of an amount in basis points (1% = 100 bps), rounded half-up to the pesewa. */
export function percentOf(amount: Pesewas, basisPoints: number): Pesewas {
  if (basisPoints <= 0) return 0;
  return Math.floor((amount * basisPoints + 5000) / 10000);
}
