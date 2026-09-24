import { z } from 'zod';
import { AttendanceStatus, StaffStatus, booleanQuerySchema, objectIdSchema, paginationQuerySchema } from '@society-erp/shared';
import { ParkingSlotTypes, VehicleTypes } from '../../models/vehicle.model';

const attachment = z.object({ name: z.string().trim().min(1).max(200), storageKey: z.string().trim().min(1).max(300), mimeType: z.string().trim().max(100).optional(), size: z.coerce.number().int().min(0).optional() });
const timeRx = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRx = /^\d{4}-\d{2}-\d{2}$/;
const monthRx = /^\d{4}-\d{2}$/;

// ------------------------------------------------------------------ staff
export const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  categoryKey: z.string().trim().min(1).max(40),
  designation: z.string().trim().max(120).optional(),
  employmentType: z.enum(['SOCIETY', 'AGENCY', 'CONTRACT']).default('SOCIETY'),
  vendorId: objectIdSchema.nullable().optional(),
  shiftKey: z.string().trim().max(30).optional(),
  weeklyOff: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
  joinedAt: z.coerce.date().nullable().optional(),
  salary: z.object({ amount: z.coerce.number().min(0).max(10_000_000), cycle: z.enum(['MONTHLY', 'DAILY']).default('MONTHLY') }).optional(),
  idProof: z.object({ type: z.string().trim().max(40), number: z.string().trim().max(60) }).optional(),
  photoKey: z.string().trim().max(300).optional(),
  documents: z.array(attachment).max(10).optional(),
  policeVerifiedAt: z.coerce.date().nullable().optional(),
  emergencyContact: z.object({ name: z.string().trim().max(120), phone: z.string().trim().max(20) }).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(StaffStatus).optional(),
});
export const staffUpdateSchema = staffCreateSchema.partial().extend({ leftAt: z.coerce.date().nullable().optional() });
export const staffListQuerySchema = paginationQuerySchema.extend({ status: z.enum(StaffStatus).optional(), categoryKey: z.string().max(40).optional(), employmentType: z.enum(['SOCIETY', 'AGENCY', 'CONTRACT']).optional(), vendorId: objectIdSchema.optional(), includeInactive: booleanQuerySchema });
export const attendanceMarkSchema = z.object({
  date: z.string().regex(dateRx, 'Use YYYY-MM-DD'),
  entries: z.array(z.object({ staffId: objectIdSchema, status: z.enum(AttendanceStatus), checkInAt: z.coerce.date().nullable().optional(), checkOutAt: z.coerce.date().nullable().optional(), note: z.string().trim().max(300).optional() })).min(1).max(500),
});
export const registerQuerySchema = z.object({ month: z.string().regex(monthRx, 'Use YYYY-MM').optional(), categoryKey: z.string().max(40).optional() });
export const punchSchema = z.object({ gateId: objectIdSchema.optional(), clientRef: z.string().trim().max(64).optional(), at: z.coerce.date().optional() });
export const staffConfigSchema = z.object({
  shiftGraceMinutes: z.coerce.number().int().min(0).max(240),
  overtimeAfterMinutes: z.coerce.number().int().min(60).max(24 * 60),
  defaultShiftKey: z.string().trim().max(30),
  shifts: z.array(z.object({ key: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(60), startTime: z.string().regex(timeRx), endTime: z.string().regex(timeRx) })).min(1).max(12),
  attendanceReminderHour: z.coerce.number().int().min(0).max(23),
}).partial();

