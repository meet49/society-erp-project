import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { ComplaintStatus, Priorities } from '@society-erp/shared';
import { attachmentSchema, baseOptions, ObjectIdType, societyField } from './base';

const commentSchema = new Schema(
  {
    userId: { type: ObjectIdType, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    /** internal notes are visible to staff / committee only, never to the resident */
    internal: { type: Boolean, default: false },
    attachments: { type: [attachmentSchema], default: [] },
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const historySchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    userId: { type: ObjectIdType, ref: 'User', default: null },
    action: { type: String, required: true },
    from: { type: String },
    to: { type: String },
    note: { type: String, maxlength: 500 },
  },
  { _id: false },
);

const escalationSchema = new Schema({ level: { type: Number, required: true }, at: { type: Date, default: Date.now }, reason: { type: String }, notifiedUserIds: { type: [ObjectIdType], default: [] } }, { _id: false });

/**
 * Helpdesk ticket. SLA targets are computed from the society's `complaints.sla` setting at creation
 * (and re-computed when the priority changes); escalation levels come from `complaints.escalation`.
 */
const complaintSchema = new Schema(
  {
    societyId: societyField,
    ticketNumber: { type: String, required: true },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null, index: true },
    raisedBy: { type: ObjectIdType, ref: 'User', required: true, index: true },
    residentId: { type: ObjectIdType, ref: 'Resident', default: null },
    onBehalf: { type: Boolean, default: false },
    categoryKey: { type: String, required: true, trim: true, uppercase: true, index: true },
    subCategory: { type: String, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 4000 },
    location: { type: String, trim: true, maxlength: 160 },
    priority: { type: String, enum: Priorities, default: 'NORMAL', index: true },
    status: { type: String, enum: Object.values(ComplaintStatus), default: ComplaintStatus.OPEN, index: true },
    isPublic: { type: Boolean, default: false },
    assignedTo: { type: ObjectIdType, ref: 'User', default: null, index: true },
    assignedStaffId: { type: ObjectIdType, ref: 'Staff', default: null },
    assignedVendorId: { type: ObjectIdType, ref: 'Vendor', default: null },
    assignedAt: { type: Date },
    attachments: { type: [attachmentSchema], default: [] },
    comments: { type: [commentSchema], default: [] },
    history: { type: [historySchema], default: [] },
    sla: {
      responseMinutes: { type: Number },
      resolutionMinutes: { type: Number },
      responseDueAt: { type: Date },
      resolutionDueAt: { type: Date, index: true },
      firstResponseAt: { type: Date },
      responseBreached: { type: Boolean, default: false },
      resolutionBreached: { type: Boolean, default: false },
      pausedMinutes: { type: Number, default: 0 },
    },
    escalationLevel: { type: Number, default: 0 },
    escalations: { type: [escalationSchema], default: [] },
    resolvedAt: { type: Date },
    resolvedBy: { type: ObjectIdType, ref: 'User', default: null },
    resolutionNote: { type: String, maxlength: 2000 },
    closedAt: { type: Date },
    closedBy: { type: ObjectIdType, ref: 'User', default: null },
    reopenedCount: { type: Number, default: 0 },
    rating: { score: { type: Number, min: 1, max: 5 }, comment: { type: String, maxlength: 500 }, at: { type: Date } },
    costAmount: { type: Number, default: 0 },
    expenseId: { type: ObjectIdType, ref: 'Expense', default: null },
    tags: { type: [String], default: [] },
  },
  baseOptions,
);

complaintSchema.index({ societyId: 1, ticketNumber: 1 }, { unique: true });
complaintSchema.index({ societyId: 1, status: 1, priority: 1, createdAt: -1 });
complaintSchema.index({ societyId: 1, raisedBy: 1, createdAt: -1 });
complaintSchema.index({ societyId: 1, assignedTo: 1, status: 1 });
complaintSchema.index({ title: 'text', description: 'text', ticketNumber: 'text' });

export type ComplaintDoc = HydratedDocumentFromSchema<typeof complaintSchema>;
export const Complaint = mongoose.model('Complaint', complaintSchema);
