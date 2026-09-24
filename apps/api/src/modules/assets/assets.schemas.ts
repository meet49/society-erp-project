import { z } from 'zod';
import { AssetStatus, ContractStatus, booleanQuerySchema, objectIdSchema, paginationQuerySchema } from '@society-erp/shared';
import { BillingCycles, ContractTypes } from '../../models/contract.model';
import { MaintenanceTypes } from '../../models/asset.model';
import { StockReferenceTypes, StockTransactionTypes } from '../../models/inventory.model';

const attachment = z.object({ name: z.string().trim().min(1).max(200), storageKey: z.string().trim().min(1).max(300), mimeType: z.string().trim().max(100).optional(), size: z.coerce.number().int().min(0).optional() });

// ------------------------------------------------------------------ contracts
export const contractCreateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  type: z.enum(ContractTypes).default('SERVICE'),
  vendorId: objectIdSchema,
  categoryKey: z.string().trim().max(40).optional(),
  description: z.string().trim().max(2000).optional(),
  scope: z.string().trim().max(4000).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  value: z.coerce.number().min(0).default(0),
  billingCycle: z.enum(BillingCycles).default('ANNUAL'),
  amountPerCycle: z.coerce.number().min(0).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
  autoRenew: z.boolean().optional(),
  noticePeriodDays: z.coerce.number().int().min(0).max(365).optional(),
  documents: z.array(attachment).max(20).optional(),
  contact: z.object({ name: z.string().trim().max(120).optional(), phone: z.string().trim().max(20).optional(), email: z.string().trim().email().max(254).optional().or(z.literal('')) }).optional(),
  assetIds: z.array(objectIdSchema).max(200).optional(),
  visitFrequencyMonths: z.coerce.number().int().min(0).max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
  activate: z.boolean().optional(),
}).refine((v) => v.endDate > v.startDate, { message: 'End date must be after the start date', path: ['endDate'] });
export const contractUpdateSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  type: z.enum(ContractTypes).optional(),
  vendorId: objectIdSchema.optional(),
  categoryKey: z.string().trim().max(40).optional(),
  description: z.string().trim().max(2000).optional(),
  scope: z.string().trim().max(4000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  value: z.coerce.number().min(0).optional(),
  billingCycle: z.enum(BillingCycles).optional(),
  amountPerCycle: z.coerce.number().min(0).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
  autoRenew: z.boolean().optional(),
  noticePeriodDays: z.coerce.number().int().min(0).max(365).optional(),
  documents: z.array(attachment).max(20).optional(),
  contact: z.object({ name: z.string().trim().max(120).optional(), phone: z.string().trim().max(20).optional(), email: z.string().trim().email().max(254).optional().or(z.literal('')) }).optional(),
  assetIds: z.array(objectIdSchema).max(200).optional(),
  visitFrequencyMonths: z.coerce.number().int().min(0).max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export const contractListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ContractStatus).optional(),
  type: z.enum(ContractTypes).optional(),
  vendorId: objectIdSchema.optional(),
  assetId: objectIdSchema.optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  activeOnly: booleanQuerySchema.optional(),
});
export const contractRenewSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date(),
  value: z.coerce.number().min(0).optional(),
  amountPerCycle: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional(),
  documents: z.array(attachment).max(20).optional(),
});
export const contractTerminateSchema = z.object({ reason: z.string().trim().min(2).max(500), at: z.coerce.date().optional() });
export const contractVisitSchema = z.object({ at: z.coerce.date().optional(), note: z.string().trim().max(2000).optional(), assetIds: z.array(objectIdSchema).max(200).optional(), attachments: z.array(attachment).max(10).optional() });
export const contractPaymentSchema = z.object({
  amount: z.coerce.number().min(0.01),
  billDate: z.coerce.date().optional(),
  billNumber: z.string().trim().max(60).optional(),
  description: z.string().trim().max(1000).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  submit: z.boolean().optional(),
});
export const contractsConfigSchema = z.object({
  reminderDays: z.array(z.coerce.number().int().min(0).max(365)).max(10),
  visitReminderDays: z.coerce.number().int().min(0).max(90),
  defaultNoticePeriodDays: z.coerce.number().int().min(0).max(365),
}).partial();

