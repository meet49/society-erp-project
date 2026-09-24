import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/** Society-specific module state. Module data is never deleted when a module is disabled. */
const societyModuleSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', required: true, index: true },
    moduleKey: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    settings: { type: Schema.Types.Mixed, default: {} },
    enabledAt: { type: Date },
    disabledAt: { type: Date },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

societyModuleSchema.index({ societyId: 1, moduleKey: 1 }, { unique: true });

export type SocietyModuleDoc = HydratedDocumentFromSchema<typeof societyModuleSchema>;
export const SocietyModule = mongoose.model('SocietyModule', societyModuleSchema);
