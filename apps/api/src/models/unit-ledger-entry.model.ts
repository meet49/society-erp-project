import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

export const LedgerEntryTypes = ['INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT', 'REFUND', 'ADVANCE'] as const;

/**
 * Unit (member) ledger: every invoice is a debit, every payment / credit note a credit.
 * Outstanding dues = unit.openingBalance + Σ debit − Σ credit.
 */
const unitLedgerEntrySchema = new Schema(
  {
    societyId: societyField,
    unitId: { type: ObjectIdType, ref: 'Unit', required: true, index: true },
    date: { type: Date, required: true },
    type: { type: String, enum: LedgerEntryTypes, required: true },
    refType: { type: String, required: true },
    refId: { type: ObjectIdType, required: true },
    refNumber: { type: String },
    description: { type: String, required: true },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

unitLedgerEntrySchema.index({ societyId: 1, unitId: 1, date: 1 });
unitLedgerEntrySchema.index({ societyId: 1, refType: 1, refId: 1 });

export type UnitLedgerEntryDoc = HydratedDocumentFromSchema<typeof unitLedgerEntrySchema>;
export const UnitLedgerEntry = mongoose.model('UnitLedgerEntry', unitLedgerEntrySchema);
