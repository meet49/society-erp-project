import { z } from 'zod';
import { PaymentMethods, PaymentStatus, booleanQuerySchema, objectIdSchema, paginationQuerySchema } from '@society-erp/shared';

export const recordPaymentSchema = z.object({
  unitId: objectIdSchema,
  amount: z.coerce.number().positive().max(100_000_000),
  method: z.enum(PaymentMethods),
  receivedAt: z.coerce.date().default(() => new Date()),
  reference: z.string().trim().max(120).optional(),
  payerName: z.string().trim().max(120).optional(),
  invoiceIds: z.array(objectIdSchema).max(100).optional(),
  bankAccountId: objectIdSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const paymentListQuerySchema = paginationQuerySchema.extend({
  unitId: objectIdSchema.optional(),
  status: z.enum(Object.values(PaymentStatus) as [string, ...string[]]).optional(),
  method: z.enum(PaymentMethods).optional(),
  provider: z.string().max(20).optional(),
  reconciled: booleanQuerySchema,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const createOrderSchema = z
  .object({
    unitId: objectIdSchema.optional(),
    invoiceIds: z.array(objectIdSchema).max(50).optional(),
    amount: z.coerce.number().positive().max(100_000_000).optional(),
  })
  .refine((v) => !(v.invoiceIds?.length && v.amount), { message: 'Pass either invoiceIds or an advance amount, not both', path: ['amount'] });

export const verifyOrderSchema = z.object({
  paymentId: z.string().trim().min(3).max(120),
  signature: z.string().trim().min(8).max(256),
});

export const refundSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  reason: z.string().trim().min(2).max(500),
});

export const reconcileSchema = z.object({
  reconciled: z.boolean(),
  bankTransactionId: objectIdSchema.optional(),
  note: z.string().trim().max(300).optional(),
});

export const gatewayConfigSchema = z.object({
  provider: z.enum(['razorpay', 'mock']),
  enabled: z.boolean(),
  displayName: z.string().trim().max(60).optional(),
  keyId: z.string().trim().max(120).optional(),
  /** leave empty to keep the stored secret */
  keySecret: z.string().trim().max(200).optional(),
  webhookSecret: z.string().trim().max(200).optional(),
  testMode: z.boolean().default(true),
  allowedMethods: z.array(z.enum(['UPI', 'CARD', 'NETBANKING', 'WALLET'])).min(1).default(['UPI', 'CARD', 'NETBANKING', 'WALLET']),
  convenienceFeePercent: z.coerce.number().min(0).max(10).default(0),
});

export const subscriptionOrderSchema = z.object({ billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional() });

export const recordPlatformPaymentSchema = z.object({
  societyId: objectIdSchema,
  amount: z.coerce.number().positive(),
  method: z.enum(['BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI', 'OTHER']),
  reference: z.string().trim().max(120).optional(),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional(),
  paidAt: z.coerce.date().optional(),
  note: z.string().trim().max(300).optional(),
});
