import { z } from 'zod';
import { PaymentMethods, emailSchema, objectIdSchema, paginationQuerySchema, phoneSchema, booleanQuerySchema } from '@society-erp/shared';
import { VendorStatus } from '../../models/vendor.model';
import { PurchaseOrderStatus } from '../../models/purchase-order.model';

const attachment = z.object({ name: z.string().trim().min(1).max(200), storageKey: z.string().trim().min(1).max(300), mimeType: z.string().trim().max(100).optional(), size: z.coerce.number().int().min(0).optional() });

// ------------------------------------------------------------------ vendors
export const vendorCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(20).optional(),
  categoryKey: z.string().trim().max(40).optional(),
  contactName: z.string().trim().max(120).optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  altPhone: phoneSchema.optional().or(z.literal('')),
  email: emailSchema.optional().or(z.literal('')),
  address: z.object({ line1: z.string().trim().max(200).optional(), line2: z.string().trim().max(200).optional(), city: z.string().trim().max(80).optional(), state: z.string().trim().max(80).optional(), pincode: z.string().trim().max(12).optional() }).optional(),
  gstin: z.string().trim().max(20).optional(),
  pan: z.string().trim().max(12).optional(),
  bank: z.object({ accountHolder: z.string().trim().max(120).optional(), accountNumber: z.string().trim().max(30).optional(), ifsc: z.string().trim().max(20).optional(), upiId: z.string().trim().max(80).optional() }).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().trim().max(30)).max(10).default([]),
  notes: z.string().trim().max(1000).optional(),
});
export const vendorUpdateSchema = vendorCreateSchema.partial().extend({ status: z.enum(VendorStatus).optional() });
export const vendorListQuerySchema = paginationQuerySchema.extend({ categoryKey: z.string().max(40).optional(), status: z.enum(VendorStatus).optional() });

// ------------------------------------------------------------------ expenses
export const expenseCreateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  vendorId: objectIdSchema.optional().nullable(),
  vendorName: z.string().trim().max(120).optional(),
  categoryKey: z.string().trim().max(40).optional(),
  accountCode: z.string().trim().max(20).optional(),
  fundKey: z.string().trim().max(30).optional().nullable(),
  billNumber: z.string().trim().max(60).optional(),
  billDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  amount: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  tdsAmount: z.coerce.number().min(0).default(0),
  attachments: z.array(attachment).max(10).default([]),
  purchaseOrderId: objectIdSchema.optional().nullable(),
  assetId: objectIdSchema.optional().nullable(),
  contractId: objectIdSchema.optional().nullable(),
  submit: z.boolean().default(false),
});
export const expenseUpdateSchema = expenseCreateSchema.omit({ submit: true }).partial();
export const expenseListQuerySchema = paginationQuerySchema.extend({
  approvalStatus: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional(),
  vendorId: objectIdSchema.optional(),
  categoryKey: z.string().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  overdueOnly: booleanQuerySchema,
});
export const expensePaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  date: z.coerce.date().default(() => new Date()),
  method: z.enum(PaymentMethods),
  reference: z.string().trim().max(120).optional(),
  bankAccountId: objectIdSchema.optional().nullable(),
  notes: z.string().trim().max(300).optional(),
});
export const rejectSchema = z.object({ reason: z.string().trim().min(2).max(500) });

// ------------------------------------------------------------------ purchase orders
const poItem = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().max(20).default('nos'),
  rate: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  inventoryItemId: objectIdSchema.optional().nullable(),
});
export const poCreateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  vendorId: objectIdSchema.optional().nullable(),
  vendorName: z.string().trim().max(120).optional(),
  categoryKey: z.string().trim().max(40).optional(),
  justification: z.string().trim().max(1000).optional(),
  items: z.array(poItem).min(1).max(50),
  quotes: z.array(z.object({ vendorName: z.string().trim().min(1).max(120), amount: z.coerce.number().min(0), attachment: attachment.optional(), selected: z.boolean().default(false) })).max(10).default([]),
  expectedDate: z.coerce.date().optional(),
  attachments: z.array(attachment).max(10).default([]),
  notes: z.string().trim().max(1000).optional(),
  submit: z.boolean().default(false),
});
export const poUpdateSchema = poCreateSchema.omit({ submit: true }).partial();
export const poListQuerySchema = paginationQuerySchema.extend({ status: z.enum(PurchaseOrderStatus).optional(), vendorId: objectIdSchema.optional() });
export const poReceiveSchema = z.object({ items: z.array(z.object({ itemId: objectIdSchema, receivedQuantity: z.coerce.number().min(0) })).min(1), note: z.string().trim().max(300).optional() });
export const poConvertSchema = z.object({ billNumber: z.string().trim().max(60).optional(), billDate: z.coerce.date().optional(), dueDate: z.coerce.date().optional(), amount: z.coerce.number().min(0).optional(), accountCode: z.string().trim().max(20).optional() });
