import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

export const BankTxnStatus = ['UNMATCHED', 'MATCHED', 'IGNORED'] as const;

/** Bank statement lines (imported CSV or entered manually) used for reconciliation against payments and expense payments. */
const bankTransactionSchema = new Schema(
  {
    societyId: societyField,
    bankAccountId: { type: ObjectIdType, ref: 'BankAccount', required: true, index: true },
    date: { type: Date, required: true, index: true },
    description: { type: String, trim: true, maxlength: 300 },
    reference: { type: String, trim: true, maxlength: 120 },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    balanceAfter: { type: Number },
    status: { type: String, enum: BankTxnStatus, default: 'UNMATCHED', index: true },
    matchedType: { type: String, enum: ['Payment', 'Expense', 'JournalEntry', null], default: null },
    matchedId: { type: ObjectIdType, default: null },
    matchedAt: { type: Date },
    matchedBy: { type: ObjectIdType, ref: 'User' },
    source: { type: String, enum: ['IMPORT', 'MANUAL'], default: 'IMPORT' },
    importBatch: { type: String, trim: true },
    /** dedupe key: hash of bankAccount + date + amount + reference + description */
    fingerprint: { type: String, required: true },
    notes: { type: String, maxlength: 300 },
  },
  baseOptions,
);

bankTransactionSchema.index({ societyId: 1, bankAccountId: 1, fingerprint: 1 }, { unique: true });
bankTransactionSchema.index({ societyId: 1, status: 1, date: -1 });

export type BankTransactionDoc = HydratedDocumentFromSchema<typeof bankTransactionSchema>;
export const BankTransaction = mongoose.model('BankTransaction', bankTransactionSchema);
