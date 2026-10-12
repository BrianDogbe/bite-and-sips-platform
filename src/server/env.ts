import 'server-only';
import { z } from 'zod';

/**
 * Server-only configuration. Nothing here is ever sent to the browser.
 * Variables prefixed NEXT_PUBLIC_ are the only ones the client bundle can see,
 * and none of them are secrets (see docs/ENVIRONMENT.md).
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_SSL: z.enum(['disable', 'require', 'prefer']).default('prefer'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** 32+ random bytes, used for HMAC of delivery PINs and other server-side secrets. */
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  /** Comma separated host → portal mappings, e.g. admin.biteandsips.com. Optional. */
  ADMIN_HOST: z.string().optional(),
  KITCHEN_HOST: z.string().optional(),
  RIDER_HOST: z.string().optional(),

  PAYMENT_PROVIDER: z.enum(['paystack', 'mock', 'none']).default('mock'),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
  /** Allow the mock provider in production builds. Never set this on the live site. */
  ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: z.enum(['true', 'false']).default('false'),

  NOTIFY_SMS_PROVIDER: z.enum(['log', 'hubtel', 'none']).default('log'),
  HUBTEL_SMS_CLIENT_ID: z.string().optional(),
  HUBTEL_SMS_CLIENT_SECRET: z.string().optional(),
  HUBTEL_SMS_SENDER: z.string().max(11).optional(),
  NOTIFY_EMAIL_PROVIDER: z.enum(['log', 'resend', 'none']).default('log'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  DELIVERY_SANDBOX_PROVIDER: z.enum(['true', 'false']).default('false'),

  CRON_SECRET: z.string().min(16).optional(),
  SCRYPT_COST: z.coerce.number().int().optional(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server environment configuration: ${issues}`);
  }
  const e = parsed.data;
  if (e.PAYMENT_PROVIDER === 'paystack' && !e.PAYSTACK_SECRET_KEY) {
    throw new Error('PAYMENT_PROVIDER=paystack requires PAYSTACK_SECRET_KEY');
  }
  if (e.NODE_ENV === 'production' && e.PAYMENT_PROVIDER === 'mock' && e.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION !== 'true') {
    throw new Error('The mock payment provider is disabled in production. Configure PAYMENT_PROVIDER=paystack (or none for cash only).');
  }
  cached = e;
  return e;
}

/** For tests only. */
export function resetEnvCache() {
  cached = null;
}

export function isProduction() {
  return env().NODE_ENV === 'production';
}
