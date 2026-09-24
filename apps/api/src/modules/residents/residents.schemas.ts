import { z } from 'zod';
import { ResidentTypes, emailSchema, objectIdSchema, paginationQuerySchema, phoneSchema } from '@society-erp/shared';
import { MoveTypes } from '../../models/unit-occupancy.model';

const emergencyContact = z.object({ name: z.string().trim().min(1).max(80), phone: phoneSchema, relation: z.string().trim().max(40).optional() });

export const residentBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema.optional().or(z.literal('')),
  phone: phoneSchema.optional().or(z.literal('')),
  altPhone: phoneSchema.optional().or(z.literal('')),
  type: z.enum(ResidentTypes),
  relationship: z.string().trim().max(40).optional(),
  isPrimary: z.boolean().optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']).optional(),
  occupation: z.string().trim().max(80).optional(),
  bloodGroup: z.string().trim().max(5).optional(),
  photoUrl: z.string().url().max(500).optional().or(z.literal('')),
  emergencyContacts: z.array(emergencyContact).max(5).optional(),
  ownership: z.object({ sharePercent: z.coerce.number().min(0).max(100).optional(), since: z.coerce.date().optional(), agreementRef: z.string().max(80).optional() }).optional(),
  tenancy: z.object({ startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), rent: z.coerce.number().min(0).optional(), deposit: z.coerce.number().min(0).optional(), agreementRef: z.string().max(80).optional(), policeVerificationAt: z.coerce.date().optional() }).optional(),
  moveInDate: z.coerce.date().optional(),
  tags: z.array(z.string().trim().max(30)).max(10).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const residentCreateSchema = residentBaseSchema.extend({ unitId: objectIdSchema, createLogin: z.boolean().optional() });
export const residentUpdateSchema = residentBaseSchema.partial().extend({ unitId: objectIdSchema.optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() });

export const residentListQuerySchema = paginationQuerySchema.extend({
  unitId: objectIdSchema.optional(),
  buildingId: objectIdSchema.optional(),
  type: z.enum(ResidentTypes).optional(),
  status: z.enum(['ACTIVE', 'PENDING', 'MOVED_OUT', 'INACTIVE']).optional(),
  hasLogin: z.enum(['true', 'false']).optional(),
});

export const lookupQuerySchema = z.object({ q: z.string().trim().min(1).max(60), limit: z.coerce.number().int().min(1).max(50).default(10) });

export const familyMemberSchema = residentBaseSchema.pick({ name: true, phone: true, email: true, relationship: true, dateOfBirth: true, gender: true, bloodGroup: true }).extend({ type: z.enum(['FAMILY', 'CAREGIVER', 'OTHER']).default('FAMILY'), unitId: objectIdSchema.optional() });

export const moveRequestSchema = z
  .object({
    type: z.enum(MoveTypes),
    unitId: objectIdSchema,
    residentType: z.enum(['OWNER', 'TENANT']).default('TENANT'),
    residentId: objectIdSchema.optional(),
    resident: residentBaseSchema.omit({ type: true }).optional(),
    date: z.coerce.date().default(() => new Date()),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.type === 'MOVE_OUT' || v.residentId || v.resident, { message: 'Provide an existing resident or the new resident details', path: ['resident'] });

export const moveListQuerySchema = paginationQuerySchema.extend({
  type: z.enum(MoveTypes).optional(),
  approvalStatus: z.enum(['NA', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
  unitId: objectIdSchema.optional(),
});

export const rejectSchema = z.object({ reason: z.string().trim().min(2).max(500) });
export const inviteResidentSchema = z.object({ email: emailSchema.optional(), roleIds: z.array(objectIdSchema).max(5).optional() });
