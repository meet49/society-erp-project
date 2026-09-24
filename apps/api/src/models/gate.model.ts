import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

/** Physical entry points (main gate, service gate, tower lobby…). Guards pick their gate when checking visitors in. */
const gateSchema = new Schema(
  {
    societyId: societyField,
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    description: { type: String, trim: true, maxlength: 300 },
    buildingIds: { type: [ObjectIdType], default: [] },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

gateSchema.index({ societyId: 1, code: 1 }, { unique: true });

export type GateDoc = HydratedDocumentFromSchema<typeof gateSchema>;
export const Gate = mongoose.model('Gate', gateSchema);
