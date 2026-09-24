import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { ResidentStatus, ResidentTypes } from '@society-erp/shared';
import { attachmentSchema, baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

const emergencyContactSchema = new Schema({ name: { type: String, required: true, trim: true }, phone: { type: String, required: true, trim: true }, relation: { type: String, trim: true } }, { _id: false });

const residentDocumentSchema = new Schema(
  {
    type: { type: String, required: true, trim: true }, // ID_PROOF | AGREEMENT | NOC | PHOTO | OTHER
    name: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    uploadedBy: { type: ObjectIdType, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
    verifiedAt: { type: Date },
  },
  { _id: true },
);

/**
 * A person living in / owning a unit. One document per (person, unit). A resident may be linked to a
 * login (userId) to get self-service access; several residents can share one user (household access).
 */
const residentSchema = new Schema(
  {
    societyId: societyField,
    userId: { type: ObjectIdType, ref: 'User', default: null, index: true },
    unitId: { type: ObjectIdType, ref: 'Unit', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    altPhone: { type: String, trim: true },
    type: { type: String, enum: ResidentTypes, required: true, index: true },
    relationship: { type: String, trim: true }, // for FAMILY / CAREGIVER
    isPrimary: { type: Boolean, default: false },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'], default: 'UNSPECIFIED' },
    occupation: { type: String, trim: true },
    bloodGroup: { type: String, trim: true },
    photoUrl: { type: String },
    emergencyContacts: { type: [emergencyContactSchema], default: [] },
    documents: { type: [residentDocumentSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    ownership: {
      sharePercent: { type: Number, min: 0, max: 100 },
      since: { type: Date },
      agreementRef: { type: String, trim: true },
    },
    tenancy: {
      startDate: { type: Date },
      endDate: { type: Date },
      rent: { type: Number, min: 0 },
      deposit: { type: Number, min: 0 },
      agreementRef: { type: String, trim: true },
      policeVerificationAt: { type: Date },
    },
    moveInDate: { type: Date },
    moveOutDate: { type: Date },
    status: { type: String, enum: Object.values(ResidentStatus), default: ResidentStatus.ACTIVE, index: true },
    tags: { type: [String], default: [] },
    notes: { type: String, maxlength: 2000 },
    createdBy: { type: ObjectIdType, ref: 'User' },
    ...softDeleteFields,
  },
  baseOptions,
);

residentSchema.index({ societyId: 1, unitId: 1, status: 1 });
residentSchema.index({ societyId: 1, phone: 1 });
residentSchema.index({ societyId: 1, email: 1 });
residentSchema.index({ name: 'text', email: 'text', phone: 'text' });

export type ResidentDoc = HydratedDocumentFromSchema<typeof residentSchema>;
export const Resident = mongoose.model('Resident', residentSchema);
