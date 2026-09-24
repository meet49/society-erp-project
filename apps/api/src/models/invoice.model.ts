import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { InvoiceStatus } from '@society-erp/shared';
import { baseOptions, ObjectIdType, societyField } from './base';

const lineItemSchema = new Schema(
  {
    chargeHeadId: { type: ObjectIdType, ref: 'ChargeHead', default: null },
    code: { type: String, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    quantity: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, required: true },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    meterReadingId: { type: ObjectIdType, ref: 'MeterReading', default: null },
    ledgerAccountCode: { type: String },
    fundKey: { type: String },
  },
  { _id: true },
);

const periodSchema = new Schema({ from: { type: Date }, to: { type: Date }, label: { type: String } }, { _id: false });

const invoiceSchema = new Schema(
  {
    societyId: societyField,
    invoiceNumber: { type: String, required: true },
    unitId: { type: ObjectIdType, ref: 'Unit', required: true, index: true },
    residentId: { type: ObjectIdType, ref: 'Resident', default: null },
    billTo: { name: { type: String }, email: { type: String }, phone: { type: String } },
    period: { type: periodSchema, default: () => ({}) },
    billingRunId: { type: ObjectIdType, ref: 'BillingRun', default: null, index: true },
    lineItems: { type: [lineItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    discount: { amount: { type: Number, default: 0 }, reason: { type: String } },
    penalty: { type: Number, default: 0 },
    previousBalance: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    issueDate: { type: Date },
    dueDate: { type: Date, index: true },
    status: { type: String, enum: Object.values(InvoiceStatus), default: InvoiceStatus.DRAFT, index: true },
    notes: { type: String, maxlength: 1000 },
    cancelReason: { type: String },
    cancelledAt: { type: Date },
    paidAt: { type: Date },
    overdueAt: { type: Date },
    penaltyAppliedAt: { type: Date },
    journalEntryId: { type: ObjectIdType, ref: 'JournalEntry', default: null },
    remindersSent: { type: [{ key: String, at: Date }], default: [] },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

invoiceSchema.index({ societyId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ societyId: 1, unitId: 1, status: 1 });
invoiceSchema.index({ societyId: 1, status: 1, dueDate: 1 });
invoiceSchema.index({ societyId: 1, createdAt: -1 });

export type InvoiceDoc = HydratedDocumentFromSchema<typeof invoiceSchema>;
export const Invoice = mongoose.model('Invoice', invoiceSchema);
