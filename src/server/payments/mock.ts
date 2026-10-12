import 'server-only';
import { env } from '../env';
import { sql } from '../db';
import { hmacHex, safeEqualHex } from '../ids';
import type { PaymentProvider, VerifyResult, ParsedWebhook } from './provider';

/**
 * MOCK PAYMENT PROVIDER — DEVELOPMENT / TESTING ONLY. NO REAL MONEY MOVES.
 *
 * Simulates a hosted checkout. Its "provider-side" state lives in the `mock_transactions` table.
 * The simulated checkout page (/pay/mock/[reference]) lets a developer approve, decline or
 * leave a payment pending; approving sends a signed webhook into the SAME webhook handler and
 * verification path used for Paystack, so the order/payment logic is exercised end-to-end.
 * Orders paid this way are flagged is_test and excluded from reports.
 */

export function mockSecret() {
  return hmacHex(env().APP_SECRET, 'mock-payment-provider');
}

export function signMockWebhook(body: string) {
  return hmacHex(mockSecret(), body, 'sha512');
}

export function mockProvider(): PaymentProvider {
  return {
    name: 'mock',
    async initialize({ reference, amountPesewas, currency, email }) {
      await sql`
        insert into mock_transactions (reference, amount_pesewas, currency, email, status)
        values (${reference}, ${amountPesewas}, ${currency}, ${email}, 'pending')
        on conflict (reference) do nothing`;
      return { authorizationUrl: `${env().APP_URL}/pay/mock/${encodeURIComponent(reference)}` };
    },
    async verify(reference): Promise<VerifyResult> {
      const rows = await sql<{ reference: string; amountPesewas: number; currency: string; status: string; updatedAt: Date }[]>`
        select reference, amount_pesewas, currency, status, updated_at from mock_transactions where reference = ${reference}`;
      const r = rows[0];
      if (!r) return { status: 'not_found', reference, amountPesewas: null, currency: null, transactionId: null, channel: null, feesPesewas: null, paidAt: null, gatewayResponse: null };
      const status = r.status === 'success' ? 'success' : r.status === 'failed' ? 'failed' : r.status === 'abandoned' ? 'abandoned' : 'pending';
      return {
        status,
        reference,
        amountPesewas: r.amountPesewas,
        currency: r.currency,
        transactionId: `mock_${reference}`,
        channel: 'mock',
        feesPesewas: status === 'success' ? Math.round(r.amountPesewas * 0.0195) : null,
        paidAt: status === 'success' ? r.updatedAt : null,
        gatewayResponse: `Mock ${r.status}`,
      };
    },
    verifyWebhookSignature(rawBody, headers) {
      const sig = headers.get('x-mock-signature');
      return !!sig && safeEqualHex(signMockWebhook(rawBody), sig);
    },
    parseWebhook(rawBody): ParsedWebhook {
      const p = JSON.parse(rawBody) as { event: string; id: string; data: { reference?: string; refundId?: string; status?: string } };
      const kind = (['charge.success', 'charge.failed', 'refund.processed', 'refund.failed'] as const).find((k) => k === p.event) ?? 'other';
      return {
        kind,
        eventType: p.event,
        reference: p.data.reference ?? null,
        refundId: p.data.refundId ?? null,
        dedupeKey: `${p.event}:${p.id}`,
        payload: p as unknown as Record<string, unknown>,
      };
    },
    async createRefund({ reference, amountPesewas }) {
      const id = `mockrf_${reference}_${Date.now()}`;
      await sql`insert into mock_refunds (id, reference, amount_pesewas, status) values (${id}, ${reference}, ${amountPesewas}, 'processed')`;
      // Provider-side the mock refund settles at once, but we report 'pending' so the app exercises
      // the same asynchronous status-sync path used for real providers (webhook / jobs runner).
      return { refundId: id, status: 'pending' };
    },
    async getRefund(refundId) {
      const rows = await sql<{ status: string }[]>`select status from mock_refunds where id = ${refundId}`;
      const s = rows[0]?.status;
      return { refundId, status: s === 'processed' ? 'processed' : s === 'failed' ? 'failed' : 'pending' };
    },
  };
}
