import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { AssetStatus } from '@society-erp/shared';
import { attachmentSchema, baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

export const MaintenanceTypes = ['PREVENTIVE', 'BREAKDOWN', 'INSPECTION', 'AMC_VISIT', 'UPGRADE'] as const;

const maintenanceSchema = new Schema(
  {
    at: { type: Date, required: true },
    type: { type: String, enum: MaintenanceTypes, default: 'PREVENTIVE' },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    cost: { type: Number, default: 0, min: 0 },
    vendorId: { type: ObjectIdType, ref: 'Vendor', default: null },
    vendorName: { type: String, trim: true },
    expenseId: { type: ObjectIdType, ref: 'Expense', default: null },
    contractId: { type: ObjectIdType, ref: 'Contract', default: null },
    downtimeHours: { type: Number, default: 0, min: 0 },
    byUserId: { type: ObjectIdType, ref: 'User', default: null },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { _id: true },
);

/** Fixed asset register: lifts, pumps, generators, CCTV… with warranty, AMC link, maintenance log and straight-line value. */
const assetSchema = new Schema(
  {
    societyId: societyField,
    assetCode: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    categoryKey: { type: String, required: true, trim: true, uppercase: true, index: true },
    description: { type: String, trim: true, maxlength: 2000 },
    location: { type: String, trim: true, maxlength: 200 },
    buildingId: { type: ObjectIdType, ref: 'Building', default: null },
    make: { type: String, trim: true, maxlength: 80 },
    model: { type: String, trim: true, maxlength: 80 },
    serialNumber: { type: String, trim: true, maxlength: 80 },
    purchaseDate: { type: Date, default: null },
    purchaseCost: { type: Number, default: 0, min: 0 },
    vendorId: { type: ObjectIdType, ref: 'Vendor', default: null },
    vendorName: { type: String, trim: true },
    invoiceNumber: { type: String, trim: true, maxlength: 60 },
    warrantyUntil: { type: Date, default: null },
    expectedLifeYears: { type: Number, default: 10, min: 0 },
    salvageValue: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: AssetStatus, default: 'ACTIVE', index: true },
    disposal: { at: { type: Date, default: null }, reason: { type: String, trim: true, maxlength: 500 }, amount: { type: Number, default: 0 }, byUserId: { type: ObjectIdType, ref: 'User', default: null } },
    contractId: { type: ObjectIdType, ref: 'Contract', default: null },
    maintenanceIntervalMonths: { type: Number, default: 0, min: 0 },
    lastMaintenanceAt: { type: Date, default: null },
    nextMaintenanceDue: { type: Date, default: null, index: true },
    maintenanceLog: { type: [maintenanceSchema], default: [] },
    photos: { type: [attachmentSchema], default: [] },
    documents: { type: [attachmentSchema], default: [] },
    custodian: { type: String, trim: true, maxlength: 120 },
    tags: { type: [String], default: [] },
    reminders: { maintenanceFor: { type: Date, default: null }, warrantySent: { type: Boolean, default: false } },
    createdBy: { type: ObjectIdType, ref: 'User' },
    ...softDeleteFields,
  },
  baseOptions,
);
assetSchema.index({ societyId: 1, assetCode: 1 }, { unique: true });
assetSchema.index({ societyId: 1, status: 1, categoryKey: 1 });
assetSchema.index({ name: 'text', assetCode: 'text', serialNumber: 'text', location: 'text' });

export type AssetDoc = HydratedDocumentFromSchema<typeof assetSchema>;
export const Asset = mongoose.model('Asset', assetSchema);
