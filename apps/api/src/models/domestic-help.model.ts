import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

const engagementSchema = new Schema(
  {
    unitId: { type: ObjectIdType, ref: 'Unit', required: true },
    addedBy: { type: ObjectIdType, ref: 'User', default: null },
    schedule: { type: String, trim: true, maxlength: 200 },
    since: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

/** Maid / cook / driver… registered by residents, verified by the office, recognised at the gate by passcode or QR. */
const domesticHelpSchema = new Schema(
  {
    societyId: societyField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20 },
    typeKey: { type: String, required: true, trim: true, uppercase: true, index: true },
    photoKey: { type: String },
    idProof: { type: { type: String, trim: true }, number: { type: String, trim: true }, storageKey: { type: String } },
    units: { type: [engagementSchema], default: [] },
    verification: {
      status: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
      verifiedAt: { type: Date, default: null },
      verifiedBy: { type: ObjectIdType, ref: 'User', default: null },
      note: { type: String, trim: true, maxlength: 300 },
      policeVerificationKey: { type: String },
    },
    passcode: { type: String, required: true },
    qrToken: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'BLOCKED', 'INACTIVE'], default: 'ACTIVE', index: true },
    blockedReason: { type: String, trim: true, maxlength: 300 },
    lastEntryAt: { type: Date, default: null },
    insideSince: { type: Date, default: null },
    createdBy: { type: ObjectIdType, ref: 'User' },
    ...softDeleteFields,
  },
  baseOptions,
);
domesticHelpSchema.index({ societyId: 1, passcode: 1 }, { unique: true });
domesticHelpSchema.index({ qrToken: 1 }, { unique: true });
domesticHelpSchema.index({ societyId: 1, 'units.unitId': 1 });
domesticHelpSchema.index({ name: 'text', phone: 'text' });

export type DomesticHelpDoc = HydratedDocumentFromSchema<typeof domesticHelpSchema>;
export const DomesticHelp = mongoose.model('DomesticHelp', domesticHelpSchema);

/** Gate log for domestic help entries and exits. */
const helpLogSchema = new Schema(
  {
    societyId: societyField,
    helpId: { type: ObjectIdType, ref: 'DomesticHelp', required: true, index: true },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    type: { type: String, enum: ['IN', 'OUT'], required: true },
    at: { type: Date, default: Date.now, index: true },
    gateId: { type: ObjectIdType, ref: 'Gate', default: null },
    byUserId: { type: ObjectIdType, ref: 'User', default: null },
    clientRef: { type: String, default: null },
  },
  baseOptions,
);
helpLogSchema.index({ societyId: 1, clientRef: 1 }, { unique: true, partialFilterExpression: { clientRef: { $type: 'string' } } });

export const DomesticHelpLog = mongoose.model('DomesticHelpLog', helpLogSchema);
