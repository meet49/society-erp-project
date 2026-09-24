import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

export const AccountTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const;
export type AccountType = (typeof AccountTypes)[number];

/** Debit-normal account types (balance = Σdebit − Σcredit); the others are credit-normal. */
export const DEBIT_NORMAL: ReadonlySet<string> = new Set(['ASSET', 'EXPENSE']);

/**
 * Chart of accounts (per society). Seeded with a sensible default for housing societies and fully
 * editable. `code` is the stable key used by charge heads, expenses and journals.
 */
const accountSchema = new Schema(
  {
    societyId: societyField,
    code: { type: String, required: true, trim: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: AccountTypes, required: true, index: true },
    parentCode: { type: String, trim: true, default: null },
    description: { type: String, trim: true, maxlength: 300 },
    /** system accounts are used by automatic postings and cannot be deleted */
    isSystem: { type: Boolean, default: false },
    /** well-known role of the account for automatic postings (RECEIVABLES, CASH, BANK, PAYABLES, PENALTY_INCOME, ADVANCES...) */
    systemKey: { type: String, trim: true, default: null },
    isActive: { type: Boolean, default: true },
    openingBalance: { type: Number, default: 0 },
    fundKey: { type: String, trim: true, uppercase: true, default: null },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

accountSchema.index({ societyId: 1, code: 1 }, { unique: true });
accountSchema.index({ societyId: 1, systemKey: 1 });

export type AccountDoc = HydratedDocumentFromSchema<typeof accountSchema>;
export const Account = mongoose.model('Account', accountSchema);
