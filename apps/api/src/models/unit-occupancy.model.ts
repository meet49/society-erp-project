import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { attachmentSchema, baseOptions, ObjectIdType, societyField } from './base';

export const MoveTypes = ['MOVE_IN', 'MOVE_OUT', 'TENANT_CHANGE', 'OWNER_CHANGE'] as const;

/** Move-in / move-out / ownership & tenancy change history per unit. */
const unitOccupancySchema = new Schema(
  {
    societyId: societyField,
    unitId: { type: ObjectIdType, ref: 'Unit', required: true, index: true },
    type: { type: String, enum: MoveTypes, required: true, index: true },
    residentType: { type: String, enum: ['OWNER', 'TENANT'], required: true },
    residentId: { type: ObjectIdType, ref: 'Resident', default: null },
    previousResidentId: { type: ObjectIdType, ref: 'Resident', default: null },
    date: { type: Date, required: true },
    documents: { type: [attachmentSchema], default: [] },
    approvalStatus: { type: String, enum: ['NA', 'PENDING', 'APPROVED', 'REJECTED'], default: 'NA', index: true },
    approvedBy: { type: ObjectIdType, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    outstandingDues: { type: Number, default: 0 },
    notes: { type: String, maxlength: 2000 },
    requestedBy: { type: ObjectIdType, ref: 'User' },
    /** pending resident details when the move needs approval before creating the resident */
    pendingResident: { type: Schema.Types.Mixed, default: null },
  },
  baseOptions,
);

unitOccupancySchema.index({ societyId: 1, date: -1 });

export type UnitOccupancyDoc = HydratedDocumentFromSchema<typeof unitOccupancySchema>;
export const UnitOccupancy = mongoose.model('UnitOccupancy', unitOccupancySchema);
