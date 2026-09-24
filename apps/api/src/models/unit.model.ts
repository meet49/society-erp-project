import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { UnitOccupancyStatus } from '@society-erp/shared';
import { baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

const meterSchema = new Schema(
  {
    type: { type: String, required: true, trim: true, uppercase: true }, // WATER | ELECTRICITY | GAS | custom
    meterNumber: { type: String, trim: true },
    multiplier: { type: Number, default: 1 },
    lastReading: { type: Number, default: 0 },
    lastReadingAt: { type: Date },
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

const unitSchema = new Schema(
  {
    societyId: societyField,
    buildingId: { type: ObjectIdType, ref: 'Building', default: null, index: true },
    floor: { type: Number, default: 0 },
    number: { type: String, required: true, trim: true, maxlength: 20 },
    /** unique human code, e.g. A-1204 */
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    type: { type: String, default: 'FLAT', trim: true, uppercase: true },
    areaSqft: { type: Number, default: 0, min: 0 },
    bedrooms: { type: Number, min: 0 },
    ownerResidentId: { type: ObjectIdType, ref: 'Resident', default: null },
    tenantResidentId: { type: ObjectIdType, ref: 'Resident', default: null },
    occupancyStatus: { type: String, enum: UnitOccupancyStatus, default: 'VACANT', index: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    parkingSlotIds: { type: [ObjectIdType], default: [] },
    meters: { type: [meterSchema], default: [] },
    attributes: { type: Schema.Types.Mixed, default: {} },
    openingBalance: { type: Number, default: 0 },
    notes: { type: String, maxlength: 1000 },
    createdBy: { type: ObjectIdType, ref: 'User' },
    ...softDeleteFields,
  },
  baseOptions,
);

unitSchema.index({ societyId: 1, code: 1 }, { unique: true });
unitSchema.index({ societyId: 1, buildingId: 1, floor: 1 });
unitSchema.index({ societyId: 1, deletedAt: 1, status: 1 });

export type UnitDoc = HydratedDocumentFromSchema<typeof unitSchema>;
export const Unit = mongoose.model('Unit', unitSchema);
