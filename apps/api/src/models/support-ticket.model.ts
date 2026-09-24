import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { Priorities, SupportTicketSources, SupportTicketStatus } from '@society-erp/shared';
import { attachmentSchema, baseOptions, ObjectIdType } from './base';

const messageSchema = new Schema(
  {
    authorId: { type: ObjectIdType, ref: 'User', default: null },
    authorType: { type: String, enum: ['REQUESTER', 'PLATFORM', 'SYSTEM'], required: true },
    authorName: { type: String },
    body: { type: String, required: true, maxlength: 8000 },
    /** internal notes are visible to platform agents only */
    internal: { type: Boolean, default: false },
    attachments: { type: [attachmentSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

/** Unified support inbox: prospects (public form), societies, society admins and members. */
const supportTicketSchema = new Schema(
  {
    ticketNumber: { type: String, required: true, unique: true },
    source: { type: String, enum: SupportTicketSources, required: true, index: true },
    societyId: { type: ObjectIdType, ref: 'Society', default: null, index: true },
    requesterUserId: { type: ObjectIdType, ref: 'User', default: null, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, maxlength: 8000 },
    category: { type: String, trim: true },
    priority: { type: String, enum: Priorities, default: 'NORMAL', index: true },
    status: { type: String, enum: Object.values(SupportTicketStatus), default: SupportTicketStatus.OPEN, index: true },
    assignedTo: { type: ObjectIdType, ref: 'User', default: null, index: true },
    messages: { type: [messageSchema], default: [] },
    tags: { type: [String], default: [] },
    firstResponseAt: { type: Date },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
    dueAt: { type: Date },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    lastMessageBy: { type: String, enum: ['REQUESTER', 'PLATFORM', 'SYSTEM'], default: 'REQUESTER' },
    rating: { type: Number, min: 1, max: 5 },
  },
  baseOptions,
);

supportTicketSchema.index({ status: 1, priority: 1, lastActivityAt: -1 });
supportTicketSchema.index({ subject: 'text', message: 'text', name: 'text', email: 'text', ticketNumber: 'text' });

export type SupportTicketDoc = HydratedDocumentFromSchema<typeof supportTicketSchema>;
export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
