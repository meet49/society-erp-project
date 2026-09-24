import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { attachmentSchema, baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

export const IncidentSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const IncidentStatuses = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'] as const;
export const InvolvedTypes = ['VISITOR', 'RESIDENT', 'STAFF', 'DOMESTIC_HELP', 'VEHICLE', 'UNKNOWN', 'OTHER'] as const;

const involvedSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: InvolvedTypes, default: 'UNKNOWN' },
    refId: { type: ObjectIdType, default: null },
    description: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false },
);

const timelineSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, required: true },
    userId: { type: ObjectIdType, ref: 'User', default: null },
    note: { type: String, trim: true, maxlength: 2000 },
    from: { type: String },
    to: { type: String },
  },
  { _id: false },
);

/**
 * Security incident: reported from the gate (guard app, offline-capable) or the office,
 * triaged by the security team and resolved with a written outcome.
 */
const incidentSchema = new Schema(
  {
    societyId: societyField,
    incidentNumber: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 4000 },
    typeKey: { type: String, required: true, trim: true, uppercase: true, index: true },
    severity: { type: String, enum: IncidentSeverities, default: 'MEDIUM', index: true },
    status: { type: String, enum: IncidentStatuses, default: 'OPEN', index: true },
    location: { type: String, trim: true, maxlength: 200 },
    gateId: { type: ObjectIdType, ref: 'Gate', default: null },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null, index: true },
    occurredAt: { type: Date, default: Date.now, index: true },
    reportedBy: { type: ObjectIdType, ref: 'User', required: true, index: true },
    reportedVia: { type: String, enum: ['GATE', 'OFFICE'], default: 'OFFICE' },
    photos: { type: [attachmentSchema], default: [] },
    involved: { type: [involvedSchema], default: [] },
    assignedTo: { type: ObjectIdType, ref: 'User', default: null, index: true },
    police: {
      reported: { type: Boolean, default: false },
      firNumber: { type: String, trim: true, maxlength: 60 },
      station: { type: String, trim: true, maxlength: 120 },
      reportedAt: { type: Date, default: null },
    },
    resolution: {
      note: { type: String, trim: true, maxlength: 4000 },
      actionTaken: { type: String, trim: true, maxlength: 2000 },
      resolvedAt: { type: Date, default: null },
      resolvedBy: { type: ObjectIdType, ref: 'User', default: null },
    },
    closedAt: { type: Date, default: null },
    timeline: { type: [timelineSchema], default: [] },
    /** idempotency key from the guard app's offline queue */
    clientRef: { type: String, default: null },
    ...softDeleteFields,
  },
  baseOptions,
);
incidentSchema.index({ societyId: 1, incidentNumber: 1 }, { unique: true });
incidentSchema.index({ societyId: 1, status: 1, severity: 1, occurredAt: -1 });
incidentSchema.index({ societyId: 1, clientRef: 1 }, { unique: true, partialFilterExpression: { clientRef: { $type: 'string' } } });
incidentSchema.index({ title: 'text', description: 'text', location: 'text', incidentNumber: 'text' });

export type IncidentDoc = HydratedDocumentFromSchema<typeof incidentSchema>;
export const Incident = mongoose.model('Incident', incidentSchema);
