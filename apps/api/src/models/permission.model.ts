import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { RoleScope } from '@society-erp/shared';
import { baseOptions } from './base';

/** Permission catalogue (seeded from module definitions, editable labels). */
const permissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String },
    scope: { type: String, enum: Object.values(RoleScope), required: true },
    ownScope: { type: Boolean, default: false },
  },
  baseOptions,
);

export type PermissionDoc = HydratedDocumentFromSchema<typeof permissionSchema>;
export const Permission = mongoose.model('Permission', permissionSchema);
