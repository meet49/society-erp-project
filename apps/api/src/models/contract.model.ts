import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { ContractStatus } from '@society-erp/shared';
import { attachmentSchema, baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

export const ContractTypes = ['AMC', 'SERVICE', 'SUPPLY', 'LEASE', 'INSURANCE', 'OTHER'] as const;
export const BillingCycles = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL'] as const;

const visitSchema = new Schema(
  {
    at: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 2000 },
    byUserId: { type: ObjectIdType, ref: 'User', default: null },
    assetIds: { type: [ObjectIdType], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { _id: true },
);

/** Vendor contract / AMC: dates, value, covered assets, service visits, renewal chain and expiry reminders. */
const contractSchema = new Schema(
  {
    societyId: societyField,
    contractNumber: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    type: { type: String, enum: ContractTypes, default: 'SERVICE', index: true },
    vendorId: { type: ObjectIdType, ref: 'Vendor', required: true, index: true },
    vendorName: { type: String, trim: true },
    categoryKey: { type: String, trim: true, uppercase: true },
    description: { type: String, trim: true, maxlength: 2000 },
    scope: { type: String, trim: true, maxlength: 4000 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true, index: true },
    value: { type: Number, default: 0, min: 0 },
    billingCycle: { type: String, enum: BillingCycles, default: 'ANNUAL' },
    amountPerCycle: { type: Number, default: 0, min: 0 },
    paymentTermsDays: { type: Number, default: 30 },
    autoRenew: { type: Boolean, default: false },
    noticePeriodDays: { type: Number, default: 30 },
    status: { type: String, enum: ContractStatus, default: 'DRAFT', index: true },
    documents: { type: [attachmentSchema], default: [] },
    contact: { name: { type: String, trim: true }, phone: { type: String, trim: true }, email: { type: String, trim: true, lowercase: true } },
    assetIds: { type: [ObjectIdType], ref: 'Asset', default: [] },
    visitFrequencyMonths: { type: Number, default: 0, min: 0 },
    visits: { type: [visitSchema], default: [] },
    nextVisitDue: { type: Date, default: null },
    visitReminderSentFor: { type: Date, default: null },
    remindersSent: { type: [Number], default: [] },
    renewedFromId: { type: ObjectIdType, ref: 'Contract', default: null },
    renewedToId: { type: ObjectIdType, ref: 'Contract', default: null },
    terminatedAt: { type: Date, default: null },
    terminationReason: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: ObjectIdType, ref: 'User' },
    ...softDeleteFields,
  },
  baseOptions,
);
contractSchema.index({ societyId: 1, contractNumber: 1 }, { unique: true });
contractSchema.index({ societyId: 1, status: 1, endDate: 1 });
contractSchema.index({ title: 'text', vendorName: 'text', contractNumber: 'text' });

export type ContractDoc = HydratedDocumentFromSchema<typeof contractSchema>;
export const Contract = mongoose.model('Contract', contractSchema);
