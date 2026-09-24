import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { PlanStatus } from '@society-erp/shared';
import { baseOptions, ObjectIdType } from './base';

const planFeatureSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String },
    included: { type: Boolean, default: true },
  },
  { _id: false },
);

/**
 * Plans are fully dynamic. `limits` is an open object of numeric limits (null / absent = unlimited),
 * e.g. { maxUnits: 200, maxResidents: 800, maxUsers: 50, maxStaff: 40, maxStorageMb: 5120 }.
 */
const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 400 },
    monthlyPrice: { type: Number, required: true, min: 0 },
    annualPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    trialDays: { type: Number, default: 14, min: 0 },
    status: { type: String, enum: Object.values(PlanStatus), default: PlanStatus.DRAFT, index: true },
    displayOrder: { type: Number, default: 0 },
    features: { type: [planFeatureSchema], default: [] },
    modules: { type: [String], default: [] },
    limits: { type: Schema.Types.Mixed, default: {} },
    highlighted: { type: Boolean, default: false },
    publicVisibility: { type: Boolean, default: true },
    badge: { type: String, trim: true },
    ctaLabel: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: ObjectIdType, ref: 'User' },
    updatedBy: { type: ObjectIdType, ref: 'User' },
    archivedAt: { type: Date },
  },
  baseOptions,
);

export type PlanDoc = HydratedDocumentFromSchema<typeof planSchema>;
export const Plan = mongoose.model('Plan', planSchema);
