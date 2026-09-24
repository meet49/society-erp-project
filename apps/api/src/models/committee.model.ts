import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

export const CommitteeMemberStatuses = ['INCOMING', 'ACTIVE', 'ENDED'] as const;

/** A person holding a committee position for a term. Handover ends the active term and seats the incoming one. */
const committeeMemberSchema = new Schema(
  {
    societyId: societyField,
    userId: { type: ObjectIdType, ref: 'User', default: null, index: true },
    residentId: { type: ObjectIdType, ref: 'Resident', default: null },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    positionKey: { type: String, required: true, trim: true, uppercase: true },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    /** contact details visible to residents */
    showContactToMembers: { type: Boolean, default: false },
    termStart: { type: Date, default: null },
    termEnd: { type: Date, default: null },
    status: { type: String, enum: CommitteeMemberStatuses, default: 'ACTIVE', index: true },
    sortOrder: { type: Number, default: 0 },
    notes: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);
committeeMemberSchema.index({ societyId: 1, status: 1, sortOrder: 1 });

export type CommitteeMemberDoc = HydratedDocumentFromSchema<typeof committeeMemberSchema>;
export const CommitteeMember = mongoose.model('CommitteeMember', committeeMemberSchema);
