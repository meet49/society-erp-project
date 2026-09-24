import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/** Society-level configuration: billing config, visitor rules, SLA policies, notification channels... */
const societySettingSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', required: true, index: true },
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

societySettingSchema.index({ societyId: 1, key: 1 }, { unique: true });

export type SocietySettingDoc = HydratedDocumentFromSchema<typeof societySettingSchema>;
export const SocietySetting = mongoose.model('SocietySetting', societySettingSchema);
