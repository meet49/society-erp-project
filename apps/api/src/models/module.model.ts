import mongoose, { Schema, type HydratedDocumentFromSchema, type InferSchemaType } from 'mongoose';
import { ModuleCategory, ModuleStatus, RoleScope } from '@society-erp/shared';
import { baseOptions } from './base';

const actionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String },
    ownScope: { type: Boolean, default: false },
  },
  { _id: false },
);

const navigationSchema = new Schema(
  {
    key: { type: String, required: true },
    group: { type: String, required: true },
    label: { type: String, required: true },
    path: { type: String, required: true },
    icon: { type: String },
    sortOrder: { type: Number, default: 0 },
    permissions: { type: [String], default: [] },
    audience: { type: String, enum: ['ADMIN', 'MEMBER', 'GUARD', 'PLATFORM'], default: 'ADMIN' },
    featureFlag: { type: String },
    hidden: { type: Boolean, default: false },
  },
  { _id: false },
);

/** Global module catalogue. Seeded from the shared registry, editable by the platform owner. */
const moduleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    icon: { type: String, default: 'Box' },
    category: { type: String, enum: Object.values(ModuleCategory), required: true, index: true },
    scope: { type: String, enum: Object.values(RoleScope), required: true, index: true },
    status: { type: String, enum: Object.values(ModuleStatus), default: ModuleStatus.ACTIVE, index: true },
    isCore: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    dependencies: { type: [String], default: [] },
    actions: { type: [actionSchema], default: [] },
    navigation: { type: [navigationSchema], default: [] },
    featureFlag: { type: String },
    version: { type: String, default: '1.0.0' },
    configuration: { type: Schema.Types.Mixed, default: {} },
  },
  baseOptions,
);

export type ModuleDoc = HydratedDocumentFromSchema<typeof moduleSchema>;
export type ModuleLean = InferSchemaType<typeof moduleSchema> & { _id: mongoose.Types.ObjectId };
export const ModuleModel = mongoose.model('Module', moduleSchema);
