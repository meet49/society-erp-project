import { ErrorCodes } from '@society-erp/shared';
import { Plan, type PlanDoc } from '../../models/plan.model';
import { Subscription } from '../../models/subscription.model';
import { Errors } from '../../lib/errors';
import { configurationService } from '../../core/configuration/configuration.service';
import { moduleEngine } from '../../core/modules/module-engine.service';
import { accessControlService } from '../../core/access-control/access-control.service';
import { auditService } from '../../core/audit/audit.service';
import { domainEvents } from '../../core/events/event-bus';

class PlanService {
  private async validateModules(keys: string[]): Promise<string[]> {
    const unique = [...new Set(keys)];
    const modules = await moduleEngine.getGlobalModules('SOCIETY');
    const known = new Set(modules.map((m) => m.key));
    const unknown = unique.filter((k) => !known.has(k));
    if (unknown.length) throw Errors.validation({ modules: [`Unknown modules: ${unknown.join(', ')}`] });
    return unique;
  }

  async list(opts: { includeArchived?: boolean } = {}) {
    const filter = opts.includeArchived ? {} : { status: { $ne: 'ARCHIVED' } };
    const [plans, counts] = await Promise.all([Plan.find(filter).sort({ displayOrder: 1, createdAt: 1 }).lean(), Subscription.aggregate([{ $group: { _id: '$planId', total: { $sum: 1 }, active: { $sum: { $cond: [{ $in: ['$status', ['ACTIVE', 'TRIALING']] }, 1, 0] } } } }])]);
    const countMap = new Map(counts.map((c) => [String(c._id), c]));
    return plans.map((p) => ({ ...p, id: String(p._id), subscriptions: countMap.get(String(p._id))?.total ?? 0, activeSubscriptions: countMap.get(String(p._id))?.active ?? 0 }));
  }

  /** Public pricing payload: only fields needed by the website. */
  async publicPlans() {
    const plans = await Plan.find({ status: 'ACTIVE', publicVisibility: true }).sort({ displayOrder: 1 }).lean();
    const modules = await moduleEngine.getGlobalModules('SOCIETY');
    const moduleName = new Map(modules.map((m) => [m.key, m.name]));
    return plans.map((p) => ({
      id: String(p._id),
      name: p.name,
      slug: p.slug,
      description: p.description,
      monthlyPrice: p.monthlyPrice,
      annualPrice: p.annualPrice,
      currency: p.currency,
      trialDays: p.trialDays,
      features: p.features,
      modules: p.modules.map((k) => ({ key: k, name: moduleName.get(k) ?? k })),
      limits: p.limits,
      highlighted: p.highlighted,
      badge: p.badge,
      ctaLabel: p.ctaLabel,
      isDefault: p.isDefault,
    }));
  }

  async get(id: string): Promise<PlanDoc> {
    const plan = await Plan.findById(id);
    if (!plan) throw Errors.notFound('Plan');
    return plan;
  }

  async create(input: Record<string, any>, byUserId: string, req?: any) {
    if (await Plan.exists({ slug: input.slug })) throw Errors.conflict('A plan with this slug already exists');
    const modules = await this.validateModules(input.modules ?? []);
    if (input.isDefault) await Plan.updateMany({ isDefault: true }, { $set: { isDefault: false } });
    const plan = await Plan.create({ ...input, modules, createdBy: byUserId, updatedBy: byUserId });
    await configurationService.invalidatePlans();
    auditService.record({ action: 'plan.created', resource: 'Plan', resourceId: plan._id, newValue: plan.toObject(), req });
    return plan.toJSON();
  }

  async update(id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const plan = await this.get(id);
    const old = plan.toObject();
    if (patch.slug && patch.slug !== plan.slug && (await Plan.exists({ slug: patch.slug }))) throw Errors.conflict('A plan with this slug already exists');
    if (patch.modules) patch.modules = await this.validateModules(patch.modules);
    if (patch.isDefault) await Plan.updateMany({ _id: { $ne: plan._id }, isDefault: true }, { $set: { isDefault: false } });
    if (patch.status === 'ARCHIVED') patch.archivedAt = new Date();
    plan.set({ ...patch, updatedBy: byUserId });
    await plan.save();
    await configurationService.invalidatePlans();
    await accessControlService.invalidateAll(); // plan module changes affect every society on the plan
    auditService.record({ action: 'plan.updated', resource: 'Plan', resourceId: plan._id, oldValue: { modules: old.modules, limits: old.limits, monthlyPrice: old.monthlyPrice, annualPrice: old.annualPrice, status: old.status }, newValue: patch, req });
    domainEvents.emit('plan.updated', { planId: String(plan._id), changedModules: Boolean(patch.modules) });
    return plan.toJSON();
  }

  async archive(id: string, byUserId: string, req?: any) {
    const plan = await this.get(id);
    if (plan.isDefault) throw Errors.custom(400, ErrorCodes.CONFLICT, 'Set another plan as default before archiving this one');
    return this.update(id, { status: 'ARCHIVED' }, byUserId, req);
  }

  async defaultPlan() {
    const slug = await configurationService.getPlatformSetting<string>('signup.defaultPlanSlug', 'starter');
    return (await Plan.findOne({ slug, status: 'ACTIVE' }).lean()) ?? (await Plan.findOne({ isDefault: true, status: 'ACTIVE' }).lean()) ?? (await Plan.findOne({ status: 'ACTIVE' }).sort({ displayOrder: 1 }).lean());
  }
}

export const planService = new PlanService();
