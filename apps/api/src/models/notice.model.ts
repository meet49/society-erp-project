import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { attachmentSchema, baseOptions, ObjectIdType, societyField } from './base';
import { audienceMongoSchema } from '../core/audience/audience.service';

export const NoticeStatuses = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const;
export const NoticePriorities = ['NORMAL', 'IMPORTANT', 'URGENT'] as const;

/** Society notice / circular targeted at an audience; reads and acknowledgements are tracked per user. */
const noticeSchema = new Schema(
  {
    societyId: societyField,
    noticeNumber: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 20000 },
    categoryKey: { type: String, trim: true, uppercase: true, default: 'GENERAL', index: true },
    priority: { type: String, enum: NoticePriorities, default: 'NORMAL' },
    audience: { type: audienceMongoSchema, default: () => ({ type: 'ALL' }) },
    audienceLabel: { type: String, default: 'Everyone' },
    attachments: { type: [attachmentSchema], default: [] },
    status: { type: String, enum: NoticeStatuses, default: 'DRAFT', index: true },
    /** when set on a scheduled notice, the sweep publishes it at this time */
    publishAt: { type: Date, default: null, index: true },
    publishedAt: { type: Date },
    publishedBy: { type: ObjectIdType, ref: 'User', default: null },
    expiresAt: { type: Date, default: null },
    isPinned: { type: Boolean, default: false },
    requiresAcknowledgement: { type: Boolean, default: false },
    channels: { type: [String], default: ['IN_APP', 'PUSH'] },
    recipientCount: { type: Number, default: 0 },
    readCount: { type: Number, default: 0 },
    ackCount: { type: Number, default: 0 },
    archivedAt: { type: Date },
    createdBy: { type: ObjectIdType, ref: 'User' },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

noticeSchema.index({ societyId: 1, noticeNumber: 1 }, { unique: true });
noticeSchema.index({ societyId: 1, status: 1, isPinned: -1, publishedAt: -1 });
noticeSchema.index({ title: 'text', body: 'text' });

export type NoticeDoc = HydratedDocumentFromSchema<typeof noticeSchema>;
export const Notice = mongoose.model('Notice', noticeSchema);

const noticeReadSchema = new Schema(
  {
    societyId: societyField,
    noticeId: { type: ObjectIdType, ref: 'Notice', required: true, index: true },
    userId: { type: ObjectIdType, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
    acknowledgedAt: { type: Date, default: null },
  },
  baseOptions,
);
noticeReadSchema.index({ noticeId: 1, userId: 1 }, { unique: true });

export const NoticeRead = mongoose.model('NoticeRead', noticeReadSchema);
