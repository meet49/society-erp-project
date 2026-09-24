import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { attachmentSchema, baseOptions, ObjectIdType, societyField } from './base';

export const PurchaseOrderStatus = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'] as const;

const poItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 200 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, trim: true, default: 'nos' },
    rate: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    receivedQuantity: { type: Number, default: 0 },
    inventoryItemId: { type: ObjectIdType, ref: 'InventoryItem', default: null },
  },
  { _id: true },
);

/** Purchase requisition → order: quotes, approval workflow, receipt of goods and conversion into an expense. */
const purchaseOrderSchema = new Schema(
  {
    societyId: societyField,
    poNumber: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    vendorId: { type: ObjectIdType, ref: 'Vendor', default: null, index: true },
    vendorName: { type: String, trim: true },
    categoryKey: { type: String, trim: true, uppercase: true },
    justification: { type: String, trim: true, maxlength: 1000 },
    items: { type: [poItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    quotes: { type: [{ vendorName: String, amount: Number, attachment: attachmentSchema, selected: Boolean }], default: [] },
    status: { type: String, enum: PurchaseOrderStatus, default: 'DRAFT', index: true },
    expectedDate: { type: Date },
    orderedAt: { type: Date },
    receivedAt: { type: Date },
    workflowInstanceId: { type: ObjectIdType, ref: 'WorkflowInstance', default: null },
    expenseId: { type: ObjectIdType, ref: 'Expense', default: null },
    attachments: { type: [attachmentSchema], default: [] },
    requestedBy: { type: ObjectIdType, ref: 'User' },
    approvedBy: { type: ObjectIdType, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 500 },
    notes: { type: String, maxlength: 1000 },
  },
  baseOptions,
);

purchaseOrderSchema.index({ societyId: 1, poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ societyId: 1, status: 1, createdAt: -1 });

export type PurchaseOrderDoc = HydratedDocumentFromSchema<typeof purchaseOrderSchema>;
export const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
