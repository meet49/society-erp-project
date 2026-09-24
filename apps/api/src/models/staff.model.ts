import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { AttendanceStatus, StaffStatus } from '@society-erp/shared';
import { attachmentSchema, baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

/** Society-employed or agency staff (housekeeping, security, maintenance…). */
const staffSchema = new Schema(
  {
    societyId: societyField,
    staffNumber: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    categoryKey: { type: String, required: true, trim: true, uppercase: true, index: true },
    designation: { type: String, trim: true, maxlength: 120 },
    employmentType: { type: String, enum: ['SOCIETY', 'AGENCY', 'CONTRACT'], default: 'SOCIETY' },
    vendorId: { type: ObjectIdType, ref: 'Vendor', default: null },
    shiftKey: { type: String, trim: true, uppercase: true, default: 'GENERAL' },
    weeklyOff: { type: [Number], default: [0] },
    joinedAt: { type: Date, default: null },
    leftAt: { type: Date, default: null },
    status: { type: String, enum: StaffStatus, default: 'ACTIVE', index: true },
    salary: { amount: { type: Number, default: 0 }, cycle: { type: String, enum: ['MONTHLY', 'DAILY'], default: 'MONTHLY' } },
    idProof: { type: { type: String, trim: true }, number: { type: String, trim: true } },
    photoKey: { type: String },
    documents: { type: [attachmentSchema], default: [] },
    policeVerifiedAt: { type: Date, default: null },
    emergencyContact: { name: { type: String, trim: true }, phone: { type: String, trim: true } },
    address: { type: String, trim: true, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 1000 },
    /** optional login (e.g. supervisor) linked to this staff record */
    userId: { type: ObjectIdType, ref: 'User', default: null },
    createdBy: { type: ObjectIdType, ref: 'User' },
    ...softDeleteFields,
  },
  baseOptions,
);
staffSchema.index({ societyId: 1, staffNumber: 1 }, { unique: true });
staffSchema.index({ societyId: 1, status: 1, categoryKey: 1 });
staffSchema.index({ name: 'text', phone: 'text', designation: 'text' });

export type StaffDoc = HydratedDocumentFromSchema<typeof staffSchema>;
export const Staff = mongoose.model('Staff', staffSchema);

/** One attendance row per staff per day (date is `YYYY-MM-DD` in the society's local time). */
const attendanceSchema = new Schema(
  {
    societyId: societyField,
    staffId: { type: ObjectIdType, ref: 'Staff', required: true, index: true },
    date: { type: String, required: true, index: true },
    status: { type: String, enum: AttendanceStatus, required: true },
    checkInAt: { type: Date, default: null },
    checkOutAt: { type: Date, default: null },
    minutesWorked: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    late: { type: Boolean, default: false },
    source: { type: String, enum: ['MANUAL', 'GATE', 'AUTO'], default: 'MANUAL' },
    note: { type: String, trim: true, maxlength: 300 },
    markedBy: { type: ObjectIdType, ref: 'User', default: null },
  },
  baseOptions,
);
attendanceSchema.index({ staffId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ societyId: 1, date: 1 });

export const Attendance = mongoose.model('Attendance', attendanceSchema);
