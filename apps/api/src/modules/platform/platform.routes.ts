import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema, paginationQuerySchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePlatformPermission as perm, requirePlatform, validate } from '../../middleware';
import { platformController as c } from './platform.controller';
import { updateSocietySchema } from '../society/society.schemas';
import {
  societyListQuerySchema,
  createSocietySchema,
  societyStatusSchema,
  subscriptionListQuerySchema,
  extendSubscriptionSchema,
  changePlanSchema,
  reasonSchema,
  reactivateSchema,
  activateSchema,
  planCreateSchema,
  planUpdateSchema,
  moduleUpdateSchema,
  featureFlagCreateSchema,
  featureFlagUpdateSchema,
  settingsUpdateSchema,
  platformUserCreateSchema,
  platformUserRolesSchema,
  platformAuditQuerySchema,
  societyUsersQuerySchema,
  moduleToggleSchema,
  keyParamSchema,
} from './platform.schemas';

export const platformRouter = Router();
platformRouter.use(authenticate, requirePlatform);

// dashboard / analytics / health
platformRouter.get('/dashboard', perm('platform_dashboard:view'), asyncHandler(c.dashboard));
platformRouter.get('/analytics', perm('platform_analytics:view'), asyncHandler(c.analytics));
platformRouter.get('/health', perm('platform_settings:view_health'), asyncHandler(c.health));

// societies
platformRouter.get('/societies', perm('platform_societies:view'), validate(societyListQuerySchema, 'query'), asyncHandler(c.listSocieties));
platformRouter.post('/societies', perm('platform_societies:create'), validate(createSocietySchema), asyncHandler(c.createSociety));
platformRouter.get('/societies/:id', perm('platform_societies:view'), validate(idParamSchema, 'params'), asyncHandler(c.getSociety));
platformRouter.patch('/societies/:id', perm('platform_societies:update'), validate(idParamSchema, 'params'), validate(updateSocietySchema), asyncHandler(c.updateSociety));
platformRouter.patch('/societies/:id/status', perm('platform_societies:suspend'), validate(idParamSchema, 'params'), validate(societyStatusSchema), asyncHandler(c.setSocietyStatus));
platformRouter.get('/societies/:id/modules', perm('platform_societies:view'), validate(idParamSchema, 'params'), asyncHandler(c.societyModules));
platformRouter.patch('/societies/:id/modules/:key', perm('platform_societies:manage_modules'), validate(idParamSchema.extend({ key: keyParamSchema.shape.key }), 'params'), validate(moduleToggleSchema), asyncHandler(c.toggleSocietyModule));
platformRouter.get('/societies/:id/users', perm('platform_societies:view_users'), validate(idParamSchema, 'params'), validate(societyUsersQuerySchema, 'query'), asyncHandler(c.societyUsers));
platformRouter.get('/societies/:id/usage', perm('platform_societies:view_usage'), validate(idParamSchema, 'params'), asyncHandler(c.societyUsage));
platformRouter.get('/societies/:id/activity', perm('platform_audit:view', 'platform_societies:view'), validate(idParamSchema, 'params'), validate(paginationQuerySchema, 'query'), asyncHandler(c.societyActivity));
platformRouter.post('/societies/:id/reset-admin-password', perm('platform_societies:manage_admins'), validate(idParamSchema, 'params'), asyncHandler(c.resetSocietyAdminPassword));

