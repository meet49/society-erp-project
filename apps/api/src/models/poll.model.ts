import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';
import { audienceMongoSchema } from '../core/audience/audience.service';

export const PollStatuses = ['DRAFT', 'OPEN', 'CLOSED'] as const;

const optionSchema = new Schema({ key: { type: String, required: true }, label: { type: String, required: true, trim: true, maxlength: 200 }, votes: { type: Number, default: 0 } }, { _id: false });

/** Quick poll: one question, fixed options, one vote per user (or per unit), optional anonymity. */
const pollSchema = new Schema(
  {
    societyId: societyField,
    question: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 2000 },
    options: { type: [optionSchema], default: [] },
    audience: { type: audienceMongoSchema, default: () => ({ type: 'ALL' }) },
    audienceLabel: { type: String, default: 'Everyone' },
    anonymous: { type: Boolean, default: true },
    oneVotePerUnit: { type: Boolean, default: false },
    allowMultiple: { type: Boolean, default: false },
    showLiveResults: { type: Boolean, default: true },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null, index: true },
    status: { type: String, enum: PollStatuses, default: 'DRAFT', index: true },
    voteCount: { type: Number, default: 0 },
    eligibleCount: { type: Number, default: 0 },
    closedAt: { type: Date },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);
pollSchema.index({ societyId: 1, status: 1, createdAt: -1 });

export type PollDoc = HydratedDocumentFromSchema<typeof pollSchema>;
export const Poll = mongoose.model('Poll', pollSchema);

const voteSchema = new Schema(
  {
    societyId: societyField,
    pollId: { type: ObjectIdType, ref: 'Poll', required: true, index: true },
    userId: { type: ObjectIdType, ref: 'User', required: true },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    optionKeys: { type: [String], default: [] },
  },
  baseOptions,
);
voteSchema.index({ pollId: 1, userId: 1 }, { unique: true });
voteSchema.index({ pollId: 1, unitId: 1 });

export const PollVote = mongoose.model('PollVote', voteSchema);
