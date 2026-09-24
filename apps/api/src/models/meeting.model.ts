import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { MeetingStatus, MeetingTypes } from '@society-erp/shared';
import { attachmentSchema, baseOptions, ObjectIdType, societyField } from './base';
import { audienceMongoSchema } from '../core/audience/audience.service';

const agendaItemSchema = new Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    presenter: { type: String, trim: true, maxlength: 120 },
    durationMinutes: { type: Number, default: 0 },
    outcome: { type: String, trim: true, maxlength: 2000 },
  },
  { _id: false },
);

const attendeeSchema = new Schema(
  {
    userId: { type: ObjectIdType, ref: 'User', default: null },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    name: { type: String, trim: true, maxlength: 120 },
    /** member's own confirmation before the meeting */
    rsvp: { type: String, enum: ['YES', 'NO', 'MAYBE'], default: null },
    /** recorded by the secretary during / after the meeting */
    present: { type: Boolean, default: false },
    proxyFor: { type: String, trim: true, maxlength: 120 },
    markedAt: { type: Date },
  },
  { _id: false },
);

const resolutionSchema = new Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 3000 },
    proposedBy: { type: String, trim: true, maxlength: 120 },
    secondedBy: { type: String, trim: true, maxlength: 120 },
    votesFor: { type: Number, default: 0 },
    votesAgainst: { type: Number, default: 0 },
    abstained: { type: Number, default: 0 },
    outcome: { type: String, enum: ['PENDING', 'PASSED', 'FAILED', 'DEFERRED'], default: 'PENDING' },
    /** when a formal e-vote was opened for this resolution */
    votingId: { type: ObjectIdType, ref: 'Voting', default: null },
  },
  { _id: false },
);

/** Committee meeting / AGM / SGM: agenda, attendance with quorum, minutes and resolutions. */
const meetingSchema = new Schema(
  {
    societyId: societyField,
    meetingNumber: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: MeetingTypes, default: 'COMMITTEE', index: true },
    description: { type: String, trim: true, maxlength: 3000 },
    scheduledAt: { type: Date, required: true, index: true },
    endAt: { type: Date, default: null },
    venue: { type: String, trim: true, maxlength: 200 },
    mode: { type: String, enum: ['IN_PERSON', 'ONLINE', 'HYBRID'], default: 'IN_PERSON' },
    meetingLink: { type: String, trim: true, maxlength: 500 },
    audience: { type: audienceMongoSchema, default: () => ({ type: 'ROLE', roleKeys: ['COMMITTEE', 'SOCIETY_ADMIN'] }) },
    audienceLabel: { type: String, default: 'Committee' },
    agenda: { type: [agendaItemSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    attendees: { type: [attendeeSchema], default: [] },
    quorum: {
      /** percent of eligible (units for AGM / SGM, people otherwise) */
      percent: { type: Number, default: 0 },
      eligible: { type: Number, default: 0 },
      present: { type: Number, default: 0 },
      met: { type: Boolean, default: false },
    },
    minutes: {
      body: { type: String, maxlength: 50000 },
      recordedBy: { type: ObjectIdType, ref: 'User', default: null },
      recordedAt: { type: Date },
      publishedAt: { type: Date },
    },
    resolutions: { type: [resolutionSchema], default: [] },
    status: { type: String, enum: MeetingStatus, default: 'SCHEDULED', index: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String, maxlength: 500 },
    reminderSentAt: { type: Date, default: null },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);
meetingSchema.index({ societyId: 1, meetingNumber: 1 }, { unique: true });
meetingSchema.index({ societyId: 1, status: 1, scheduledAt: -1 });

export type MeetingDoc = HydratedDocumentFromSchema<typeof meetingSchema>;
export const Meeting = mongoose.model('Meeting', meetingSchema);
