import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/** One document per role assignment. societyId is null for platform role assignments. */
const userRoleSchema = new Schema(
  {
    userId: { type: ObjectIdType, ref: 'User', required: true, index: true },
    roleId: { type: ObjectIdType, ref: 'Role', required: true, index: true },
    societyId: { type: ObjectIdType, ref: 'Society', default: null, index: true },
    assignedBy: { type: ObjectIdType, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
  },
  baseOptions,
);

userRoleSchema.index({ userId: 1, roleId: 1, societyId: 1 }, { unique: true });
userRoleSchema.index({ societyId: 1, roleId: 1 });

export type UserRoleDoc = HydratedDocumentFromSchema<typeof userRoleSchema>;
export const UserRole = mongoose.model('UserRole', userRoleSchema);
