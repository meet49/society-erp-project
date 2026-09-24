import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireSociety, requireSubscription, validate } from '../../middleware';
import { societyController as c } from './society.controller';
import {
  updateSocietySchema,
  onboardingSchema,
  settingKeyParamSchema,
  settingValueSchema,
  moduleKeyParamSchema,
  moduleToggleSchema,
  moduleSettingsSchema,
  roleCreateSchema,
  roleUpdateSchema,
  roleDeleteSchema,
  roleCloneSchema,
  userListQuerySchema,
  userCreateSchema,
  inviteSchema,
  userUpdateSchema,
  userStatusSchema,
  userRolesSchema,
  directPermissionsSchema,
  userIdParamSchema,
  categoryTypeParamSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryReorderSchema,
  auditQuerySchema,
  changePlanSchema,
  cancelSubscriptionSchema,
} from './society.schemas';

export const societyRouter = Router();
societyRouter.use(authenticate, requireSociety);

// ---- subscription management stays reachable even when the subscription is blocked (needed to recover)
societyRouter.get('/subscription', authorizePermission('society:view_subscription', 'society:manage_subscription'), asyncHandler(c.getSubscription));
societyRouter.post('/subscription/change-plan', authorizePermission('society:manage_subscription'), validate(changePlanSchema), asyncHandler(c.changePlan));
societyRouter.post('/subscription/cancel', authorizePermission('society:manage_subscription'), validate(cancelSubscriptionSchema), asyncHandler(c.cancelSubscription));
societyRouter.get('/limits', authorizePermission('society:view', 'society:view_subscription'), asyncHandler(c.limits));
societyRouter.get('/profile', authorizePermission('society:view', 'dashboard:view'), asyncHandler(c.getProfile));

// ---- everything below requires a usable subscription
societyRouter.use(requireSubscription());

societyRouter.patch('/profile', authorizePermission('society:update'), validate(updateSocietySchema), asyncHandler(c.updateProfile));
societyRouter.patch('/onboarding', authorizePermission('society:update', 'society:manage_settings'), validate(onboardingSchema), asyncHandler(c.updateOnboarding));

societyRouter.get('/settings', authorizePermission('society:manage_settings', 'society:view'), asyncHandler(c.listSettings));
societyRouter.get('/settings/:key', authorizePermission('society:manage_settings', 'society:view'), validate(settingKeyParamSchema, 'params'), asyncHandler(c.getSetting));
societyRouter.put('/settings/:key', authorizePermission('society:manage_settings'), validate(settingKeyParamSchema, 'params'), validate(settingValueSchema), asyncHandler(c.putSetting));

societyRouter.get('/modules', authorizePermission('society:manage_modules', 'society:view'), asyncHandler(c.listModules));
societyRouter.patch('/modules/:key', authorizePermission('society:manage_modules'), validate(moduleKeyParamSchema, 'params'), validate(moduleToggleSchema), asyncHandler(c.toggleModule));
societyRouter.put('/modules/:key/settings', authorizePermission('society:manage_modules', 'society:manage_settings'), validate(moduleKeyParamSchema, 'params'), validate(moduleSettingsSchema), asyncHandler(c.updateModuleSettings));

societyRouter.get('/roles', authorizePermission('society:manage_roles', 'society:manage_users'), asyncHandler(c.listRoles));
societyRouter.get('/roles/permission-catalog', authorizePermission('society:manage_roles'), asyncHandler(c.permissionCatalog));
societyRouter.get('/roles/:id', authorizePermission('society:manage_roles', 'society:manage_users'), validate(idParamSchema, 'params'), asyncHandler(c.getRole));
societyRouter.post('/roles', authorizePermission('society:manage_roles'), validate(roleCreateSchema), asyncHandler(c.createRole));
societyRouter.patch('/roles/:id', authorizePermission('society:manage_roles'), validate(idParamSchema, 'params'), validate(roleUpdateSchema), asyncHandler(c.updateRole));
societyRouter.delete('/roles/:id', authorizePermission('society:manage_roles'), validate(idParamSchema, 'params'), validate(roleDeleteSchema), asyncHandler(c.deleteRole));
societyRouter.post('/roles/:id/clone', authorizePermission('society:manage_roles'), validate(idParamSchema, 'params'), validate(roleCloneSchema), asyncHandler(c.cloneRole));

