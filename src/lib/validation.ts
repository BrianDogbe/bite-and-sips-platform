import { z } from 'zod';

/** Shared request schemas (client + server). The server is always the final authority. */

export const cartLineSchema = z.object({
  menuItemId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  modifierIds: z.array(z.number().int().positive()).max(30).default([]),
  quantity: z.number().int().min(1).max(50),
  instructions: z.string().trim().max(200).optional().nullable(),
});
export type CartLineInput = z.infer<typeof cartLineSchema>;

export const fulfillmentInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pickup'),
    slot: z.string().datetime().nullable().optional(), // null = ASAP
  }),
  z.object({
    type: z.literal('delivery'),
    slot: z.string().datetime().nullable().optional(),
    addressLine: z.string().trim().min(3).max(200),
    landmark: z.string().trim().max(200).optional().nullable(),
    instructions: z.string().trim().max(300).optional().nullable(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    zoneId: z.number().int().positive().nullable().optional(),
  }),
]);
export type FulfillmentInput = z.infer<typeof fulfillmentInputSchema>;

export const quoteRequestSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(30),
  fulfillment: z
    .object({
      type: z.enum(['pickup', 'delivery']),
      lat: z.number().min(-90).max(90).nullable().optional(),
      lng: z.number().min(-180).max(180).nullable().optional(),
      zoneId: z.number().int().positive().nullable().optional(),
    })
    .optional(),
  promoCode: z.string().trim().max(40).optional().nullable(),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const ghanaPhoneRegex = /^(?:\+?233|0)\d{9}$/;

export const customerContactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s-]/g, ''))
    .refine((s) => ghanaPhoneRegex.test(s), 'Enter a valid Ghana phone number, e.g. 024 123 4567'),
  email: z.string().trim().email('Enter a valid email').max(120).optional().nullable().or(z.literal('')),
});

export const createOrderSchema = z.object({
  idempotencyKey: z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/),
  items: z.array(cartLineSchema).min(1).max(30),
  contact: customerContactSchema,
  fulfillment: fulfillmentInputSchema,
  paymentMethod: z.enum(['online', 'cash']),
  promoCode: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms to continue' }) }),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const supportCaseSchema = z.object({
  orderNumber: z.string().trim().max(20).optional().nullable(),
  trackingToken: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(120).optional().nullable().or(z.literal('')),
  category: z.enum(['missing_order', 'incorrect_items', 'payment', 'delivery_delay', 'wrong_address', 'failed_handoff', 'cancellation_refund', 'other']),
  message: z.string().trim().min(5).max(2000),
});

export const locationUpdateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).nullable().optional(),
  recordedAt: z.string().datetime(),
});
