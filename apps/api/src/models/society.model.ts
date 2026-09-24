import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { SocietyStatus, SocietyTypes } from '@society-erp/shared';
import { addressSchema, baseOptions, ObjectIdType } from './base';

const societySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    code: { type: String, trim: true, uppercase: true },
    type: { type: String, enum: SocietyTypes, default: 'APARTMENT' },
    registrationNumber: { type: String, trim: true },
    address: { type: addressSchema, default: () => ({}) },
    contact: {
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
      website: { type: String, trim: true },
    },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
    locale: { type: String, default: 'en-IN' },
    logoUrl: { type: String },
    status: { type: String, enum: Object.values(SocietyStatus), default: SocietyStatus.ACTIVE, index: true },
    onboarding: {
      completed: { type: Boolean, default: false },
      step: { type: Number, default: 1 },
      completedAt: { type: Date },
      skippedSteps: { type: [Number], default: [] },
    },
    primaryAdminUserId: { type: ObjectIdType, ref: 'User' },
    expectedUnits: { type: Number },
    stats: {
      units: { type: Number, default: 0 },
      residents: { type: Number, default: 0 },
      users: { type: Number, default: 0 },
      lastComputedAt: { type: Date },
    },
    source: { type: String, enum: ['SIGNUP', 'PLATFORM', 'IMPORT', 'SEED'], default: 'SIGNUP' },
    createdBy: { type: ObjectIdType, ref: 'User' },
    suspendedAt: { type: Date },
    suspendReason: { type: String },
    archivedAt: { type: Date },
    notes: { type: String },
  },
  baseOptions,
);

societySchema.index({ name: 'text', slug: 'text', 'address.city': 'text' });
societySchema.index({ createdAt: -1 });

export type SocietyDoc = HydratedDocumentFromSchema<typeof societySchema>;
export const Society = mongoose.model('Society', societySchema);
