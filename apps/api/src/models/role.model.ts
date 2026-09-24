import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { RoleLanding, RoleScope } from '@society-erp/shared';
import { baseOptions, ObjectIdType } from './base';

const roleSchema = new Schema(
  {
    /** null for platform roles */
    societyId: { type: ObjectIdType, ref: 'Society', default: null, index: true },
    scope: { type: String, enum: Object.values(RoleScope), required: true, index: true },
    key: { type: String, required: true, trim: true, uppercase: true, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    permissions: { type: [String], default: [] },
    /** role automatically holds every permission of every accessible module */
    grantsAllPermissions: { type: Boolean, default: false },
    landing: { type: String, enum: Object.values(RoleLanding), default: RoleLanding.ADMIN },
    isSystem: { type: Boolean, default: false },
    color: { type: String, default: 'slate' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    createdBy: { type: ObjectIdType, ref: 'User' },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

roleSchema.index({ societyId: 1, key: 1 }, { unique: true });

export type RoleDoc = HydratedDocumentFromSchema<typeof roleSchema>;
export const Role = mongoose.model('Role', roleSchema);
