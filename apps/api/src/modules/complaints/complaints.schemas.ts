import { z } from 'zod';
import { ComplaintStatus, Priorities, objectIdSchema, paginationQuerySchema, booleanQuerySchema } from '@society-erp/shared';

const attachment = z.object({ name: z.string().trim().min(1).max(200), storageKey: z.string().trim().min(1).max(300), mimeType: z.string().trim().max(100).optional(), size: z.coerce.number().int().min(0).optional() });

export const complaintCreateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).optional(),
  categoryKey: z.string().trim().min(1).max(40),
  subCategory: z.string().trim().max(80).optional(),
  location: z.string().trim().max(160).optional(),
  priority: z.enum(Priorities).optional(),
  /** staff raising on behalf of a unit; ignored for own-scope callers */
  unitId: objectIdSchema.optional().nullable(),
  isPublic: z.boolean().default(false),
  attachments: z.array(attachment).max(10).default([]),
});

export const complaintUpdateSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  categoryKey: z.string().trim().min(1).max(40).optional(),
  subCategory: z.string().trim().max(80).optional(),
  location: z.string().trim().max(160).optional(),
  priority: z.enum(Priorities).optional(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string().trim().max(30)).max(10).optional(),
  costAmount: z.coerce.number().min(0).optional(),
});

export const complaintListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(Object.values(ComplaintStatus) as [string, ...string[]]).optional(),
  priority: z.enum(Priorities).optional(),
  categoryKey: z.string().max(40).optional(),
  assignedTo: z.union([objectIdSchema, z.literal('me'), z.literal('unassigned')]).optional(),
  unitId: objectIdSchema.optional(),
  openOnly: booleanQuerySchema,
  breachedOnly: booleanQuerySchema,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const assignSchema = z.object({ assignedTo: objectIdSchema.nullable().optional(), assignedStaffId: objectIdSchema.nullable().optional(), assignedVendorId: objectIdSchema.nullable().optional(), note: z.string().trim().max(500).optional() });
export const statusSchema = z.object({ status: z.enum(['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED', 'OPEN']), note: z.string().trim().max(2000).optional() });
export const commentSchema = z.object({ body: z.string().trim().min(1).max(4000), internal: z.boolean().default(false), attachments: z.array(attachment).max(5).default([]) });
export const rateSchema = z.object({ score: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() });

export const slaSettingsSchema = z.record(z.enum(Priorities), z.object({ responseMinutes: z.coerce.number().int().min(1).max(60 * 24 * 60), resolutionMinutes: z.coerce.number().int().min(1).max(60 * 24 * 90) }));
export const escalationSettingsSchema = z.object({
  levels: z.array(z.object({ level: z.coerce.number().int().min(1).max(5), afterMinutesPastDue: z.coerce.number().int().min(0), notifyRoleKeys: z.array(z.string().trim().max(60)).max(10).default([]), notifyUserIds: z.array(objectIdSchema).max(20).default([]) })).max(5),
});
export const complaintsConfigSchema = z.object({ autoCloseAfterResolvedDays: z.coerce.number().int().min(0).max(90), allowReopenDays: z.coerce.number().int().min(0).max(90), memberCanRate: z.boolean(), defaultPriority: z.enum(Priorities) }).partial();
