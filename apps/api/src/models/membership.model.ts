import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/** A user's membership in a society. Direct permissions are optional overrides on top of roles. */
const membershipSchema = new Schema(
  {
    userId: { type: ObjectIdType, ref: 'User', required: true, index: true },
    societyId: { type: ObjectIdType, ref: 'Society', required: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    directPermissions: {
      allow: { type: [String], default: [] },
      deny: { type: [String], default: [] },
    },
    residentId: { type: ObjectIdType, ref: 'Resident', default: null },
    staffId: { type: ObjectIdType, ref: 'Staff', default: null },
    isPrimaryAdmin: { type: Boolean, default: false },
    label: { type: String, trim: true },
    invitedBy: { type: ObjectIdType, ref: 'User' },
    joinedAt: { type: Date, default: Date.now },
    deactivatedAt: { type: Date },
    deactivatedBy: { type: ObjectIdType, ref: 'User' },
    lastActiveAt: { type: Date },
  },
  baseOptions,
);

membershipSchema.index({ userId: 1, societyId: 1 }, { unique: true });

export type MembershipDoc = HydratedDocumentFromSchema<typeof membershipSchema>;
export const Membership = mongoose.model('Membership', membershipSchema);
