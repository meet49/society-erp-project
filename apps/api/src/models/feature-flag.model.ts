import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

const featureFlagSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    enabled: { type: Boolean, default: false },
    enabledForSocietyIds: { type: [ObjectIdType], default: [] },
    enabledForPlanIds: { type: [ObjectIdType], default: [] },
    disabledForSocietyIds: { type: [ObjectIdType], default: [] },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

export type FeatureFlagDoc = HydratedDocumentFromSchema<typeof featureFlagSchema>;
export const FeatureFlag = mongoose.model('FeatureFlag', featureFlagSchema);
