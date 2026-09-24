import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { VotingStatus, VotingTypes } from '@society-erp/shared';
import { baseOptions, ObjectIdType, societyField } from './base';
import { audienceMongoSchema } from '../core/audience/audience.service';

const optionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    /** election candidates */
    unitCode: { type: String, trim: true, maxlength: 40 },
    userId: { type: ObjectIdType, ref: 'User', default: null },
    statement: { type: String, trim: true, maxlength: 1000 },
    votes: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * Formal vote: a resolution (for / against / abstain) or an election (pick up to `seats` candidates).
 * Ballots are separate documents; results are frozen when the voting closes.
 */
const votingSchema = new Schema(
  {
    societyId: societyField,
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000 },
    type: { type: String, enum: VotingTypes, default: 'RESOLUTION', index: true },
    audience: { type: audienceMongoSchema, default: () => ({ type: 'ALL' }) },
    audienceLabel: { type: String, default: 'Everyone' },
    options: { type: [optionSchema], default: [] },
    seats: { type: Number, default: 1, min: 1 },
    oneVotePerUnit: { type: Boolean, default: true },
    anonymous: { type: Boolean, default: true },
    /** resolution passes when FOR votes exceed this share of votes cast (excluding abstentions) */
    passThresholdPercent: { type: Number, default: 50 },
    quorumPercent: { type: Number, default: 0 },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null, index: true },
    status: { type: String, enum: VotingStatus, default: 'DRAFT', index: true },
    eligibleCount: { type: Number, default: 0 },
    voteCount: { type: Number, default: 0 },
    results: {
      outcome: { type: String, enum: ['PASSED', 'FAILED', 'NO_QUORUM', 'ELECTED', 'INCONCLUSIVE'], default: null },
      turnoutPercent: { type: Number, default: null },
      quorumMet: { type: Boolean, default: null },
      winners: { type: [String], default: [] },
      computedAt: { type: Date },
    },
    meetingId: { type: ObjectIdType, ref: 'Meeting', default: null },
    resolutionKey: { type: String, default: null },
    closedAt: { type: Date },
    cancelledAt: { type: Date },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);
votingSchema.index({ societyId: 1, status: 1, createdAt: -1 });

export type VotingDoc = HydratedDocumentFromSchema<typeof votingSchema>;
export const Voting = mongoose.model('Voting', votingSchema);

const ballotSchema = new Schema(
  {
    societyId: societyField,
    votingId: { type: ObjectIdType, ref: 'Voting', required: true, index: true },
    userId: { type: ObjectIdType, ref: 'User', required: true },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    choices: { type: [String], default: [] },
  },
  baseOptions,
);
ballotSchema.index({ votingId: 1, userId: 1 }, { unique: true });
ballotSchema.index({ votingId: 1, unitId: 1 });

export const VotingBallot = mongoose.model('VotingBallot', ballotSchema);