// subscriptions
platformRouter.get('/subscriptions', perm('platform_subscriptions:view'), validate(subscriptionListQuerySchema, 'query'), asyncHandler(c.listSubscriptions));
platformRouter.get('/subscriptions/expiry-radar', perm('platform_subscriptions:view'), asyncHandler(c.expiryRadar));
platformRouter.post('/subscriptions/run-lifecycle', perm('platform_subscriptions:update'), asyncHandler(c.runLifecycle));
platformRouter.get('/subscriptions/:id', perm('platform_subscriptions:view'), validate(idParamSchema, 'params'), asyncHandler(c.getSubscription));
platformRouter.post('/subscriptions/:id/extend', perm('platform_subscriptions:extend'), validate(idParamSchema, 'params'), validate(extendSubscriptionSchema), asyncHandler(c.extendSubscription));
platformRouter.post('/subscriptions/:id/change-plan', perm('platform_subscriptions:change_plan'), validate(idParamSchema, 'params'), validate(changePlanSchema), asyncHandler(c.changeSubscriptionPlan));
platformRouter.post('/subscriptions/:id/activate', perm('platform_subscriptions:update'), validate(idParamSchema, 'params'), validate(activateSchema), asyncHandler(c.activateSubscription));
platformRouter.post('/subscriptions/:id/suspend', perm('platform_subscriptions:cancel'), validate(idParamSchema, 'params'), validate(reasonSchema), asyncHandler(c.suspendSubscription));
platformRouter.post('/subscriptions/:id/cancel', perm('platform_subscriptions:cancel'), validate(idParamSchema, 'params'), validate(reasonSchema), asyncHandler(c.cancelSubscription));
platformRouter.post('/subscriptions/:id/reactivate', perm('platform_subscriptions:update'), validate(idParamSchema, 'params'), validate(reactivateSchema), asyncHandler(c.reactivateSubscription));
platformRouter.post('/subscriptions/:id/remind', perm('platform_subscriptions:remind'), validate(idParamSchema, 'params'), asyncHandler(c.remindSubscription));

// platform payments
platformRouter.get('/payments', perm('platform_payments:view'), validate(paginationQuerySchema.extend({ status: z.string().max(20).optional(), provider: z.string().max(20).optional(), societyId: idParamSchema.shape.id.optional() }), 'query'), asyncHandler(c.listPayments));

// plans
platformRouter.get('/plans', perm('platform_plans:view'), validate(z.object({ includeArchived: z.string().optional() }), 'query'), asyncHandler(c.listPlans));
platformRouter.post('/plans', perm('platform_plans:create'), validate(planCreateSchema), asyncHandler(c.createPlan));
platformRouter.get('/plans/:id', perm('platform_plans:view'), validate(idParamSchema, 'params'), asyncHandler(c.getPlan));
platformRouter.patch('/plans/:id', perm('platform_plans:update'), validate(idParamSchema, 'params'), validate(planUpdateSchema), asyncHandler(c.updatePlan));
platformRouter.post('/plans/:id/archive', perm('platform_plans:archive'), validate(idParamSchema, 'params'), asyncHandler(c.archivePlan));

// modules & feature flags
platformRouter.get('/modules', perm('platform_modules:view'), asyncHandler(c.listModules));
platformRouter.patch('/modules/:key', perm('platform_modules:update'), validate(keyParamSchema, 'params'), validate(moduleUpdateSchema), asyncHandler(c.updateModule));
platformRouter.get('/feature-flags', perm('platform_feature_flags:view'), asyncHandler(c.listFeatureFlags));
platformRouter.post('/feature-flags', perm('platform_feature_flags:update'), validate(featureFlagCreateSchema), asyncHandler(c.createFeatureFlag));
platformRouter.patch('/feature-flags/:key', perm('platform_feature_flags:update'), validate(keyParamSchema, 'params'), validate(featureFlagUpdateSchema), asyncHandler(c.updateFeatureFlag));

// settings & platform users
platformRouter.get('/settings', perm('platform_settings:view', 'platform_landing:view'), validate(z.object({ group: z.string().max(40).optional() }), 'query'), asyncHandler(c.listSettings));
platformRouter.put('/settings', perm('platform_settings:update', 'platform_landing:update'), validate(settingsUpdateSchema), asyncHandler(c.updateSettings));
platformRouter.get('/users', perm('platform_settings:manage_users'), asyncHandler(c.listPlatformUsers));
platformRouter.post('/users', perm('platform_settings:manage_users'), validate(platformUserCreateSchema), asyncHandler(c.createPlatformUser));
platformRouter.put('/users/:userId/roles', perm('platform_settings:manage_users'), validate(z.object({ userId: idParamSchema.shape.id }), 'params'), validate(platformUserRolesSchema), asyncHandler(c.setPlatformUserRoles));

// audit
platformRouter.get('/audit', perm('platform_audit:view'), validate(platformAuditQuerySchema, 'query'), asyncHandler(c.listAudit));
