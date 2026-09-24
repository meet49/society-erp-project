import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/** Atomic number sequences (invoice, receipt, complaint, ticket numbers...). */
const sequenceSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', default: null, index: true },
    key: { type: String, required: true },
    prefix: { type: String, default: '' },
    next: { type: Number, default: 1 },
    padding: { type: Number, default: 5 },
    resetPolicy: { type: String, enum: ['NEVER', 'YEARLY', 'MONTHLY', 'FISCAL_YEAR'], default: 'NEVER' },
    period: { type: String, default: '' },
  },
  baseOptions,
);

sequenceSchema.index({ societyId: 1, key: 1 }, { unique: true });

export type SequenceDoc = HydratedDocumentFromSchema<typeof sequenceSchema>;
export const Sequence = mongoose.model('Sequence', sequenceSchema);
