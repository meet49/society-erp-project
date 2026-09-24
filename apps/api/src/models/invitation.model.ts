import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

const invitationSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    roleIds: { type: [ObjectIdType], default: [] },
    residentId: { type: ObjectIdType, ref: 'Resident', default: null },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    message: { type: String, maxlength: 500 },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'], default: 'PENDING', index: true },
    acceptedAt: { type: Date },
    acceptedUserId: { type: ObjectIdType, ref: 'User' },
    invitedBy: { type: ObjectIdType, ref: 'User', required: true },
    lastSentAt: { type: Date, default: Date.now },
  },
  baseOptions,
);

invitationSchema.index({ societyId: 1, email: 1, status: 1 });

export type InvitationDoc = HydratedDocumentFromSchema<typeof invitationSchema>;
export const Invitation = mongoose.model('Invitation', invitationSchema);
