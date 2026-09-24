import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

export const VehicleTypes = ['CAR', 'BIKE', 'SCOOTER', 'EV', 'BICYCLE', 'OTHER'] as const;

/** Resident vehicle: number plate (normalised), sticker and the parking slot it is allotted. */
const vehicleSchema = new Schema(
  {
    societyId: societyField,
    unitId: { type: ObjectIdType, ref: 'Unit', required: true, index: true },
    residentId: { type: ObjectIdType, ref: 'Resident', default: null },
    number: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    type: { type: String, enum: VehicleTypes, default: 'CAR' },
    make: { type: String, trim: true, maxlength: 60 },
    model: { type: String, trim: true, maxlength: 60 },
    color: { type: String, trim: true, maxlength: 30 },
    stickerNumber: { type: String, trim: true, maxlength: 30 },
    parkingSlotId: { type: ObjectIdType, ref: 'ParkingSlot', default: null },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    notes: { type: String, trim: true, maxlength: 300 },
    createdBy: { type: ObjectIdType, ref: 'User' },
    ...softDeleteFields,
  },
  baseOptions,
);
vehicleSchema.index({ societyId: 1, number: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
vehicleSchema.index({ societyId: 1, stickerNumber: 1 });

export type VehicleDoc = HydratedDocumentFromSchema<typeof vehicleSchema>;
export const Vehicle = mongoose.model('Vehicle', vehicleSchema);

export const ParkingSlotTypes = ['CAR', 'BIKE', 'EV', 'VISITOR', 'COMMERCIAL'] as const;

/** Parking slot with its allocation. */
const parkingSlotSchema = new Schema(
  {
    societyId: societyField,
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    zone: { type: String, trim: true, maxlength: 40 },
    level: { type: String, trim: true, maxlength: 20 },
    type: { type: String, enum: ParkingSlotTypes, default: 'CAR' },
    status: { type: String, enum: ['AVAILABLE', 'ALLOCATED', 'RESERVED', 'BLOCKED'], default: 'AVAILABLE', index: true },
    allocation: {
      unitId: { type: ObjectIdType, ref: 'Unit', default: null },
      vehicleId: { type: ObjectIdType, ref: 'Vehicle', default: null },
      allocatedAt: { type: Date, default: null },
      allocatedBy: { type: ObjectIdType, ref: 'User', default: null },
    },
    monthlyCharge: { type: Number, default: 0 },
    notes: { type: String, trim: true, maxlength: 300 },
  },
  baseOptions,
);
parkingSlotSchema.index({ societyId: 1, code: 1 }, { unique: true });
parkingSlotSchema.index({ societyId: 1, 'allocation.unitId': 1 });

export type ParkingSlotDoc = HydratedDocumentFromSchema<typeof parkingSlotSchema>;
export const ParkingSlot = mongoose.model('ParkingSlot', parkingSlotSchema);