// ------------------------------------------------------------------ assets
export const assetCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  categoryKey: z.string().trim().min(1).max(40),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  buildingId: objectIdSchema.nullable().optional(),
  make: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  serialNumber: z.string().trim().max(80).optional(),
  purchaseDate: z.coerce.date().nullable().optional(),
  purchaseCost: z.coerce.number().min(0).optional(),
  vendorId: objectIdSchema.nullable().optional(),
  vendorName: z.string().trim().max(120).optional(),
  invoiceNumber: z.string().trim().max(60).optional(),
  warrantyUntil: z.coerce.date().nullable().optional(),
  expectedLifeYears: z.coerce.number().min(0).max(100).optional(),
  salvageValue: z.coerce.number().min(0).optional(),
  status: z.enum(AssetStatus).optional(),
  contractId: objectIdSchema.nullable().optional(),
  maintenanceIntervalMonths: z.coerce.number().int().min(0).max(120).optional(),
  nextMaintenanceDue: z.coerce.date().nullable().optional(),
  photos: z.array(attachment).max(10).optional(),
  documents: z.array(attachment).max(20).optional(),
  custodian: z.string().trim().max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
});
export const assetUpdateSchema = assetCreateSchema.partial();
export const assetListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(AssetStatus).optional(),
  categoryKey: z.string().max(40).optional(),
  buildingId: objectIdSchema.optional(),
  contractId: objectIdSchema.optional(),
  maintenanceDue: booleanQuerySchema.optional(),
  warrantyExpiring: booleanQuerySchema.optional(),
  includeDisposed: booleanQuerySchema.optional(),
});
export const assetStatusSchema = z.object({
  status: z.enum(AssetStatus),
  note: z.string().trim().max(500).optional(),
  disposal: z.object({ at: z.coerce.date().optional(), reason: z.string().trim().max(500).optional(), amount: z.coerce.number().min(0).optional() }).optional(),
});
export const assetMaintenanceSchema = z.object({
  at: z.coerce.date().optional(),
  type: z.enum(MaintenanceTypes).default('PREVENTIVE'),
  description: z.string().trim().min(2).max(2000),
  cost: z.coerce.number().min(0).optional(),
  vendorId: objectIdSchema.nullable().optional(),
  vendorName: z.string().trim().max(120).optional(),
  createExpense: z.boolean().optional(),
  expenseCategoryKey: z.string().trim().max(40).optional(),
  downtimeHours: z.coerce.number().min(0).max(10_000).optional(),
  attachments: z.array(attachment).max(10).optional(),
  nextDue: z.coerce.date().nullable().optional(),
  backInService: z.boolean().optional(),
});
export const assetsConfigSchema = z.object({
  maintenanceReminderDays: z.coerce.number().int().min(0).max(180),
  warrantyReminderDays: z.coerce.number().int().min(0).max(365),
  defaultLifeYears: z.coerce.number().min(1).max(100),
}).partial();

// ------------------------------------------------------------------ inventory
export const itemCreateSchema = z.object({
  sku: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(2).max(160),
  categoryKey: z.string().trim().min(1).max(40),
  description: z.string().trim().max(1000).optional(),
  unit: z.string().trim().max(20).optional(),
  minimumLevel: z.coerce.number().min(0).optional(),
  reorderQuantity: z.coerce.number().min(0).optional(),
  location: z.string().trim().max(120).optional(),
  unitCost: z.coerce.number().min(0).optional(),
  vendorId: objectIdSchema.nullable().optional(),
  openingStock: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const itemUpdateSchema = itemCreateSchema.omit({ openingStock: true }).partial();
export const itemListQuerySchema = paginationQuerySchema.extend({
  categoryKey: z.string().max(40).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  lowStockOnly: booleanQuerySchema.optional(),
});
export const stockTransactionSchema = z.object({
  type: z.enum(StockTransactionTypes),
  /** IN / OUT: positive quantity moved. ADJUST: the counted stock on hand. */
  quantity: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0).optional(),
  reference: z.object({ type: z.enum(StockReferenceTypes).default('MANUAL'), id: objectIdSchema.nullable().optional(), label: z.string().trim().max(120).optional() }).optional(),
  issuedTo: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  at: z.coerce.date().optional(),
  clientRef: z.string().trim().max(64).optional(),
});
export const transactionListQuerySchema = paginationQuerySchema.extend({
  itemId: objectIdSchema.optional(),
  type: z.enum(StockTransactionTypes).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const inventoryConfigSchema = z.object({
  lowStockAlertRoleKeys: z.array(z.string().trim().min(1).max(60)).max(20),
  realertAfterDays: z.coerce.number().int().min(1).max(90),
  allowNegativeStock: z.boolean(),
}).partial();
