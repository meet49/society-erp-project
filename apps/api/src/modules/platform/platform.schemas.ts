import { z } from 'zod';
import { ModuleStatus, SocietyTypes, SubscriptionStatus, emailSchema, objectIdSchema, paginationQuerySchema, passwordSchema, phoneSchema, slugSchema } from '@society-erp/shared';

export const societyListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  subscriptionStatus: z.enum(Object.values(SubscriptionStatus) as [string, ...string[]]).optional(),
  planId: objectIdSchema.optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
});

export const createSocietySchema = z.object({
  society: z.object({
    name: z.string().trim().min(3).max(160),
    slug: slugSchema.optional(),
    type: z.enum(SocietyTypes).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    pincode: z.string().trim().max(12).optional(),
    addressLine1: z.string().trim().max(200).optional(),
    totalUnits: z.coerce.number().int().min(0).optional(),
    contactEmail: emailSchema.optional(),
    contactPhone: phoneSchema.optional(),
    timezone: z.string().max(60).optional(),
    currency: z.string().length(3).optional(),
    registrationNumber: z.string().trim().max(80).optional(),
  }),
  admin: z.object({ name: z.string().trim().min(2).max(80), email: emailSchema, phone: phoneSchema.optional(), password: passwordSchema.optional() }),
  planId: objectIdSchema,
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  startTrial: z.boolean().optional(),
  trialDaysOverride: z.coerce.number().int().min(0).max(365).optional(),
});

export const societyStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']), reason: z.string().trim().max(500).optional() });

export const subscriptionListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(Object.values(SubscriptionStatus) as [string, ...string[]]).optional(),
  planId: objectIdSchema.optional(),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional(),
});
export const extendSubscriptionSchema = z.object({ days: z.coerce.number().int().min(1).max(3650), note: z.string().trim().max(500).optional() });
export const changePlanSchema = z.object({ planId: objectIdSchema, billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional(), note: z.string().trim().max(500).optional() });
export const reasonSchema = z.object({ reason: z.string().trim().max(500).optional() });
export const reactivateSchema = z.object({ days: z.coerce.number().int().min(1).max(3650).optional(), note: z.string().trim().max(500).optional() });
export const activateSchema = z.object({ note: z.string().trim().max(500).optional(), amount: z.coerce.number().min(0).optional(), reference: z.string().trim().max(120).optional(), method: z.string().trim().max(40).optional() });

const planFeature = z.object({ key: z.string().trim().min(1).max(60), label: z.string().trim().min(1).max(160), description: z.string().trim().max(300).optional(), included: z.boolean().default(true) });
export const planCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  description: z.string().trim().max(400).optional(),
  monthlyPrice: z.coerce.number().min(0),
  annualPrice: z.coerce.number().min(0),
  currency: z.string().length(3).toUpperCase().default('INR'),
  trialDays: z.coerce.number().int().min(0).max(365).default(14),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  displayOrder: z.coerce.number().int().default(0),
  features: z.array(planFeature).max(50).default([]),
  modules: z.array(z.string().regex(/^[a-z_]+$/)).max(100).default([]),
  limits: z.record(z.union([z.coerce.number().int().min(0), z.null()])).default({}),
  highlighted: z.boolean().default(false),
  publicVisibility: z.boolean().default(true),
  badge: z.string().trim().max(40).optional(),
  ctaLabel: z.string().trim().max(60).optional(),
  isDefault: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});
export const planUpdateSchema = planCreateSchema.partial();

export const moduleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(400).optional(),
  icon: z.string().trim().max(60).optional(),
  status: z.enum(Object.values(ModuleStatus) as [string, ...string[]]).optional(),
  sortOrder: z.coerce.number().int().optional(),
  configuration: z.record(z.unknown()).optional(),
  navigation: z.array(z.object({ key: z.string(), label: z.string().trim().min(1).max(60).optional(), hidden: z.boolean().optional(), sortOrder: z.coerce.number().int().optional(), icon: z.string().max(60).optional() })).optional(),
});

export const featureFlagUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(400).optional(),
  enabled: z.boolean().optional(),
  enabledForSocietyIds: z.array(objectIdSchema).max(5000).optional(),
  enabledForPlanIds: z.array(objectIdSchema).max(100).optional(),
  disabledForSocietyIds: z.array(objectIdSchema).max(5000).optional(),
});
export const featureFlagCreateSchema = z.object({ key: z.string().regex(/^[a-z0-9_]+$/).max(60), name: z.string().trim().min(2).max(80), description: z.string().trim().max(400).optional(), enabled: z.boolean().default(false) });

export const settingsUpdateSchema = z.object({ settings: z.array(z.object({ key: z.string().regex(/^[a-zA-Z]+\.[a-zA-Z]+$/), value: z.unknown() })).min(1).max(100) });

export const platformUserCreateSchema = z.object({ name: z.string().trim().min(2).max(80), email: emailSchema, password: passwordSchema.optional(), roleKeys: z.array(z.string().regex(/^[A-Z_]+$/)).min(1).max(5) });
export const platformUserRolesSchema = z.object({ roleKeys: z.array(z.string().regex(/^[A-Z_]+$/)).max(5) });

export const platformAuditQuerySchema = paginationQuerySchema.extend({
  societyId: objectIdSchema.optional(),
  action: z.string().max(80).optional(),
  resource: z.string().max(80).optional(),
  actorId: objectIdSchema.optional(),
  actorType: z.enum(['USER', 'PLATFORM_ADMIN', 'SYSTEM', 'ANONYMOUS']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const societyUsersQuerySchema = paginationQuerySchema.extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() });
export const moduleToggleSchema = z.object({ enabled: z.boolean() });
export const keyParamSchema = z.object({ key: z.string().regex(/^[a-z0-9_]+$/) });
