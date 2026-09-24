import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

export const BuildingTypes = ['TOWER', 'BUILDING', 'WING', 'BLOCK', 'PHASE', 'STREET'] as const;

/** Society structure node: tower / building / wing / block / phase. Supports nesting through parentId. */
const buildingSchema = new Schema(
  {
    societyId: societyField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    type: { type: String, enum: BuildingTypes, default: 'TOWER' },
    parentId: { type: ObjectIdType, ref: 'Building', default: null },
    floors: { type: Number, default: 0, min: 0 },
    hasBasement: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    notes: { type: String, maxlength: 500 },
    createdBy: { type: ObjectIdType, ref: 'User' },
    ...softDeleteFields,
  },
  baseOptions,
);

buildingSchema.index({ societyId: 1, code: 1 }, { unique: true });
buildingSchema.index({ societyId: 1, sortOrder: 1 });

export type BuildingDoc = HydratedDocumentFromSchema<typeof buildingSchema>;
export const Building = mongoose.model('Building', buildingSchema);
