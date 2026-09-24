import { z } from 'zod';
import { CategoryTypes, SocietyTypes, emailSchema, objectIdSchema, paginationQuerySchema, passwordSchema, phoneSchema, slugSchema } from '@society-erp/shared';

export const updateSocietySchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  slug: slugSchema.optional(),
  type: z.enum(SocietyTypes).optional(),
  registrationNumber: z.string().trim().max(80).optional().or(z.literal('')),
  address: z
    .object({
      line1: z.string().trim().max(200).optional(),
      line2: z.string().trim().max(200).optional(),
      city: z.string().trim().max(80).optional(),
      state: z.string().trim().max(80).optional(),
      pincode: z.string().trim().max(12).optional(),
      country: z.string().trim().max(80).optional(),
    })
    .optional(),
  contact: z.object({ email: emailSchema.optional().or(z.literal('')), phone: phoneSchema.optional().or(z.literal('')), website: z.string().trim().max(200).optional().or(z.literal('')) }).optional(),
  timezone: z.string().trim().max(60).optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  locale: z.string().trim().max(10).optional(),
  logoUrl: z.string().url().max(500).optional().or(z.literal('')),
  expectedUnits: z.coerce.number().int().min(0).max(100000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const onboardingSchema = z.object({
  step: z.coerce.number().int().min(1).max(20).optional(),
  completed: z.boolean().optional(),
  skippedStep: z.coerce.number().int().min(1).max(20).optional(),
});

export const settingKeyParamSchema = z.object({ key: z.string().regex(/^[a-z]+\.[a-zA-Z]+$/, 'Invalid setting key') });
export const settingValueSchema = z.object({ value: z.record(z.unknown()) });

export const moduleKeyParamSchema = z.object({ key: z.string().regex(/^[a-z_]+$/) });
export const moduleToggleSchema = z.object({ enabled: z.boolean() });
export const moduleSettingsSchema = z.object({ settings: z.record(z.unknown()) });

export const roleCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  key: z.string().trim().max(40).optional(),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string().regex(/^[a-z_]+:[a-z_*]+$/)).max(500).default([]),
  landing: z.enum(['ADMIN', 'MEMBER', 'GUARD']).optional(),
  color: z.string().trim().max(20).optional(),
});
export const roleUpdateSchema = roleCreateSchema.partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() });
export const roleDeleteSchema = z.object({ reassignToRoleId: objectIdSchema.optional() });
export const roleCloneSchema = z.object({ name: z.string().trim().min(2).max(80) });

export const userListQuerySchema = paginationQuerySchema.extend({ roleId: objectIdSchema.optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() });
export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  phone: phoneSchema.optional().or(z.literal('')),
  password: passwordSchema.optional(),
  roleIds: z.array(objectIdSchema).min(1).max(10),
  residentId: objectIdSchema.optional(),
  label: z.string().trim().max(60).optional(),
});
export const inviteSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(80).optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  roleIds: z.array(objectIdSchema).min(1).max(10),
  residentId: objectIdSchema.optional(),
  unitId: objectIdSchema.optional(),
  message: z.string().trim().max(500).optional(),
});
export const userUpdateSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), phone: phoneSchema.optional().or(z.literal('')), label: z.string().trim().max(60).optional() });
export const userStatusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });
export const userRolesSchema = z.object({ roleIds: z.array(objectIdSchema).max(10) });
export const directPermissionsSchema = z.object({ allow: z.array(z.string()).max(200).default([]), deny: z.array(z.string()).max(200).default([]) });
export const userIdParamSchema = z.object({ userId: objectIdSchema });

export const categoryTypeParamSchema = z.object({ type: z.enum(CategoryTypes) });
export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  key: z.string().trim().max(40).optional(),
  description: z.string().trim().max(300).optional(),
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(40).optional(),
  metadata: z.record(z.unknown()).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});
export const categoryUpdateSchema = categoryCreateSchema.partial().extend({ isActive: z.boolean().optional() });
export const categoryReorderSchema = z.object({ orderedIds: z.array(objectIdSchema).min(1).max(200) });

export const auditQuerySchema = paginationQuerySchema.extend({
  action: z.string().max(80).optional(),
  resource: z.string().max(80).optional(),
  actorId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const changePlanSchema = z.object({ planId: objectIdSchema, billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional() });
export const cancelSubscriptionSchema = z.object({ reason: z.string().trim().max(500).optional() });
