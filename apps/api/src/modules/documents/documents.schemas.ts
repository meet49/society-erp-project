import { z } from 'zod';
import { booleanQuerySchema, objectIdSchema, paginationQuerySchema } from '@society-erp/shared';
import { DocumentStatuses, DocumentVisibilities } from '../../models/document.model';

const file = z.object({ storageKey: z.string().trim().min(3).max(300), name: z.string().trim().min(1).max(200), mimeType: z.string().trim().max(100).optional(), size: z.coerce.number().int().min(0).optional() });

export const folderSchema = z.object({ name: z.string().trim().min(1).max(120), parentId: objectIdSchema.nullable().optional(), visibility: z.enum(DocumentVisibilities).default('COMMITTEE'), sortOrder: z.coerce.number().int().min(0).max(1000).optional() });
export const folderUpdateSchema = folderSchema.partial();

export const documentCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  categoryKey: z.string().trim().min(1).max(40).default('OTHER'),
  folderId: objectIdSchema.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(15).default([]),
  visibility: z.enum(DocumentVisibilities).default('COMMITTEE'),
  unitIds: z.array(objectIdSchema).max(500).default([]),
  file,
  expiresAt: z.coerce.date().nullable().optional(),
  isPinned: z.boolean().default(false),
});
export const documentUpdateSchema = documentCreateSchema.omit({ file: true }).partial();
export const newVersionSchema = z.object({ file, note: z.string().trim().max(300).optional() });
export const documentListQuerySchema = paginationQuerySchema.extend({
  folderId: z.union([objectIdSchema, z.literal('root')]).optional(),
  categoryKey: z.string().max(40).optional(),
  status: z.enum(DocumentStatuses).optional(),
  visibility: z.enum(DocumentVisibilities).optional(),
  tag: z.string().max(30).optional(),
  expiringOnly: booleanQuerySchema,
  pinnedOnly: booleanQuerySchema,
});
export const reviewSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(500).optional() });
export const documentsConfigSchema = z.object({ memberVisibleCategories: z.array(z.string().trim().max(40)).max(30), signedUrlMinutes: z.coerce.number().int().min(1).max(24 * 60), expiryReminderDays: z.coerce.number().int().min(0).max(365), requireApprovalForStaffUploads: z.boolean() }).partial();
