import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { ok, created, noContent, paged } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { paginate } from '../../lib/pagination';
import { jobQueue } from '../../core/jobs/queue';
import { redisConfigured } from '../../lib/redis';
import { transactionsSupported } from '../../lib/mongo';
import { societyService } from '../../core/tenancy/society.service';
import { subscriptionEngine } from '../../core/subscription/subscription-engine.service';
import { moduleEngine } from '../../core/modules/module-engine.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { limitService } from '../../core/limits/limit.service';
import { auditService } from '../../core/audit/audit.service';
import { accessControlService } from '../../core/access-control/access-control.service';
import { domainEvents } from '../../core/events/event-bus';
import { PLATFORM_SETTING_DEFAULTS } from '../../core/configuration/defaults';
import { Subscription } from '../../models/subscription.model';
import { Society } from '../../models/society.model';
import { ModuleModel } from '../../models/module.model';
import { FeatureFlag } from '../../models/feature-flag.model';
import { PlatformSetting } from '../../models/platform-setting.model';
import '../../models/platform-payment.model'; // registers the PlatformPayment model
import { planService } from './plans.service';
import { platformUserService } from './platform-users.service';
import { societyUserService } from '../society/users.service';

const uid = (req: Request) => req.auth!.userId;
const countIfModel = async (model: string, filter: Record<string, unknown>) => (mongoose.modelNames().includes(model) ? mongoose.model(model).countDocuments(filter) : 0);

