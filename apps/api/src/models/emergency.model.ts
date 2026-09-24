import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';
import { audienceMongoSchema } from '../core/audience/audience.service';

export const EmergencyContactCategories = ['POLICE', 'FIRE', 'AMBULANCE', 'HOSPITAL', 'ELECTRICITY', 'WATER', 'GAS', 'SECURITY', 'COMMITTEE', 'MAINTENANCE', 'OTHER'] as const;
export const AlertKinds = ['SOS', 'BROADCAST'] as const;
export const AlertCategories = ['MEDICAL', 'FIRE', 'SECURITY', 'ACCIDENT', 'DISASTER', 'OTHER'] as const;
export const AlertStatuses = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_ALARM', 'EXPIRED'] as const;

/** Numbers residents and guards can call in an emergency: national helplines, hospitals, utilities, committee. */
const emergencyContactSchema = new Schema(
  {
    societyId: societyField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    altPhone: { type: String, trim: true, maxlength: 20 },
    category: { type: String, enum: EmergencyContactCategories, default: 'OTHER', index: true },
    address: { type: String, trim: true, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 300 },
    order: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: ObjectIdType, ref: 'User', default: null },
  },
  baseOptions,
);
emergencyContactSchema.index({ societyId: 1, order: 1, name: 1 });

export type EmergencyContactDoc = HydratedDocumentFromSchema<typeof emergencyContactSchema>;
export const EmergencyContact = mongoose.model('EmergencyContact', emergencyContactSchema);

const responderSchema = new Schema(
  {
    userId: { type: ObjectIdType, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const timelineSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, required: true },
    userId: { type: ObjectIdType, ref: 'User', default: null },
    note: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

/**
 * An SOS raised by a resident or guard, or an emergency broadcast sent by the office.
 * SOS: ACTIVE → ACKNOWLEDGED (first responder) → RESOLVED / FALSE_ALARM.
 * BROADCAST: ACTIVE → RESOLVED (all clear) or EXPIRED.
 */
const emergencyAlertSchema = new Schema(
  {
    societyId: societyField,
    alertNumber: { type: String, required: true },
    kind: { type: String, enum: AlertKinds, required: true, index: true },
    category: { type: String, enum: AlertCategories, default: 'OTHER' },
    status: { type: String, enum: AlertStatuses, default: 'ACTIVE', index: true },
    raisedBy: { type: ObjectIdType, ref: 'User', required: true, index: true },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    location: { type: String, trim: true, maxlength: 200 },
    coordinates: { lat: { type: Number }, lng: { type: Number } },
    title: { type: String, trim: true, maxlength: 160 },
    message: { type: String, trim: true, maxlength: 2000 },
    audience: { type: audienceMongoSchema, default: undefined },
    audienceSummary: { type: String, trim: true },
    acknowledgedAt: { type: Date, default: null },
    acknowledgedBy: { type: ObjectIdType, ref: 'User', default: null },
    responders: { type: [responderSchema], default: [] },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: ObjectIdType, ref: 'User', default: null },
    resolutionNote: { type: String, trim: true, maxlength: 2000 },
    expiresAt: { type: Date, default: null },
    escalatedAt: { type: Date, default: null },
    notifiedCount: { type: Number, default: 0 },
    timeline: { type: [timelineSchema], default: [] },
    clientRef: { type: String, default: null },
  },
  baseOptions,
);
emergencyAlertSchema.index({ societyId: 1, alertNumber: 1 }, { unique: true });
emergencyAlertSchema.index({ societyId: 1, kind: 1, status: 1, createdAt: -1 });
emergencyAlertSchema.index({ societyId: 1, clientRef: 1 }, { unique: true, partialFilterExpression: { clientRef: { $type: 'string' } } });

export type EmergencyAlertDoc = HydratedDocumentFromSchema<typeof emergencyAlertSchema>;
export const EmergencyAlert = mongoose.model('EmergencyAlert', emergencyAlertSchema);
