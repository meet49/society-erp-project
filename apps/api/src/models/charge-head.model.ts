import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

export const ChargeHeadTypes = ['FIXED', 'PER_UNIT', 'AREA_BASED', 'METER_BASED', 'FORMULA', 'PERCENTAGE'] as const;

/**
 * Configurable charge head (Maintenance, Water, Parking, Sinking Fund, Corpus…).
 * - FIXED / PER_UNIT: `amount` per invoice
 * - AREA_BASED: `rate` × unit area (sq ft)
 * - METER_BASED: `rate` × consumption of `meterType` (+ optional `amount` fixed charge)
 * - FORMULA: safe arithmetic over area, floor, bedrooms, consumption, amount, rate
 * - PERCENTAGE: `rate` % of the sum of the other line items (e.g. tax-like surcharge)
 */
const chargeHeadSchema = new Schema(
  {
    societyId: societyField,
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    description: { type: String, trim: true, maxlength: 300 },
    type: { type: String, enum: ChargeHeadTypes, required: true },
    amount: { type: Number, default: 0, min: 0 },
    rate: { type: Number, default: 0, min: 0 },
    formula: { type: String, trim: true, maxlength: 200 },
    meterType: { type: String, trim: true, uppercase: true },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    ledgerAccountCode: { type: String, trim: true, default: '4100' },
    fundKey: { type: String, trim: true, uppercase: true },
    applicableUnitTypes: { type: [String], default: [] },
    applicableBuildingIds: { type: [ObjectIdType], default: [] },
    frequency: { type: String, enum: ['RECURRING', 'ONE_TIME'], default: 'RECURRING' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

chargeHeadSchema.index({ societyId: 1, code: 1 }, { unique: true });

export type ChargeHeadDoc = HydratedDocumentFromSchema<typeof chargeHeadSchema>;
export const ChargeHead = mongoose.model('ChargeHead', chargeHeadSchema);
