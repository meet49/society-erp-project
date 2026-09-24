import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { ExpenseApprovalStatus, ExpensePaymentStatus } from '@society-erp/shared';
import { attachmentSchema, baseOptions, ObjectIdType, societyField } from './base';

const expensePaymentSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    method: { type: String, required: true },
    reference: { type: String, trim: true },
    bankAccountId: { type: ObjectIdType, ref: 'BankAccount', default: null },
    journalEntryId: { type: ObjectIdType, ref: 'JournalEntry', default: null },
    notes: { type: String, maxlength: 300 },
    recordedBy: { type: ObjectIdType, ref: 'User' },
  },
  { _id: true },
);

/**
 * Expense / bill payable. Approval goes through the configurable `expense_approval` workflow;
 * approval and payments raise finance hooks so accounting journals stay in sync.
 */
const expenseSchema = new Schema(
  {
    societyId: societyField,
    expenseNumber: { type: String, required: true },
    vendorId: { type: ObjectIdType, ref: 'Vendor', default: null, index: true },
    vendorName: { type: String, trim: true },
    categoryKey: { type: String, trim: true, uppercase: true, index: true },
    accountCode: { type: String, trim: true, default: '5100' },
    fundKey: { type: String, trim: true, uppercase: true, default: null },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000 },
    billNumber: { type: String, trim: true, maxlength: 60 },
    billDate: { type: Date },
    dueDate: { type: Date },
    amount: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    tdsAmount: { type: Number, default: 0 },
    total: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0 },
    approvalStatus: { type: String, enum: Object.values(ExpenseApprovalStatus), default: ExpenseApprovalStatus.DRAFT, index: true },
    paymentStatus: { type: String, enum: Object.values(ExpensePaymentStatus), default: ExpensePaymentStatus.UNPAID, index: true },
    payments: { type: [expensePaymentSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    purchaseOrderId: { type: ObjectIdType, ref: 'PurchaseOrder', default: null },
    assetId: { type: ObjectIdType, ref: 'Asset', default: null },
    contractId: { type: ObjectIdType, ref: 'Contract', default: null },
    workflowInstanceId: { type: ObjectIdType, ref: 'WorkflowInstance', default: null },
    approvalJournalEntryId: { type: ObjectIdType, ref: 'JournalEntry', default: null },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: ObjectIdType, ref: 'User' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 500 },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

expenseSchema.index({ societyId: 1, expenseNumber: 1 }, { unique: true });
expenseSchema.index({ societyId: 1, approvalStatus: 1, paymentStatus: 1 });
expenseSchema.index({ societyId: 1, billDate: -1 });

export type ExpenseDoc = HydratedDocumentFromSchema<typeof expenseSchema>;
export const Expense = mongoose.model('Expense', expenseSchema);
