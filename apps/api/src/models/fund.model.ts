import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

/**
 * Earmarked funds (Corpus, Sinking, Reserve, Repair…). A fund maps to a liability/equity account;
 * contributions come from charge heads with `fundKey`, utilisations from expenses tagged with the fund.
 */
const fundSchema = new Schema(
  {
    societyId: societyField,
    key: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 300 },
    accountCode: { type: String, required: true, trim: true },
    targetAmount: { type: Number, default: null },
    openingBalance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

fundSchema.index({ societyId: 1, key: 1 }, { unique: true });

export type FundDoc = HydratedDocumentFromSchema<typeof fundSchema>;
export const Fund = mongoose.model('Fund', fundSchema);