// ------------------------------------------------------------------ domestic help
export const helpRegisterSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(20),
  typeKey: z.string().trim().min(1).max(40),
  unitId: objectIdSchema.optional(),
  schedule: z.string().trim().max(200).optional(),
  photo: z.string().max(3_000_000).optional(),
  idProof: z.object({ type: z.string().trim().max(40), number: z.string().trim().max(60), storageKey: z.string().trim().max(300).optional() }).optional(),
});
export const helpUpdateSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().min(6).max(20).optional(), typeKey: z.string().trim().min(1).max(40).optional(), schedule: z.string().trim().max(200).optional(), photo: z.string().max(3_000_000).optional(), idProof: z.object({ type: z.string().trim().max(40), number: z.string().trim().max(60), storageKey: z.string().trim().max(300).optional() }).optional(), unitId: objectIdSchema.optional() });
export const helpListQuerySchema = paginationQuerySchema.extend({ typeKey: z.string().max(40).optional(), status: z.enum(['ACTIVE', 'BLOCKED', 'INACTIVE']).optional(), verification: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(), unitId: objectIdSchema.optional(), insideOnly: booleanQuerySchema });
export const helpVerifySchema = z.object({ status: z.enum(['VERIFIED', 'REJECTED']), note: z.string().trim().max(300).optional(), policeVerificationKey: z.string().trim().max(300).optional() });
export const helpBlockSchema = z.object({ reason: z.string().trim().min(2).max(300) });
export const helpLookupSchema = z.object({ code: z.string().trim().min(4).max(120) });
export const helpPunchSchema = z.object({ gateId: objectIdSchema.optional(), unitId: objectIdSchema.optional(), clientRef: z.string().trim().max(64).optional() });
export const helpLogsQuerySchema = paginationQuerySchema.extend({ helpId: objectIdSchema.optional(), unitId: objectIdSchema.optional(), date: z.string().regex(dateRx).optional() });
export const helpConfigSchema = z.object({ notifyOnEntry: z.boolean(), requireVerificationForEntry: z.boolean(), passcodeLength: z.coerce.number().int().min(4).max(8) }).partial();

// ------------------------------------------------------------------ vehicles & parking
export const vehicleCreateSchema = z.object({
  unitId: objectIdSchema.optional(),
  number: z.string().trim().min(4).max(20),
  type: z.enum(VehicleTypes).default('CAR'),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  color: z.string().trim().max(30).optional(),
  stickerNumber: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(300).optional(),
});
export const vehicleUpdateSchema = vehicleCreateSchema.omit({ unitId: true }).partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() });
export const vehicleListQuerySchema = paginationQuerySchema.extend({ unitId: objectIdSchema.optional(), type: z.enum(VehicleTypes).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), unparkedOnly: booleanQuerySchema });
export const vehicleLookupQuerySchema = z.object({ q: z.string().trim().min(2).max(20) });
export const slotCreateSchema = z.object({ code: z.string().trim().min(1).max(20), zone: z.string().trim().max(40).optional(), level: z.string().trim().max(20).optional(), type: z.enum(ParkingSlotTypes).default('CAR'), status: z.enum(['AVAILABLE', 'RESERVED', 'BLOCKED']).optional(), monthlyCharge: z.coerce.number().min(0).optional(), notes: z.string().trim().max(300).optional() });
export const slotUpdateSchema = slotCreateSchema.partial();
export const slotBulkSchema = z.object({ prefix: z.string().trim().max(10).default(''), from: z.coerce.number().int().min(0).max(9999), to: z.coerce.number().int().min(0).max(9999), zone: z.string().trim().max(40).optional(), level: z.string().trim().max(20).optional(), type: z.enum(ParkingSlotTypes).default('CAR'), monthlyCharge: z.coerce.number().min(0).optional() }).refine((v) => v.to >= v.from && v.to - v.from < 1000, { message: 'Range must be ascending and under 1000 slots', path: ['to'] });
export const slotListQuerySchema = paginationQuerySchema.extend({ status: z.enum(['AVAILABLE', 'ALLOCATED', 'RESERVED', 'BLOCKED']).optional(), type: z.enum(ParkingSlotTypes).optional(), zone: z.string().max(40).optional(), unitId: objectIdSchema.optional() });
export const allocateSchema = z.object({ unitId: objectIdSchema, vehicleId: objectIdSchema.nullable().optional() });
