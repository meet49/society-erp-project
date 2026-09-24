import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

/** Society bank accounts / cash boxes. Each is backed by an ASSET ledger account for reconciliation. */
const bankAccountSchema = new Schema(
  {
    societyId: societyField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    kind: { type: String, enum: ['BANK', 'CASH', 'WALLET', 'GATEWAY'], default: 'BANK' },
    bankName: { type: String, trim: true, maxlength: 120 },
    branch: { type: String, trim: true, maxlength: 120 },
    /** stored masked (last 4 digits) — full numbers never leave the society office */
    accountNumberMasked: { type: String, trim: true },
    ifsc: { type: String, trim: true, uppercase: true, maxlength: 20 },
    accountCode: { type: String, required: true, trim: true },
    openingBalance: { type: Number, default: 0 },
    openingBalanceDate: { type: Date },
    isDefault: { type: Boolean, default: false },
    /** default destination for payments of these methods (e.g. CASH → cash box, ONLINE → gateway settlement account) */
    paymentMethods: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    lastReconciledAt: { type: Date },
    lastStatementBalance: { type: Number },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

bankAccountSchema.index({ societyId: 1, accountCode: 1 }, { unique: true });

export type BankAccountDoc = HydratedDocumentFromSchema<typeof bankAccountSchema>;
export const BankAccount = mongoose.model('BankAccount', bankAccountSchema);
