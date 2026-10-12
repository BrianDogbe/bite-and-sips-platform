'use server';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { sql } from '@/server/db';
import { env } from '@/server/env';
import { signMockWebhook } from '@/server/payments/mock';
import { handlePaymentWebhook } from '@/server/payments/service';

/** MOCK PROVIDER ONLY: simulate what the customer does on the hosted payment page. */
export async function simulateMockPayment(reference: string, outcome: 'success' | 'failed' | 'abandoned' | 'pending') {
  const e = env();
  if (e.PAYMENT_PROVIDER !== 'mock' || (e.NODE_ENV === 'production' && e.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION !== 'true')) throw new Error('Mock payments are disabled');
  const [tx] = await sql<{ status: string }[]>`select status from mock_transactions where reference = ${reference}`;
  if (!tx) throw new Error('Unknown mock transaction');
  if (outcome !== 'pending' && tx.status === 'pending') {
    await sql`update mock_transactions set status = ${outcome}, updated_at = now() where reference = ${reference}`;
    if (outcome !== 'abandoned') {
      // Deliver a signed webhook through the same handler a real provider would call.
      const body = JSON.stringify({ event: outcome === 'success' ? 'charge.success' : 'charge.failed', id: randomUUID(), data: { reference } });
      await handlePaymentWebhook('mock', body, new Headers({ 'x-mock-signature': signMockWebhook(body) }));
    }
  }
  redirect(`/checkout/return?reference=${encodeURIComponent(reference)}`);
}
