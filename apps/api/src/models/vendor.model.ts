import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { addressSchema, baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

export const VendorStatus = ['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'BLACKLISTED'] as const;

/** Suppliers and service providers (housekeeping agency, lift AMC vendor, electrician, plumber…). */
const vendorSchema = new Schema(
  {
    societyId: societyField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, trim: true, uppercase: true, maxlength: 20 },
    categoryKey: { type: String, trim: true, uppercase: true, index: true },
    contactName: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true },
    altPhone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: addressSchema, default: () => ({}) },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 20 },
    pan: { type: String, trim: true, uppercase: true, maxlength: 12 },
    bank: {
      accountHolder: { type: String, trim: true },
      accountNumberMasked: { type: String, trim: true },
      ifsc: { type: String, trim: true, uppercase: true },
      upiId: { type: String, trim: true },
    },
    paymentTermsDays: { type: Number, default: 30 },
    status: { type: String, enum: VendorStatus, default: 'ACTIVE', index: true },
    rating: { type: Number, min: 1, max: 5 },
    tags: { type: [String], default: [] },
    notes: { type: String, maxlength: 1000 },
    documents: { type: [{ name: String, storageKey: String, mimeType: String, size: Number, uploadedAt: Date }], default: [] },
    workflowInstanceId: { type: ObjectIdType, ref: 'WorkflowInstance', default: null },
    createdBy: { type: ObjectIdType, ref: 'User' },
    ...softDeleteFields,
  },
  baseOptions,
);

vendorSchema.index({ societyId: 1, name: 1 });
vendorSchema.index({ societyId: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });

export type VendorDoc = HydratedDocumentFromSchema<typeof vendorSchema>;
export const Vendor = mongoose.model('Vendor', vendorSchema);
