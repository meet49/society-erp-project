import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';

export const ImportTypes = ['UNITS', 'RESIDENTS', 'VEHICLES', 'STAFF', 'ASSETS', 'INVENTORY_ITEMS'] as const;
export const ImportStatuses = ['UPLOADED', 'VALIDATED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;

const errorSchema = new Schema({ row: { type: Number, required: true }, field: { type: String }, message: { type: String, required: true } }, { _id: false });

/** One spreadsheet import: the uploaded file, the column mapping, the dry-run result and the outcome of the run. */
const importJobSchema = new Schema(
  {
    societyId: societyField,
    type: { type: String, enum: ImportTypes, required: true, index: true },
    status: { type: String, enum: ImportStatuses, default: 'UPLOADED', index: true },
    fileName: { type: String, required: true },
    storageKey: { type: String, required: true },
    headers: { type: [String], default: [] },
    sampleRows: { type: [[String]], default: [] },
    totalRows: { type: Number, default: 0 },
    mapping: { type: Map, of: String, default: {} },
    options: { skipExisting: { type: Boolean, default: true }, sendInvites: { type: Boolean, default: false }, defaultBuildingCode: { type: String } },
    validation: { ok: { type: Number, default: 0 }, failed: { type: Number, default: 0 }, errors: { type: [errorSchema], default: [] }, at: { type: Date, default: null } },
    progress: { processed: { type: Number, default: 0 }, succeeded: { type: Number, default: 0 }, failed: { type: Number, default: 0 }, skipped: { type: Number, default: 0 } },
    errors: { type: [errorSchema], default: [] },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    failureReason: { type: String },
    createdBy: { type: ObjectIdType, ref: 'User', required: true },
  },
  baseOptions,
);
importJobSchema.index({ societyId: 1, createdAt: -1 });

export type ImportJobDoc = HydratedDocumentFromSchema<typeof importJobSchema>;
export const ImportJob = mongoose.model('ImportJob', importJobSchema);
