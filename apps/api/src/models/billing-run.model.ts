import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

const periodSchema = new Schema({ from: { type: Date, required: true }, to: { type: Date, required: true }, label: { type: String, required: true } }, { _id: false });

/** One billing cycle execution: generates draft invoices for the selected units, then issues them. */
const billingRunSchema = new Schema(
  {
    societyId: societyField,
    runNumber: { type: String, required: true },
    period: { type: periodSchema, required: true },
    cycle: { type: String, enum: ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'ADHOC'], default: 'MONTHLY' },
    status: { type: String, enum: ['DRAFT', 'ISSUED', 'CANCELLED'], default: 'DRAFT', index: true },
    chargeHeadIds: { type: [ObjectIdType], default: [] },
    unitFilter: {
      buildingIds: { type: [ObjectIdType], default: [] },
      unitTypes: { type: [String], default: [] },
      unitIds: { type: [ObjectIdType], default: [] },
    },
    options: {
      includePreviousBalance: { type: Boolean, default: true },
      dueDate: { type: Date },
      notes: { type: String },
    },
    invoiceCount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    skipped: { type: [{ unitCode: String, reason: String }], default: [] },
    generatedBy: { type: ObjectIdType, ref: 'User' },
    issuedBy: { type: ObjectIdType, ref: 'User' },
    issuedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  baseOptions,
);

billingRunSchema.index({ societyId: 1, runNumber: 1 }, { unique: true });
billingRunSchema.index({ societyId: 1, 'period.from': -1 });

export type BillingRunDoc = HydratedDocumentFromSchema<typeof billingRunSchema>;
export const BillingRun = mongoose.model('BillingRun', billingRunSchema);
