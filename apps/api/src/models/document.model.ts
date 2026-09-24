import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

export const DocumentStatuses = ['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'ARCHIVED'] as const;
export const DocumentVisibilities = ['ADMIN', 'COMMITTEE', 'MEMBERS', 'UNIT'] as const;

const versionSchema = new Schema(
  {
    version: { type: Number, required: true },
    storageKey: { type: String, required: true },
    name: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number, default: 0 },
    uploadedBy: { type: ObjectIdType, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
    note: { type: String, maxlength: 300 },
  },
  { _id: false },
);

/** Folder tree for the repository (per society). */
const folderSchema = new Schema(
  {
    societyId: societyField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    parentId: { type: ObjectIdType, ref: 'DocumentFolder', default: null, index: true },
    /** who may browse this folder; documents inside can be narrower */
    visibility: { type: String, enum: DocumentVisibilities, default: 'COMMITTEE' },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);
folderSchema.index({ societyId: 1, parentId: 1, name: 1 }, { unique: true });
export const DocumentFolder = mongoose.model('DocumentFolder', folderSchema);

/**
 * Repository document: current file + version history, category, tags, visibility, expiry.
 * Storage keys are never exposed; downloads go through short-lived signed URLs.
 */
const documentSchema = new Schema(
  {
    societyId: societyField,
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    categoryKey: { type: String, trim: true, uppercase: true, default: 'OTHER', index: true },
    folderId: { type: ObjectIdType, ref: 'DocumentFolder', default: null, index: true },
    tags: { type: [String], default: [] },
    visibility: { type: String, enum: DocumentVisibilities, default: 'COMMITTEE', index: true },
    /** for UNIT visibility: the unit(s) whose residents may see it */
    unitIds: { type: [ObjectIdType], default: [] },
    storageKey: { type: String, required: true },
    name: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
    versions: { type: [versionSchema], default: [] },
    status: { type: String, enum: DocumentStatuses, default: 'ACTIVE', index: true },
    workflowInstanceId: { type: ObjectIdType, ref: 'WorkflowInstance', default: null },
    reviewNote: { type: String, maxlength: 500 },
    expiresAt: { type: Date, default: null, index: true },
    isPinned: { type: Boolean, default: false },
    downloadCount: { type: Number, default: 0 },
    uploadedBy: { type: ObjectIdType, ref: 'User' },
    archivedAt: { type: Date },
    archivedBy: { type: ObjectIdType, ref: 'User', default: null },
  },
  baseOptions,
);
documentSchema.index({ societyId: 1, status: 1, folderId: 1, createdAt: -1 });
documentSchema.index({ title: 'text', description: 'text', tags: 'text' });

export type DocumentDoc = HydratedDocumentFromSchema<typeof documentSchema>;
export const Document = mongoose.model('Document', documentSchema);
