import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { attachmentSchema, baseOptions, ObjectIdType, societyField } from './base';
import { audienceMongoSchema } from '../core/audience/audience.service';

const commentSchema = new Schema(
  {
    userId: { type: ObjectIdType, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    at: { type: Date, default: Date.now },
    hidden: { type: Boolean, default: false },
  },
  { _id: true },
);

const reportSchema = new Schema({ userId: { type: ObjectIdType, ref: 'User', required: true }, reason: { type: String, trim: true, maxlength: 300 }, at: { type: Date, default: Date.now } }, { _id: false });

/** Community feed post or committee announcement. Moderation keeps the feed civil without deleting history. */
const postSchema = new Schema(
  {
    societyId: societyField,
    kind: { type: String, enum: ['POST', 'ANNOUNCEMENT'], default: 'POST', index: true },
    title: { type: String, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    attachments: { type: [attachmentSchema], default: [] },
    /** announcements can be targeted; plain posts are visible to the whole society */
    audience: { type: audienceMongoSchema, default: () => ({ type: 'ALL' }) },
    audienceLabel: { type: String, default: 'Everyone' },
    createdBy: { type: ObjectIdType, ref: 'User', required: true, index: true },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    status: { type: String, enum: ['ACTIVE', 'PENDING', 'HIDDEN'], default: 'ACTIVE', index: true },
    isPinned: { type: Boolean, default: false },
    likes: { type: [ObjectIdType], default: [] },
    likeCount: { type: Number, default: 0 },
    comments: { type: [commentSchema], default: [] },
    commentCount: { type: Number, default: 0 },
    reports: { type: [reportSchema], default: [] },
    reportCount: { type: Number, default: 0 },
    moderatedBy: { type: ObjectIdType, ref: 'User', default: null },
    moderationNote: { type: String, maxlength: 300 },
    deletedAt: { type: Date, default: null },
  },
  baseOptions,
);

postSchema.index({ societyId: 1, status: 1, isPinned: -1, createdAt: -1 });
postSchema.index({ societyId: 1, reportCount: -1 });

export type PostDoc = HydratedDocumentFromSchema<typeof postSchema>;
export const Post = mongoose.model('Post', postSchema);
