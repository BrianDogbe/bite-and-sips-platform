import 'server-only';
import { env } from '../env';
import { paystackProvider } from './paystack';
import { mockProvider } from './mock';

export type VerifyStatus = 'success' | 'failed' | 'pending' | 'abandoned' | 'reversed' | 'not_found';

export interface VerifyResult {
  status: VerifyStatus;
  reference: string;
  amountPesewas: number | null;
  currency: string | null;
  transactionId: string | null;
  channel: string | null;
  feesPesewas: number | null;
  paidAt: Date | null;
  gatewayResponse: string | null;
}

export type WebhookKind = 'charge.success' | 'charge.failed' | 'refund.processed' | 'refund.failed' | 'refund.pending' | 'other';

export interface ParsedWebhook {
  kind: WebhookKind;
  eventType: string;
  reference: string | null;
  refundId: string | null;
  dedupeKey: string;
  payload: Record<string, unknown>;
}

export interface RefundResult {
  refundId: string | null;
  status: 'pending' | 'processed' | 'failed';
  detail?: string;
}

/** Thrown when we do not know whether the provider performed the operation (timeout / network). */
export class ProviderUncertainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUncertainError';
  }
}

export interface PaymentProvider {
  name: 'paystack' | 'mock';
  initialize(args: {
    reference: string;
    amountPesewas: number;
    currency: 'GHS';
    email: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<VerifyResult>;
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean;
  parseWebhook(rawBody: string): ParsedWebhook;
  createRefund(args: { reference: string; amountPesewas: number; idempotencyKey: string; reason: string }): Promise<RefundResult>;
  getRefund(refundId: string): Promise<RefundResult>;
}

/** The provider used for new online payments, or null when online payment is not configured. */
export function activePaymentProvider(): 'paystack' | 'mock' | null {
  const p = env().PAYMENT_PROVIDER;
  return p === 'none' ? null : p;
}

export function getProvider(name: 'paystack' | 'mock'): PaymentProvider {
  if (name === 'paystack') return paystackProvider();
  if (name === 'mock') {
    const e = env();
    if (e.NODE_ENV === 'production' && e.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION !== 'true') {
      throw new Error('Mock payment provider is disabled in production');
    }
    return mockProvider();
  }
  throw new Error(`Unknown payment provider ${name}`);
}
