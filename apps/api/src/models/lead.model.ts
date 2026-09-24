import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { LeadStatus, LeadTypes } from '@society-erp/shared';
import { baseOptions, ObjectIdType } from './base';

const noteSchema = new Schema(
  {
    body: { type: String, required: true },
    authorId: { type: ObjectIdType, ref: 'User' },
    authorName: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const leadSchema = new Schema(
  {
    type: { type: String, enum: LeadTypes, default: 'GENERAL', index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },
    societyName: { type: String, trim: true },
    city: { type: String, trim: true },
    message: { type: String, trim: true, maxlength: 2000 },
    source: { type: String, trim: true, default: 'website' },
    planSlug: { type: String, trim: true },
    status: { type: String, enum: Object.values(LeadStatus), default: LeadStatus.NEW, index: true },
    assignedTo: { type: ObjectIdType, ref: 'User', default: null, index: true },
    notes: { type: [noteSchema], default: [] },
    convertedSocietyId: { type: ObjectIdType, ref: 'Society', default: null },
    lastContactedAt: { type: Date },
    ip: { type: String },
    userAgent: { type: String },
  },
  baseOptions,
);

leadSchema.index({ createdAt: -1 });
leadSchema.index({ name: 'text', email: 'text', societyName: 'text', city: 'text' });

export type LeadDoc = HydratedDocumentFromSchema<typeof leadSchema>;
export const Lead = mongoose.model('Lead', leadSchema);
