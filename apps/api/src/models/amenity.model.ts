import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { attachmentSchema, baseOptions, ObjectIdType, societyField } from './base';

const maintenanceBlockSchema = new Schema({ from: { type: Date, required: true }, to: { type: Date, required: true }, reason: { type: String, trim: true, maxlength: 200 } }, { _id: true });

const scheduleSchema = new Schema(
  {
    openTime: { type: String, default: '06:00' },
    closeTime: { type: String, default: '22:00' },
    /** null = society default (`amenities.config.slotMinutes`) */
    slotMinutes: { type: Number, default: null },
    daysOpen: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    maxSlotsPerBooking: { type: Number, default: 2, min: 1 },
    /** null = society default */
    minNoticeHours: { type: Number, default: null },
    /** null = society default */
    maxAdvanceDays: { type: Number, default: null },
  },
  { _id: false },
);

const pricingSchema = new Schema(
  {
    mode: { type: String, enum: ['FREE', 'PER_SLOT', 'PER_HOUR', 'PER_BOOKING'], default: 'FREE' },
    amount: { type: Number, default: 0, min: 0 },
    /** refundable security deposit collected with the fee and returned after use */
    deposit: { type: Number, default: 0, min: 0 },
    /** income account the booking fee is posted to (defaults to the chart's amenity income account) */
    ledgerAccountCode: { type: String, default: '4130' },
  },
  { _id: false },
);

/**
 * Bookable facility (hall, gym, court, guest room…). Every booking rule is data on the amenity or in the
 * society's `amenities.config` setting; the booking engine hard-codes nothing.
 */
const amenitySchema = new Schema(
  {
    societyId: societyField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    typeKey: { type: String, required: true, trim: true, uppercase: true, default: 'OTHER' },
    description: { type: String, trim: true, maxlength: 2000 },
    location: { type: String, trim: true, maxlength: 160 },
    images: { type: [attachmentSchema], default: [] },
    rules: { type: String, trim: true, maxlength: 4000 },
    /** how many bookings may overlap at the same time (1 = exclusive use) */
    capacity: { type: Number, default: 1, min: 1 },
    /** 0 = no limit */
    maxGuests: { type: Number, default: 0, min: 0 },
    bookingMode: { type: String, enum: ['SLOT', 'FULL_DAY'], default: 'SLOT' },
    schedule: { type: scheduleSchema, default: () => ({}) },
    pricing: { type: pricingSchema, default: () => ({}) },
    requiresApproval: { type: Boolean, default: false },
    /** null = society default */
    cancellationHours: { type: Number, default: null },
    maintenanceBlocks: { type: [maintenanceBlockSchema], default: [] },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE'], default: 'ACTIVE', index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: ObjectIdType, ref: 'User' },
    deletedAt: { type: Date, default: null },
    /** short-lived lease used to serialise overlap checks for this amenity across processes */
    bookingLock: { type: Date, default: null },
  },
  baseOptions,
);

amenitySchema.index({ societyId: 1, code: 1 }, { unique: true });
amenitySchema.index({ societyId: 1, status: 1, sortOrder: 1, name: 1 });

export type AmenityDoc = HydratedDocumentFromSchema<typeof amenitySchema>;
export const Amenity = mongoose.model('Amenity', amenitySchema);
