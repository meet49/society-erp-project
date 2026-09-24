import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

/** Utility meter readings (water, electricity, gas, custom). Consumption feeds METER_BASED charge heads. */
const meterReadingSchema = new Schema(
  {
    societyId: societyField,
    unitId: { type: ObjectIdType, ref: 'Unit', required: true, index: true },
    meterType: { type: String, required: true, trim: true, uppercase: true },
    meterNumber: { type: String, trim: true },
    previousReading: { type: Number, default: 0 },
    currentReading: { type: Number, required: true },
    multiplier: { type: Number, default: 1 },
    consumption: { type: Number, required: true },
    readingDate: { type: Date, required: true },
    period: { from: { type: Date }, to: { type: Date }, label: { type: String } },
    source: { type: String, enum: ['MANUAL', 'IMPORT', 'API'], default: 'MANUAL' },
    invoiceId: { type: ObjectIdType, ref: 'Invoice', default: null },
    billed: { type: Boolean, default: false, index: true },
    notes: { type: String, maxlength: 300 },
    recordedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

meterReadingSchema.index({ societyId: 1, unitId: 1, meterType: 1, readingDate: -1 });

export type MeterReadingDoc = HydratedDocumentFromSchema<typeof meterReadingSchema>;
export const MeterReading = mongoose.model('MeterReading', meterReadingSchema);
