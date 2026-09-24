import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { attachmentSchema, baseOptions, ObjectIdType, societyField } from './base';
import { audienceMongoSchema } from '../core/audience/audience.service';

export const EventStatuses = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'] as const;
export const RsvpStatuses = ['GOING', 'MAYBE', 'NOT_GOING'] as const;

/** Community event with audience targeting, capacity and RSVP tracking. */
const eventSchema = new Schema(
  {
    societyId: societyField,
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 5000 },
    typeKey: { type: String, trim: true, uppercase: true, default: 'COMMUNITY', index: true },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    venue: { type: String, trim: true, maxlength: 200 },
    audience: { type: audienceMongoSchema, default: () => ({ type: 'ALL' }) },
    audienceLabel: { type: String, default: 'Everyone' },
    coverImage: { type: attachmentSchema, default: null },
    attachments: { type: [attachmentSchema], default: [] },
    /** 0 = unlimited (counts people + their guests) */
    capacity: { type: Number, default: 0, min: 0 },
    maxGuestsPerRsvp: { type: Number, default: 0, min: 0 },
    rsvpDeadline: { type: Date, default: null },
    allowRsvp: { type: Boolean, default: true },
    status: { type: String, enum: EventStatuses, default: 'DRAFT', index: true },
    goingCount: { type: Number, default: 0 },
    guestsCount: { type: Number, default: 0 },
    maybeCount: { type: Number, default: 0 },
    notGoingCount: { type: Number, default: 0 },
    publishedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String, maxlength: 500 },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

eventSchema.index({ societyId: 1, status: 1, startAt: 1 });
eventSchema.index({ title: 'text', description: 'text' });

export type EventDoc = HydratedDocumentFromSchema<typeof eventSchema>;
export const Event = mongoose.model('Event', eventSchema);

const rsvpSchema = new Schema(
  {
    societyId: societyField,
    eventId: { type: ObjectIdType, ref: 'Event', required: true, index: true },
    userId: { type: ObjectIdType, ref: 'User', required: true },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    status: { type: String, enum: RsvpStatuses, required: true },
    guests: { type: Number, default: 0, min: 0 },
    note: { type: String, trim: true, maxlength: 300 },
  },
  baseOptions,
);
rsvpSchema.index({ eventId: 1, userId: 1 }, { unique: true });

export const EventRsvp = mongoose.model('EventRsvp', rsvpSchema);
