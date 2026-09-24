import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

const conditionSchema = new Schema(
  {
    field: { type: String, required: true },
    operator: { type: String, enum: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'in'], required: true },
    value: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const workflowStepSchema = new Schema(
  {
    order: { type: Number, required: true },
    name: { type: String, required: true },
    approverType: { type: String, enum: ['ROLE', 'USER', 'PERMISSION'], required: true },
    /** role key, user id or permission key depending on approverType */
    approverRef: { type: String, required: true },
    /** optional condition on the entity context; step is skipped when the condition is false */
    condition: { type: conditionSchema, default: null },
    requiredApprovals: { type: Number, default: 1 },
  },
  { _id: false },
);

/** Configurable approval workflow definitions (expense approval, purchase approval, amenity approval...). */
const workflowDefinitionSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', required: true, index: true },
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    entityType: { type: String, required: true },
    active: { type: Boolean, default: true },
    steps: { type: [workflowStepSchema], default: [] },
    /** entities matching this condition are auto-approved (e.g. amount lt 1000) */
    autoApproveCondition: { type: conditionSchema, default: null },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);
workflowDefinitionSchema.index({ societyId: 1, key: 1 }, { unique: true });

const decisionSchema = new Schema(
  {
    userId: { type: ObjectIdType, ref: 'User', required: true },
    decision: { type: String, enum: ['APPROVED', 'REJECTED'], required: true },
    note: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const instanceStepSchema = new Schema(
  {
    order: { type: Number, required: true },
    name: { type: String, required: true },
    approverType: { type: String, required: true },
    approverRef: { type: String, required: true },
    requiredApprovals: { type: Number, default: 1 },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'SKIPPED'], default: 'PENDING' },
    decisions: { type: [decisionSchema], default: [] },
  },
  { _id: false },
);

const workflowInstanceSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', required: true, index: true },
    workflowId: { type: ObjectIdType, ref: 'WorkflowDefinition', required: true },
    workflowKey: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: ObjectIdType, required: true, index: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING', index: true },
    currentStep: { type: Number, default: 0 },
    steps: { type: [instanceStepSchema], default: [] },
    context: { type: Schema.Types.Mixed, default: {} },
    startedBy: { type: ObjectIdType, ref: 'User' },
    completedAt: { type: Date },
  },
  baseOptions,
);
workflowInstanceSchema.index({ societyId: 1, entityType: 1, entityId: 1 });

export type WorkflowDefinitionDoc = HydratedDocumentFromSchema<typeof workflowDefinitionSchema>;
export type WorkflowInstanceDoc = HydratedDocumentFromSchema<typeof workflowInstanceSchema>;
export const WorkflowDefinition = mongoose.model('WorkflowDefinition', workflowDefinitionSchema);
export const WorkflowInstance = mongoose.model('WorkflowInstance', workflowInstanceSchema);
