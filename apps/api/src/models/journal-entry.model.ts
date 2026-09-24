import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

export const JournalStatus = ['DRAFT', 'POSTED', 'REVERSED'] as const;

const journalLineSchema = new Schema(
  {
    accountCode: { type: String, required: true, trim: true },
    accountName: { type: String, trim: true },
    description: { type: String, trim: true, maxlength: 200 },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    fundKey: { type: String, trim: true, uppercase: true, default: null },
    /** optional analytical dimension: unit, vendor, bank account... */
    partyType: { type: String, trim: true, default: null },
    partyId: { type: ObjectIdType, default: null },
  },
  { _id: true },
);

/**
 * Double-entry journal. Every posted entry balances (Σdebit = Σcredit). Automatic entries carry
 * `refType/refId` (Invoice, Payment, Expense…) so they can be traced and reversed.
 */
const journalEntrySchema = new Schema(
  {
    societyId: societyField,
    entryNumber: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    narration: { type: String, required: true, trim: true, maxlength: 500 },
    lines: { type: [journalLineSchema], default: [] },
    totalDebit: { type: Number, default: 0 },
    totalCredit: { type: Number, default: 0 },
    status: { type: String, enum: JournalStatus, default: 'DRAFT', index: true },
    source: { type: String, enum: ['MANUAL', 'INVOICE', 'PAYMENT', 'REFUND', 'EXPENSE', 'EXPENSE_PAYMENT', 'BANK', 'OPENING', 'ADJUSTMENT'], default: 'MANUAL', index: true },
    refType: { type: String, trim: true, default: null },
    refId: { type: ObjectIdType, default: null },
    refNumber: { type: String, trim: true, default: null },
    reversalOf: { type: ObjectIdType, ref: 'JournalEntry', default: null },
    reversedBy: { type: ObjectIdType, ref: 'JournalEntry', default: null },
    postedAt: { type: Date },
    postedBy: { type: ObjectIdType, ref: 'User' },
    createdBy: { type: ObjectIdType, ref: 'User' },
    attachments: { type: [{ name: String, storageKey: String, mimeType: String, size: Number }], default: [] },
  },
  baseOptions,
);

journalEntrySchema.index({ societyId: 1, entryNumber: 1 }, { unique: true });
journalEntrySchema.index({ societyId: 1, status: 1, date: -1 });
journalEntrySchema.index({ societyId: 1, refType: 1, refId: 1 });
journalEntrySchema.index({ societyId: 1, 'lines.accountCode': 1, date: 1 });

export type JournalEntryDoc = HydratedDocumentFromSchema<typeof journalEntrySchema>;
export const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);
