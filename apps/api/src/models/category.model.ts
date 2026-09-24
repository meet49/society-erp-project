import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { CategoryTypes } from '@society-erp/shared';
import { baseOptions, ObjectIdType } from './base';

/**
 * Generic configurable categories (complaint categories, visitor categories, staff types, vendor
 * categories, expense categories, asset categories, unit types...). Seeded with defaults per society
 * and fully editable by the society admin. `metadata` carries type-specific config
 * (e.g. complaint SLA overrides, expense ledger account code).
 */
const categorySchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', required: true, index: true },
    type: { type: String, enum: CategoryTypes, required: true },
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    color: { type: String },
    icon: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

categorySchema.index({ societyId: 1, type: 1, key: 1 }, { unique: true });

export type CategoryDoc = HydratedDocumentFromSchema<typeof categorySchema>;
export const Category = mongoose.model('Category', categorySchema);
