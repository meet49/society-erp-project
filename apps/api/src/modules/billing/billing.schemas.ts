import { z } from 'zod';
import { InvoiceStatus, booleanQuerySchema, objectIdSchema, paginationQuerySchema } from '@society-erp/shared';
import { ChargeHeadTypes } from '../../models/charge-head.model';

export const chargeHeadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().max(300).optional(),
  type: z.enum(ChargeHeadTypes),
  amount: z.coerce.number().min(0).default(0),
  rate: z.coerce.number().min(0).default(0),
  formula: z.string().trim().max(200).optional(),
  meterType: z.string().trim().max(30).optional(),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  ledgerAccountCode: z.string().trim().max(20).optional(),
  fundKey: z.string().trim().max(30).optional(),
  applicableUnitTypes: z.array(z.string().trim().max(30)).max(20).default([]),
  applicableBuildingIds: z.array(objectIdSchema).max(100).default([]),
  frequency: z.enum(['RECURRING', 'ONE_TIME']).default('RECURRING'),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});
export const chargeHeadUpdateSchema = chargeHeadSchema.partial();

export const billingConfigSchema = z.object({
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL']),
  dueDay: z.coerce.number().int().min(1).max(28),
  gracePeriodDays: z.coerce.number().int().min(0).max(90),
  penalty: z.object({ type: z.enum(['FLAT', 'PERCENT', 'INTEREST_PA']), value: z.coerce.number().min(0), applyAfterDays: z.coerce.number().int().min(0).default(0), maxAmount: z.coerce.number().min(0).nullable().optional() }),
  invoicePrefix: z.string().trim().max(10),
  receiptPrefix: z.string().trim().max(10),
  taxRate: z.coerce.number().min(0).max(100),
  taxLabel: z.string().trim().max(20),
  roundOff: z.boolean(),
  autoIssue: z.boolean(),
  notifyOnIssue: z.boolean(),
  notes: z.string().trim().max(500).optional(),
  carryForwardBalance: z.boolean(),
  reminderDaysBeforeDue: z.array(z.coerce.number().int().min(0).max(60)).max(5).optional(),
  reminderDaysAfterDue: z.array(z.coerce.number().int().min(0).max(120)).max(5).optional(),
});

export const runCreateSchema = z.object({
  periodFrom: z.coerce.date(),
  periodTo: z.coerce.date(),
  label: z.string().trim().max(60).optional(),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'ADHOC']).optional(),
  chargeHeadIds: z.array(objectIdSchema).max(100).optional(),
  buildingIds: z.array(objectIdSchema).max(100).optional(),
  unitTypes: z.array(z.string().max(30)).max(20).optional(),
  unitIds: z.array(objectIdSchema).max(5000).optional(),
  dueDate: z.coerce.date().optional(),
  includePreviousBalance: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
  issueImmediately: z.boolean().default(false),
});

export const runListQuerySchema = paginationQuerySchema.extend({ status: z.enum(['DRAFT', 'ISSUED', 'CANCELLED']).optional() });

const lineItemInput = z.object({
  chargeHeadId: objectIdSchema.optional(),
  description: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().min(0).default(1),
  rate: z.coerce.number().min(0).default(0),
  amount: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  ledgerAccountCode: z.string().trim().max(20).optional(),
  fundKey: z.string().trim().max(30).optional(),
});

export const invoiceCreateSchema = z.object({
  unitId: objectIdSchema,
  residentId: objectIdSchema.optional(),
  periodFrom: z.coerce.date().optional(),
  periodTo: z.coerce.date().optional(),
  label: z.string().trim().max(60).optional(),
  lineItems: z.array(lineItemInput).min(1).max(50),
  discount: z.object({ amount: z.coerce.number().min(0), reason: z.string().trim().max(200).optional() }).optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
  issueImmediately: z.boolean().default(false),
});
export const invoiceUpdateSchema = invoiceCreateSchema.omit({ unitId: true, issueImmediately: true }).partial();

export const invoiceListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(Object.values(InvoiceStatus) as [string, ...string[]]).optional(),
  unitId: objectIdSchema.optional(),
  buildingId: objectIdSchema.optional(),
  billingRunId: objectIdSchema.optional(),
  overdueOnly: booleanQuerySchema,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const cancelSchema = z.object({ reason: z.string().trim().min(2).max(500) });
export const ledgerQuerySchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

export const meterReadingSchema = z.object({
  unitId: objectIdSchema,
  meterType: z.string().trim().min(1).max(30),
  meterNumber: z.string().trim().max(60).optional(),
  currentReading: z.coerce.number().min(0),
  previousReading: z.coerce.number().min(0).optional(),
  readingDate: z.coerce.date().default(() => new Date()),
  periodFrom: z.coerce.date().optional(),
  periodTo: z.coerce.date().optional(),
  notes: z.string().trim().max(300).optional(),
});
export const meterBulkSchema = z.object({ readings: z.array(meterReadingSchema).min(1).max(2000) });
export const meterImportSchema = z.object({ csv: z.string().min(1).max(2_000_000), meterType: z.string().trim().max(30).optional(), readingDate: z.coerce.date().optional() });
export const meterListQuerySchema = paginationQuerySchema.extend({ unitId: objectIdSchema.optional(), meterType: z.string().max(30).optional(), billed: booleanQuerySchema, from: z.coerce.date().optional(), to: z.coerce.date().optional() });
