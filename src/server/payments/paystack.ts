import 'server-only';
import { env } from '../env';
import { hmacHex, safeEqualHex } from '../ids';
import { log } from '../log';
import { ProviderUncertainError, type PaymentProvider, type VerifyResult, type ParsedWebhook, type RefundResult } from './provider';

/**
 * Paystack adapter (Ghana: Mobile Money + cards, currency GHS, amounts in pesewas).
 * Based on Paystack's public API reference:
 *   POST /transaction/initialize, GET /transaction/verify/:reference,
 *   POST /refund, GET /refund/:id, webhooks signed with HMAC-SHA512 of the raw body
 *   using the secret key (header `x-paystack-signature`).
 * Status: implemented and unit-tested against recorded/sample payloads; NOT yet exercised
 * against a live Paystack test account (no credentials available). See docs/PAYMENTS.md.
 */

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const e = env();
  if (!e.PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  let res: Response;
  try {
    res = await fetch(`${e.PAYSTACK_BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${e.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
  } catch (err) {
    // Network error / timeout: the provider may or may not have acted.
    throw new ProviderUncertainError(`Paystack request failed: ${(err as Error).message}`);
  }
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: unknown } | null;
  if (res.status >= 500) throw new ProviderUncertainError(`Paystack HTTP ${res.status}`);
  if (!res.ok || !json || json.status !== true) {
    const err = new Error(`Paystack error: ${json?.message ?? `HTTP ${res.status}`}`) as Error & { httpStatus?: number };
    err.httpStatus = res.status;
    throw err;
  }
  return json.data as T;
}

interface PsTransaction {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel: string | null;
  fees: number | null;
  paid_at: string | null;
  gateway_response: string | null;
}

export function mapPaystackTransaction(d: PsTransaction): VerifyResult {
  const map: Record<string, VerifyResult['status']> = {
    success: 'success',
    failed: 'failed',
    abandoned: 'abandoned',
    reversed: 'reversed',
    ongoing: 'pending',
    pending: 'pending',
    processing: 'pending',
    queued: 'pending',
    send_otp: 'pending',
    send_birthday: 'pending',
  };
  return {
    status: map[d.status] ?? 'pending',
    reference: d.reference,
    amountPesewas: typeof d.amount === 'number' ? d.amount : null,
    currency: d.currency ?? null,
    transactionId: d.id != null ? String(d.id) : null,
    channel: d.channel ?? null,
    feesPesewas: typeof d.fees === 'number' ? d.fees : null,
    paidAt: d.paid_at ? new Date(d.paid_at) : null,
    gatewayResponse: d.gateway_response ?? null,
  };
}

export function parsePaystackWebhook(rawBody: string): ParsedWebhook {
  const payload = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
  const event = String(payload.event ?? 'unknown');
  const data = payload.data ?? {};
  let kind: ParsedWebhook['kind'] = 'other';
  if (event === 'charge.success') kind = 'charge.success';
  else if (event === 'charge.failed') kind = 'charge.failed';
  else if (event === 'refund.processed') kind = 'refund.processed';
  else if (event === 'refund.failed') kind = 'refund.failed';
  else if (event === 'refund.pending' || event === 'refund.processing') kind = 'refund.pending';

  const reference =
    (typeof data.reference === 'string' && data.reference) ||
    (typeof data.transaction_reference === 'string' && data.transaction_reference) ||
    (typeof (data.transaction as Record<string, unknown> | undefined)?.reference === 'string'
      ? ((data.transaction as Record<string, unknown>).reference as string)
      : null);
  const refundId = kind.startsWith('refund') && data.id != null ? String(data.id) : kind.startsWith('refund') && data.refund_reference ? String(data.refund_reference) : null;
  const dedupeKey = `${event}:${data.id ?? ''}:${reference ?? ''}:${data.status ?? ''}`;
  return { kind, eventType: event, reference: reference || null, refundId, dedupeKey, payload: payload as Record<string, unknown> };
}

export function paystackProvider(): PaymentProvider {
  return {
    name: 'paystack',
    async initialize({ reference, amountPesewas, currency, email, callbackUrl, metadata }) {
      const data = await call<{ authorization_url: string; reference: string }>('POST', '/transaction/initialize', {
        email,
        amount: String(amountPesewas),
        currency,
        reference,
        callback_url: callbackUrl,
        channels: ['mobile_money', 'card'],
        metadata,
      });
      return { authorizationUrl: data.authorization_url };
    },
    async verify(reference) {
      try {
        const d = await call<PsTransaction>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
        return mapPaystackTransaction(d);
      } catch (e) {
        const httpStatus = (e as { httpStatus?: number }).httpStatus;
        if (httpStatus === 404 || httpStatus === 400) {
          return { status: 'not_found', reference, amountPesewas: null, currency: null, transactionId: null, channel: null, feesPesewas: null, paidAt: null, gatewayResponse: null };
        }
        throw e;
      }
    },
    verifyWebhookSignature(rawBody, headers) {
      const sig = headers.get('x-paystack-signature');
      const secret = env().PAYSTACK_SECRET_KEY;
      if (!sig || !secret) return false;
      return safeEqualHex(hmacHex(secret, rawBody, 'sha512'), sig.trim().toLowerCase());
    },
    parseWebhook: parsePaystackWebhook,
    async createRefund({ reference, amountPesewas, reason }) {
      const d = await call<{ id?: number; status?: string; transaction?: { reference?: string } }>('POST', '/refund', {
        transaction: reference,
        amount: amountPesewas,
        merchant_note: reason.slice(0, 200),
      });
      return { refundId: d.id != null ? String(d.id) : null, status: mapRefundStatus(d.status) };
    },
    async getRefund(refundId) {
      const d = await call<{ status?: string }>('GET', `/refund/${encodeURIComponent(refundId)}`);
      return { refundId, status: mapRefundStatus(d.status) };
    },
  };
}

function mapRefundStatus(s: string | undefined): RefundResult['status'] {
  if (s === 'processed') return 'processed';
  if (s === 'failed' || s === 'reversed') return 'failed';
  if (s && !['pending', 'processing', 'needs-attention'].includes(s)) log.warn('paystack_unknown_refund_status', { status: s });
  return 'pending';
}
