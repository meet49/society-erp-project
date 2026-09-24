import type { Request, Response } from 'express';
import type { CategoryType } from '@society-erp/shared';
import { ok, created, noContent, paged } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { ErrorCodes } from '@society-erp/shared';
import { societyService } from '../../core/tenancy/society.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { moduleEngine } from '../../core/modules/module-engine.service';
import { subscriptionEngine } from '../../core/subscription/subscription-engine.service';
import { limitService } from '../../core/limits/limit.service';
import { categoryService } from '../../core/categories/category.service';
import { auditService } from '../../core/audit/audit.service';
import { accessControlService } from '../../core/access-control/access-control.service';
import { Plan } from '../../models/plan.model';
import { societyRoleService } from './roles.service';
import { societyUserService } from './users.service';

const sid = (req: Request) => req.tenant!.societyId;
const uid = (req: Request) => req.auth!.userId;

export const societyController = {
  // ---------------- profile & onboarding
  async getProfile(req: Request, res: Response) {
    const society = await societyService.getById(sid(req));
    const stats = await societyService.computeStats(sid(req));
    ok(res, { ...society.toJSON(), stats });
  },
  async updateProfile(req: Request, res: Response) {
    const society = await societyService.updateProfile(sid(req), req.body, uid(req), req);
    ok(res, society.toJSON());
  },
  async updateOnboarding(req: Request, res: Response) {
    const society = await societyService.updateOnboarding(sid(req), req.body);
    ok(res, society.toJSON().onboarding);
  },

  // ---------------- settings
  async listSettings(req: Request, res: Response) {
    ok(res, await configurationService.getAllSocietySettings(sid(req)));
  },
  async getSetting(req: Request, res: Response) {
    ok(res, await configurationService.getSocietySetting(sid(req), req.params.key));
  },
  async putSetting(req: Request, res: Response) {
    const before = await configurationService.getSocietySetting(sid(req), req.params.key);
    const value = await configurationService.setSocietySetting(sid(req), req.params.key, req.body.value, uid(req));
    auditService.record({ action: 'society.setting_updated', resource: 'SocietySetting', resourceId: req.params.key, societyId: sid(req), oldValue: before, newValue: value, req });
    ok(res, value);
  },

  // ---------------- modules
  async listModules(req: Request, res: Response) {
    const states = await moduleEngine.getSocietyModuleStates(sid(req));
    const sub = req.tenant!.subscription;
    const plan = sub.planId ? await Plan.findById(sub.planId).select('name slug modules').lean() : null;
    ok(res, states, { plan: plan ? { id: String(plan._id), name: plan.name, slug: plan.slug } : null, subscriptionStatus: sub.status });
  },
  async toggleModule(req: Request, res: Response) {
    const state = await moduleEngine.setSocietyModule(sid(req), req.params.key, req.body.enabled, uid(req));
    auditService.record({ action: req.body.enabled ? 'module.enabled' : 'module.disabled', resource: 'SocietyModule', resourceId: req.params.key, societyId: sid(req), newValue: { module: req.params.key, enabled: req.body.enabled }, req });
    ok(res, state);
  },
  async updateModuleSettings(req: Request, res: Response) {
    const settings = await moduleEngine.updateSocietyModuleSettings(sid(req), req.params.key, req.body.settings, uid(req));
    auditService.record({ action: 'module.settings_updated', resource: 'SocietyModule', resourceId: req.params.key, societyId: sid(req), newValue: req.body.settings, req });
    ok(res, settings);
  },

  // ---------------- roles
  async listRoles(req: Request, res: Response) {
    ok(res, await societyRoleService.list(sid(req)));
  },
  async permissionCatalog(req: Request, res: Response) {
    ok(res, await societyRoleService.permissionCatalog(sid(req)));
  },
  async getRole(req: Request, res: Response) {
    ok(res, (await societyRoleService.get(sid(req), req.params.id)).toJSON());
  },
  async createRole(req: Request, res: Response) {
    created(res, await societyRoleService.create(sid(req), req.body, uid(req), req));
  },
  async updateRole(req: Request, res: Response) {
    ok(res, await societyRoleService.update(sid(req), req.params.id, req.body, uid(req), req));
  },
  async deleteRole(req: Request, res: Response) {
    await societyRoleService.remove(sid(req), req.params.id, req.body ?? {}, req);
    noContent(res);
  },
  async cloneRole(req: Request, res: Response) {
    created(res, await societyRoleService.clone(sid(req), req.params.id, req.body.name, uid(req), req));
  },

  // ---------------- users
  async listUsers(req: Request, res: Response) {
    paged(res, await societyUserService.list(sid(req), req.query as any));
  },
  async getUser(req: Request, res: Response) {
    ok(res, await societyUserService.get(sid(req), req.params.userId));
  },
  async createUser(req: Request, res: Response) {
    created(res, await societyUserService.create(sid(req), req.body, uid(req), req));
  },
  async inviteUser(req: Request, res: Response) {
    created(res, await societyUserService.invite(sid(req), req.body, uid(req), req));
  },
  async listInvitations(req: Request, res: Response) {
    ok(res, await societyUserService.listInvitations(sid(req), req.query.status as string | undefined));
  },
  async resendInvitation(req: Request, res: Response) {
    ok(res, await societyUserService.resendInvitation(sid(req), req.params.id, uid(req), req));
  },
  async revokeInvitation(req: Request, res: Response) {
    await societyUserService.revokeInvitation(sid(req), req.params.id, req);
    noContent(res);
  },
  async updateUser(req: Request, res: Response) {
    ok(res, await societyUserService.update(sid(req), req.params.userId, req.body, req));
  },
  async setUserStatus(req: Request, res: Response) {
    ok(res, await societyUserService.setStatus(sid(req), req.params.userId, req.body.status, uid(req), req));
  },
  async assignRoles(req: Request, res: Response) {
    ok(res, await societyUserService.assignRoles(sid(req), req.params.userId, req.body.roleIds, uid(req), req));
  },
  async setDirectPermissions(req: Request, res: Response) {
    ok(res, await societyUserService.setDirectPermissions(sid(req), req.params.userId, req.body, req));
  },
  async revokeUserSessions(req: Request, res: Response) {
    await societyUserService.revokeSessions(sid(req), req.params.userId, req);
    noContent(res);
  },
  async resetUserPassword(req: Request, res: Response) {
    ok(res, await societyUserService.resetPassword(sid(req), req.params.userId, uid(req), req));
  },
  async effectiveAccess(req: Request, res: Response) {
    await accessControlService.invalidateUser(req.params.userId);
    const tenant = await accessControlService.resolveTenantContext(req.params.userId, sid(req));
    if (!tenant) throw Errors.notFound('User');
    ok(res, { permissions: accessControlService.getEffectivePermissions(tenant), modules: [...tenant.accessibleModules], roleKeys: tenant.roleKeys, unitIds: tenant.unitIds });
  },

  // ---------------- categories
  async listCategories(req: Request, res: Response) {
    const type = req.params.type as CategoryType | undefined;
    ok(res, await categoryService.list(sid(req), type, { includeInactive: req.query.includeInactive === 'true' }));
  },
  async createCategory(req: Request, res: Response) {
    created(res, await categoryService.create(sid(req), req.params.type as CategoryType, req.body, uid(req), req));
  },
  async updateCategory(req: Request, res: Response) {
    ok(res, await categoryService.update(sid(req), req.params.id, req.body, req));
  },
  async deleteCategory(req: Request, res: Response) {
    await categoryService.remove(sid(req), req.params.id, req);
    noContent(res);
  },
  async reorderCategories(req: Request, res: Response) {
    await categoryService.reorder(sid(req), req.params.type as CategoryType, req.body.orderedIds);
    noContent(res);
  },

  // ---------------- audit
  async listAudit(req: Request, res: Response) {
    const q = req.query as any;
    const filter: Record<string, unknown> = { societyId: sid(req) };
    if (q.action) filter.action = new RegExp(`^${String(q.action).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    if (q.resource) filter.resource = q.resource;
    if (q.actorId) filter.actorId = q.actorId;
    if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
    paged(res, await auditService.list(filter, { page: q.page, limit: q.limit, sort: q.sort }));
  },

  // ---------------- subscription (society side)
  async getSubscription(req: Request, res: Response) {
    const sub = await subscriptionEngine.getBySociety(sid(req));
    const [plan, plans, limits, access] = await Promise.all([
      Plan.findById(sub.planId).lean(),
      Plan.find({ status: 'ACTIVE', publicVisibility: true }).sort({ displayOrder: 1 }).lean(),
      limitService.getLimitsWithUsage(sid(req)),
      subscriptionEngine.getAccess(sid(req)),
    ]);
    const selfService = await configurationService.getPlatformSetting<boolean>('subscription.allowSelfServicePlanChange', true);
    const selfCancel = await configurationService.getPlatformSetting<boolean>('subscription.allowSelfServiceCancel', true);
    ok(res, { subscription: sub.toJSON(), plan, availablePlans: plans, limits, access, selfService: { changePlan: selfService, cancel: selfCancel } });
  },
  async changePlan(req: Request, res: Response) {
    const allowed = await configurationService.getPlatformSetting<boolean>('subscription.allowSelfServicePlanChange', true);
    if (!allowed) throw Errors.forbidden('Plan changes are handled by the platform team. Please contact support.');
    const sub = await subscriptionEngine.getBySociety(sid(req));
    const updated = await subscriptionEngine.changePlan(sub, { byUserId: uid(req), planId: req.body.planId, billingCycle: req.body.billingCycle, actorType: 'USER' });
    ok(res, updated.toJSON());
  },
  async cancelSubscription(req: Request, res: Response) {
    const allowed = await configurationService.getPlatformSetting<boolean>('subscription.allowSelfServiceCancel', true);
    if (!allowed) throw Errors.forbidden('Cancellations are handled by the platform team. Please contact support.');
    const sub = await subscriptionEngine.getBySociety(sid(req));
    if (sub.status === 'CANCELLED') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, 'Subscription is already cancelled');
    const updated = await subscriptionEngine.cancel(sub, { byUserId: uid(req), reason: req.body.reason, actorType: 'USER' });
    ok(res, updated.toJSON());
  },
  async limits(req: Request, res: Response) {
    ok(res, await limitService.getLimitsWithUsage(sid(req)));
  },
};