societyRouter.get('/users', authorizePermission('society:manage_users'), validate(userListQuerySchema, 'query'), asyncHandler(c.listUsers));
societyRouter.post('/users', authorizePermission('society:manage_users'), validate(userCreateSchema), asyncHandler(c.createUser));
societyRouter.post('/users/invite', authorizePermission('society:manage_users'), validate(inviteSchema), asyncHandler(c.inviteUser));
societyRouter.get('/users/invitations', authorizePermission('society:manage_users'), validate(z.object({ status: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']).optional() }), 'query'), asyncHandler(c.listInvitations));
societyRouter.post('/users/invitations/:id/resend', authorizePermission('society:manage_users'), validate(idParamSchema, 'params'), asyncHandler(c.resendInvitation));
societyRouter.delete('/users/invitations/:id', authorizePermission('society:manage_users'), validate(idParamSchema, 'params'), asyncHandler(c.revokeInvitation));
societyRouter.get('/users/:userId', authorizePermission('society:manage_users'), validate(userIdParamSchema, 'params'), asyncHandler(c.getUser));
societyRouter.patch('/users/:userId', authorizePermission('society:manage_users'), validate(userIdParamSchema, 'params'), validate(userUpdateSchema), asyncHandler(c.updateUser));
societyRouter.patch('/users/:userId/status', authorizePermission('society:manage_users'), validate(userIdParamSchema, 'params'), validate(userStatusSchema), asyncHandler(c.setUserStatus));
societyRouter.put('/users/:userId/roles', authorizePermission('society:manage_users'), validate(userIdParamSchema, 'params'), validate(userRolesSchema), asyncHandler(c.assignRoles));
societyRouter.put('/users/:userId/permissions', authorizePermission('society:manage_roles'), validate(userIdParamSchema, 'params'), validate(directPermissionsSchema), asyncHandler(c.setDirectPermissions));
societyRouter.get('/users/:userId/effective-access', authorizePermission('society:manage_users'), validate(userIdParamSchema, 'params'), asyncHandler(c.effectiveAccess));
societyRouter.post('/users/:userId/revoke-sessions', authorizePermission('society:manage_users'), validate(userIdParamSchema, 'params'), asyncHandler(c.revokeUserSessions));
societyRouter.post('/users/:userId/reset-password', authorizePermission('society:manage_users'), validate(userIdParamSchema, 'params'), asyncHandler(c.resetUserPassword));

// category reads are reference data every society member needs (gate, complaints, bookings); writes stay admin-only
societyRouter.get('/categories', asyncHandler(c.listCategories));
societyRouter.get('/categories/:type', validate(categoryTypeParamSchema, 'params'), asyncHandler(c.listCategories));
societyRouter.post('/categories/:type', authorizePermission('society:manage_categories'), validate(categoryTypeParamSchema, 'params'), validate(categoryCreateSchema), asyncHandler(c.createCategory));
societyRouter.put('/categories/:type/reorder', authorizePermission('society:manage_categories'), validate(categoryTypeParamSchema, 'params'), validate(categoryReorderSchema), asyncHandler(c.reorderCategories));
societyRouter.patch('/categories/:type/:id', authorizePermission('society:manage_categories'), validate(categoryTypeParamSchema.extend({ id: idParamSchema.shape.id }), 'params'), validate(categoryUpdateSchema), asyncHandler(c.updateCategory));
societyRouter.delete('/categories/:type/:id', authorizePermission('society:manage_categories'), validate(categoryTypeParamSchema.extend({ id: idParamSchema.shape.id }), 'params'), asyncHandler(c.deleteCategory));

societyRouter.get('/audit', authorizePermission('society:view_audit'), validate(auditQuerySchema, 'query'), asyncHandler(c.listAudit));
