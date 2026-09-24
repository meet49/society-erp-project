import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { VisitorEntryType, VisitorStatus } from '@society-erp/shared';
import { baseOptions, ObjectIdType, societyField } from './base';

const timelineSchema = new Schema({ at: { type: Date, default: Date.now }, action: { type: String, required: true }, userId: { type: ObjectIdType, ref: 'User', default: null }, gateId: { type: ObjectIdType, ref: 'Gate', default: null }, note: { type: String, maxlength: 300 } }, { _id: false });

/**
 * A visit: pre-approved by a resident (QR / passcode) or registered at the gate as a walk-in that the
 * resident approves in real time. Check-in / check-out are recorded by the guard with the gate.
 */
const visitorSchema = new Schema(
  {
    societyId: societyField,
    entryType: { type: String, enum: Object.values(VisitorEntryType), required: true, index: true },
    categoryKey: { type: String, required: true, trim: true, uppercase: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    companyName: { type: String, trim: true, maxlength: 120 },
    vehicleNumber: { type: String, trim: true, uppercase: true, maxlength: 20 },
    guestCount: { type: Number, default: 1, min: 1, max: 50 },
    purpose: { type: String, trim: true, maxlength: 300 },
    photoKey: { type: String, trim: true },
    idProof: { type: { type: String }, number: { type: String } },
    unitId: { type: ObjectIdType, ref: 'Unit', required: true, index: true },
    hostUserId: { type: ObjectIdType, ref: 'User', default: null, index: true },
    residentId: { type: ObjectIdType, ref: 'Resident', default: null },
    /** short numeric code the visitor tells the guard; unique among active passes of the society */
    passcode: { type: String, trim: true, index: true },
    /** random token embedded in the QR (never the passcode) */
    qrToken: { type: String, trim: true, index: true },
    expectedAt: { type: Date },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true, index: true },
    recurring: { days: { type: [Number], default: [] }, until: { type: Date } },
    status: { type: String, enum: Object.values(VisitorStatus), default: VisitorStatus.PENDING, index: true },
    approvedBy: { type: ObjectIdType, ref: 'User', default: null },
    approvedAt: { type: Date },
    deniedReason: { type: String, maxlength: 300 },
    approvalRequestedAt: { type: Date },
    checkInAt: { type: Date, index: true },
    checkInGateId: { type: ObjectIdType, ref: 'Gate', default: null },
    checkedInBy: { type: ObjectIdType, ref: 'User', default: null },
    checkOutAt: { type: Date },
    checkOutGateId: { type: ObjectIdType, ref: 'Gate', default: null },
    checkedOutBy: { type: ObjectIdType, ref: 'User', default: null },
    createdBy: { type: ObjectIdType, ref: 'User', default: null },
    /** offline-capable guard app sends an idempotency key per action */
    clientRef: { type: String, trim: true },
    notes: { type: String, maxlength: 500 },
    timeline: { type: [timelineSchema], default: [] },
  },
  baseOptions,
);

visitorSchema.index({ societyId: 1, status: 1, validUntil: 1 });
visitorSchema.index({ societyId: 1, unitId: 1, createdAt: -1 });
visitorSchema.index({ societyId: 1, passcode: 1 }, { partialFilterExpression: { passcode: { $type: 'string' } } });
visitorSchema.index({ societyId: 1, clientRef: 1 }, { unique: true, partialFilterExpression: { clientRef: { $type: 'string' } } });
visitorSchema.index({ name: 'text', phone: 'text', vehicleNumber: 'text' });

export type VisitorDoc = HydratedDocumentFromSchema<typeof visitorSchema>;
export const Visitor = mongoose.model('Visitor', visitorSchema);
