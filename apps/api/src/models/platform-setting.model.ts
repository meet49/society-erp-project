import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/** Key/value platform configuration (subscription rules, landing/brand settings, thresholds...). */
const platformSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed },
    group: { type: String, default: 'general', index: true },
    label: { type: String },
    description: { type: String },
    /** public settings are exposed to the unauthenticated landing page */
    isPublic: { type: Boolean, default: false },
    /** secret settings are never returned to clients */
    isSecret: { type: Boolean, default: false },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

export type PlatformSettingDoc = HydratedDocumentFromSchema<typeof platformSettingSchema>;
export const PlatformSetting = mongoose.model('PlatformSetting', platformSettingSchema);