export const platformController = {
  // ------------------------------------------------------------ dashboard & analytics
  async dashboard(_req: Request, res: Response) {
    const [stats, recentSocieties, radar, leads, tickets, paymentsAgg] = await Promise.all([
      subscriptionEngine.stats(),
      Society.find({ status: { $ne: 'ARCHIVED' } }).sort({ createdAt: -1 }).limit(8).select('name slug status createdAt address.city stats').lean(),
      subscriptionEngine.expiryRadar(),
      countIfModel('Lead', { status: { $in: ['NEW', 'CONTACTED', 'QUALIFIED'] } }),
      countIfModel('SupportTicket', { status: { $in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } }),
      mongoose.modelNames().includes('PlatformPayment')
        ? mongoose.model('PlatformPayment').aggregate([{ $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } }])
        : Promise.resolve([] as any[]),
    ]);
    const since = dayjs().subtract(30, 'day').toDate();
    const newSignups = await Society.countDocuments({ createdAt: { $gte: since } });
    const collected = paymentsAgg.find((p: any) => p._id === 'SUCCESS')?.amount ?? 0;
    const outstanding = await Subscription.aggregate([{ $match: { status: { $in: ['PAST_DUE', 'EXPIRED'] } } }, { $group: { _id: null, amount: { $sum: '$amount' } } }]);
    ok(res, {
      societies: { total: stats.societies, active: stats.counts.ACTIVE ?? 0, trial: stats.counts.TRIALING ?? 0, pastDue: stats.counts.PAST_DUE ?? 0, expired: stats.counts.EXPIRED ?? 0, suspended: stats.counts.SUSPENDED ?? 0, cancelled: stats.counts.CANCELLED ?? 0, expiringSoon: stats.expiringSoon, newSignups },
      revenue: { mrr: stats.mrr, arr: stats.arr, collected, outstanding: outstanding[0]?.amount ?? 0 },
      leads: { open: leads },
      support: { open: tickets },
      expiryRadar: radar.map((b) => ({ key: b.key, label: b.label, count: b.count })),
      recentSocieties,
    });
  },

  async analytics(_req: Request, res: Response) {
    const months = [...Array(12)].map((_, i) => dayjs().subtract(11 - i, 'month').startOf('month'));
    const signups = await Society.aggregate([
      { $match: { createdAt: { $gte: months[0].toDate() } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    ]);
    const byPlan = await Subscription.aggregate([
      { $match: { status: { $in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } } },
      { $group: { _id: '$planId', count: { $sum: 1 }, mrr: { $sum: { $cond: [{ $eq: ['$billingCycle', 'ANNUAL'] }, { $divide: ['$amount', 12] }, '$amount'] } } } },
      { $lookup: { from: 'plans', localField: '_id', foreignField: '_id', as: 'plan' } },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
      { $project: { planId: '$_id', name: '$plan.name', count: 1, mrr: { $round: ['$mrr', 0] } } },
    ]);
    const byStatus = await Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const byCity = await Society.aggregate([{ $match: { status: 'ACTIVE' } }, { $group: { _id: '$address.city', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]);
    const payments = mongoose.modelNames().includes('PlatformPayment')
      ? await mongoose.model('PlatformPayment').aggregate([
          { $match: { status: 'SUCCESS', createdAt: { $gte: months[0].toDate() } } },
          { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, amount: { $sum: '$amount' } } },
        ])
      : [];
    ok(res, {
      signupsByMonth: months.map((m) => ({ month: m.format('MMM YY'), count: signups.find((s) => s._id.y === m.year() && s._id.m === m.month() + 1)?.count ?? 0 })),
      revenueByMonth: months.map((m) => ({ month: m.format('MMM YY'), amount: payments.find((s: any) => s._id.y === m.year() && s._id.m === m.month() + 1)?.amount ?? 0 })),
      byPlan,
      byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
      byCity: byCity.map((c) => ({ city: c._id ?? 'Unknown', count: c.count })),
    });
  },

  async health(_req: Request, res: Response) {
    const mem = process.memoryUsage();
    ok(res, {
      status: mongoose.connection.readyState === 1 ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      database: { state: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', name: mongoose.connection.name, transactions: transactionsSupported() },
      redis: redisConfigured() ? 'configured' : 'not-configured',
      jobs: { driver: jobQueue.driver },
      memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
      time: new Date().toISOString(),
    });
  },

  // ------------------------------------------------------------ societies
  async listSocieties(req: Request, res: Response) {
    paged(res, await societyService.listForPlatform(req.query as any));
  },
  async getSociety(req: Request, res: Response) {
    ok(res, await societyService.getDetailForPlatform(req.params.id));
  },
  async createSociety(req: Request, res: Response) {
    const result = await societyService.createSociety({ ...req.body, source: 'PLATFORM', byUserId: uid(req), allowExistingAdmin: true });
    created(res, { society: result.society.toJSON(), admin: { id: String(result.adminUser._id), email: result.adminUser.email, name: result.adminUser.name, existed: result.adminExisted }, tempPassword: result.tempPassword });
  },
  async updateSociety(req: Request, res: Response) {
    ok(res, (await societyService.updateProfile(req.params.id, req.body, uid(req), req)).toJSON());
  },
  async setSocietyStatus(req: Request, res: Response) {
    ok(res, (await societyService.setStatus(req.params.id, req.body.status, { byUserId: uid(req), reason: req.body.reason, req })).toJSON());
  },
  async societyModules(req: Request, res: Response) {
    ok(res, await moduleEngine.getSocietyModuleStates(req.params.id));
  },
  async toggleSocietyModule(req: Request, res: Response) {
    const state = await moduleEngine.setSocietyModule(req.params.id, req.params.key, req.body.enabled, uid(req));
    auditService.record({ action: req.body.enabled ? 'module.enabled' : 'module.disabled', resource: 'SocietyModule', resourceId: req.params.key, societyId: req.params.id, newValue: { module: req.params.key, enabled: req.body.enabled, byPlatform: true }, req });
    ok(res, state);
  },
  async societyUsers(req: Request, res: Response) {
    paged(res, await societyUserService.list(req.params.id, req.query as any));
  },
  async societyUsage(req: Request, res: Response) {
    ok(res, await limitService.getLimitsWithUsage(req.params.id));
  },
  async societyActivity(req: Request, res: Response) {
    const q = req.query as any;
    paged(res, await auditService.list({ societyId: req.params.id }, { page: q.page, limit: q.limit }));
  },
  async resetSocietyAdminPassword(req: Request, res: Response) {
    const society = await societyService.getById(req.params.id);
    if (!society.primaryAdminUserId) throw Errors.notFound('Primary admin');
    ok(res, await societyUserService.resetPassword(req.params.id, String(society.primaryAdminUserId), uid(req), req));
  },

  // ------------------------------------------------------------ subscriptions
  async listSubscriptions(req: Request, res: Response) {
    const q = req.query as any;
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.planId) filter.planId = q.planId;
    if (q.billingCycle) filter.billingCycle = q.billingCycle;
    if (q.search) {
      const rx = new RegExp(String(q.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const societies = await Society.find({ $or: [{ name: rx }, { slug: rx }] }).select('_id').lean();
      filter.societyId = { $in: societies.map((s) => s._id) };
    }
    paged(res, await paginate(Subscription as any, filter, { page: q.page, limit: q.limit, sort: q.sort, defaultSort: 'renewalDate', allowedSorts: ['renewalDate', 'createdAt', 'status', 'amount'], populate: [{ path: 'societyId', select: 'name slug status address.city' }, { path: 'planId', select: 'name slug' }] }));
  },
  async getSubscription(req: Request, res: Response) {
    const sub = await Subscription.findById(req.params.id).populate('societyId', 'name slug status contact primaryAdminUserId').populate('planId', 'name slug monthlyPrice annualPrice currency modules limits').lean();
    if (!sub) throw Errors.notFound('Subscription');
    ok(res, { ...sub, access: await subscriptionEngine.getAccess(String((sub.societyId as any)._id)) });
  },
  async expiryRadar(_req: Request, res: Response) {
    ok(res, await subscriptionEngine.expiryRadar());
  },
  async extendSubscription(req: Request, res: Response) {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) throw Errors.notFound('Subscription');
    ok(res, (await subscriptionEngine.extend(sub, { byUserId: uid(req), days: req.body.days, note: req.body.note })).toJSON());
  },
  async changeSubscriptionPlan(req: Request, res: Response) {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) throw Errors.notFound('Subscription');
    ok(res, (await subscriptionEngine.changePlan(sub, { byUserId: uid(req), planId: req.body.planId, billingCycle: req.body.billingCycle, note: req.body.note })).toJSON());
  },
  async activateSubscription(req: Request, res: Response) {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) throw Errors.notFound('Subscription');
    let paymentId: string | undefined;
    if (mongoose.modelNames().includes('PlatformPayment')) {
      const PlatformPayment = mongoose.model('PlatformPayment');
      const payment = await PlatformPayment.create({ societyId: sub.societyId, subscriptionId: sub._id, planId: sub.planId, amount: req.body.amount ?? sub.amount, currency: sub.currency, status: 'SUCCESS', provider: 'manual', method: req.body.method ?? 'BANK_TRANSFER', reference: req.body.reference, recordedBy: uid(req), paidAt: new Date(), billingCycle: sub.billingCycle });
      paymentId = String(payment._id);
    }
    ok(res, (await subscriptionEngine.activate(sub, { byUserId: uid(req), paymentId, note: req.body.note ?? 'Activated manually by platform', actorType: 'PLATFORM_ADMIN' })).toJSON());
  },
  async suspendSubscription(req: Request, res: Response) {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) throw Errors.notFound('Subscription');
    ok(res, (await subscriptionEngine.suspend(sub, { byUserId: uid(req), reason: req.body.reason })).toJSON());
  },
  async cancelSubscription(req: Request, res: Response) {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) throw Errors.notFound('Subscription');
    ok(res, (await subscriptionEngine.cancel(sub, { byUserId: uid(req), reason: req.body.reason, actorType: 'PLATFORM_ADMIN' })).toJSON());
  },
  async reactivateSubscription(req: Request, res: Response) {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) throw Errors.notFound('Subscription');
    ok(res, (await subscriptionEngine.reactivate(sub, { byUserId: uid(req), days: req.body.days, note: req.body.note })).toJSON());
  },
  async remindSubscription(req: Request, res: Response) {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) throw Errors.notFound('Subscription');
    const days = dayjs(sub.renewalDate).startOf('day').diff(dayjs().startOf('day'), 'day');
    domainEvents.emit('subscription.expiring', { subscriptionId: String(sub._id), societyId: String(sub.societyId), daysRemaining: days, status: sub.status, manual: true }, { societyId: String(sub.societyId), actorId: uid(req) });
    auditService.record({ action: 'subscription.reminder_sent', resource: 'Subscription', resourceId: sub._id, societyId: String(sub.societyId), req });
    ok(res, { sent: true, daysRemaining: days });
  },
  async runLifecycle(_req: Request, res: Response) {
    ok(res, await subscriptionEngine.runLifecycleCheck());
  },

  // ------------------------------------------------------------ platform payments
  async listPayments(req: Request, res: Response) {
    const q = req.query as any;
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.provider) filter.provider = q.provider;
    if (q.societyId) filter.societyId = q.societyId;
    if (q.search) {
      const rx = new RegExp(String(q.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const societies = await Society.find({ name: rx }).select('_id').lean();
      filter.$or = [{ reference: rx }, { providerPaymentId: rx }, { receiptNumber: rx }, { societyId: { $in: societies.map((s) => s._id) } }];
    }
    const PlatformPayment = mongoose.model('PlatformPayment');
    paged(res, await paginate(PlatformPayment as any, filter, { page: q.page, limit: q.limit, sort: q.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'amount', 'status'], populate: [{ path: 'societyId', select: 'name slug' }, { path: 'planId', select: 'name slug' }] }));
  },

  // ------------------------------------------------------------ plans
  async listPlans(req: Request, res: Response) {
    ok(res, await planService.list({ includeArchived: req.query.includeArchived === 'true' }));
  },
  async getPlan(req: Request, res: Response) {
    ok(res, (await planService.get(req.params.id)).toJSON());
  },
  async createPlan(req: Request, res: Response) {
    created(res, await planService.create(req.body, uid(req), req));
  },
  async updatePlan(req: Request, res: Response) {
    ok(res, await planService.update(req.params.id, req.body, uid(req), req));
  },
  async archivePlan(req: Request, res: Response) {
    ok(res, await planService.archive(req.params.id, uid(req), req));
  },

  // ------------------------------------------------------------ modules & flags
  async listModules(_req: Request, res: Response) {
    const modules = await ModuleModel.find().sort({ scope: 1, sortOrder: 1 }).lean();
    const usage = await mongoose.model('SocietyModule').aggregate([{ $group: { _id: '$moduleKey', enabled: { $sum: { $cond: ['$enabled', 1, 0] } }, disabled: { $sum: { $cond: ['$enabled', 0, 1] } } } }]);
    const usageMap = new Map(usage.map((u) => [u._id, u]));
    ok(res, modules.map((m) => ({ ...m, id: String(m._id), societyUsage: usageMap.get(m.key) ?? { enabled: 0, disabled: 0 } })));
  },
  async updateModule(req: Request, res: Response) {
    const mod = await ModuleModel.findOne({ key: req.params.key });
    if (!mod) throw Errors.notFound('Module');
    const old = mod.toObject();
    const { navigation, configuration, ...rest } = req.body;
    mod.set(rest);
    if (configuration) mod.configuration = { ...(old.configuration ?? {}), ...configuration };
    if (navigation) {
      mod.navigation = (mod.navigation as any[]).map((n) => {
        const patch = navigation.find((p: any) => p.key === n.key);
        return patch ? { ...n, ...patch } : n;
      }) as any;
    }
    await mod.save();
    await moduleEngine.invalidateGlobal();
    auditService.record({ action: 'module.updated', resource: 'Module', resourceId: mod.key, oldValue: { status: old.status, name: old.name }, newValue: req.body, req });
    ok(res, mod.toJSON());
  },
  async listFeatureFlags(_req: Request, res: Response) {
    ok(res, await FeatureFlag.find().sort({ key: 1 }).populate('enabledForSocietyIds', 'name slug').populate('disabledForSocietyIds', 'name slug').populate('enabledForPlanIds', 'name slug').lean());
  },
  async createFeatureFlag(req: Request, res: Response) {
    if (await FeatureFlag.exists({ key: req.body.key })) throw Errors.conflict('Feature flag already exists');
    const flag = await FeatureFlag.create({ ...req.body, updatedBy: uid(req) });
    await configurationService.invalidateFeatureFlags();
    auditService.record({ action: 'feature_flag.created', resource: 'FeatureFlag', resourceId: flag.key, newValue: req.body, req });
    created(res, flag.toJSON());
  },
  async updateFeatureFlag(req: Request, res: Response) {
    const flag = await FeatureFlag.findOne({ key: req.params.key });
    if (!flag) throw Errors.notFound('Feature flag');
    const old = flag.toObject();
    flag.set({ ...req.body, updatedBy: uid(req) });
    await flag.save();
    await configurationService.invalidateFeatureFlags();
    auditService.record({ action: 'feature_flag.updated', resource: 'FeatureFlag', resourceId: flag.key, oldValue: { enabled: old.enabled }, newValue: req.body, req });
    ok(res, flag.toJSON());
  },

  // ------------------------------------------------------------ settings
  async listSettings(req: Request, res: Response) {
    const group = req.query.group as string | undefined;
    const docs = await PlatformSetting.find(group ? { group } : {}).sort({ group: 1, key: 1 }).lean();
    const defs = new Map(PLATFORM_SETTING_DEFAULTS.map((d) => [d.key, d]));
    ok(
      res,
      docs.map((d) => ({ key: d.key, group: d.group, label: d.label ?? defs.get(d.key)?.label ?? d.key, description: d.description ?? defs.get(d.key)?.description, isPublic: d.isPublic, isSecret: d.isSecret, value: d.isSecret ? '••••••' : d.value, defaultValue: defs.get(d.key)?.value, updatedAt: d.updatedAt })),
    );
  },
  async updateSettings(req: Request, res: Response) {
    for (const { key, value } of req.body.settings as { key: string; value: unknown }[]) {
      const before = await configurationService.getPlatformSetting(key);
      await configurationService.setPlatformSetting(key, value, uid(req));
      auditService.record({ action: 'platform.setting_updated', resource: 'PlatformSetting', resourceId: key, oldValue: before, newValue: value, req });
    }
    await accessControlService.invalidateAll();
    noContent(res);
  },

  // ------------------------------------------------------------ platform users
  async listPlatformUsers(_req: Request, res: Response) {
    ok(res, await platformUserService.list(), { roles: await platformUserService.listRoles() });
  },
  async createPlatformUser(req: Request, res: Response) {
    created(res, await platformUserService.create(req.body, uid(req), req));
  },
  async setPlatformUserRoles(req: Request, res: Response) {
    ok(res, await platformUserService.setRoles(req.params.userId, req.body.roleKeys, uid(req), req));
  },

  // ------------------------------------------------------------ audit
  async listAudit(req: Request, res: Response) {
    const q = req.query as any;
    const filter: Record<string, unknown> = {};
    if (q.societyId) filter.societyId = q.societyId;
    if (q.action) filter.action = new RegExp(`^${String(q.action).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    if (q.resource) filter.resource = q.resource;
    if (q.actorId) filter.actorId = q.actorId;
    if (q.actorType) filter.actorType = q.actorType;
    if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
    paged(res, await auditService.list(filter, { page: q.page, limit: q.limit, sort: q.sort }));
  },
};
