import type { ClientSession } from 'mongoose';
import mongoose from 'mongoose';
import { DEFAULT_SOCIETY_ROLES, ErrorCodes, type BillingCycle, type SocietyType } from '@society-erp/shared';
import { Society, type SocietyDoc } from '../../models/society.model';
import { User, type UserDoc } from '../../models/user.model';
import { Role } from '../../models/role.model';
import { Membership } from '../../models/membership.model';
import { UserRole } from '../../models/user-role.model';
import { Subscription } from '../../models/subscription.model';
import { Plan } from '../../models/plan.model';
import { hashPassword, randomCode } from '../../lib/crypto';
import { Errors } from '../../lib/errors';
import { withTransaction } from '../../lib/mongo';
import { paginateAggregate } from '../../lib/pagination';
import { subscriptionEngine } from '../subscription/subscription-engine.service';
import { accessControlService } from '../access-control/access-control.service';
import { moduleEngine } from '../modules/module-engine.service';
import { limitService } from '../limits/limit.service';
import { auditService } from '../audit/audit.service';
import { domainEvents } from '../events/event-bus';
import { logger } from '../../lib/logger';

export interface SocietyInitializerContext {
  societyId: string;
  adminUserId: string;
  session?: ClientSession;
}
type Initializer = (ctx: SocietyInitializerContext) => Promise<void>;
const initializers: { name: string; fn: Initializer }[] = [];

/** Modules register per-society setup (default categories, chart of accounts, sequences...). */
export function registerSocietyInitializer(name: string, fn: Initializer): void {
  if (!initializers.some((i) => i.name === name)) initializers.push({ name, fn });
}

export interface CreateSocietyInput {
  society: {
    name: string;
    slug?: string;
    type?: SocietyType;
    city?: string;
    state?: string;
    pincode?: string;
    addressLine1?: string;
    totalUnits?: number;
    contactEmail?: string;
    contactPhone?: string;
    timezone?: string;
    currency?: string;
    registrationNumber?: string;
  };
  admin: { name: string; email: string; phone?: string; password?: string };
  planId: string;
  billingCycle: BillingCycle;
  startTrial?: boolean;
  trialDaysOverride?: number;
  source: 'SIGNUP' | 'PLATFORM' | 'IMPORT' | 'SEED';
  byUserId?: string;
  /** signup must not silently attach existing accounts */
  allowExistingAdmin?: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'society';
}

class SocietyService {
  async generateSlug(name: string, preferred?: string, session?: ClientSession): Promise<string> {
    const base = preferred ? slugify(preferred) : slugify(name);
    let slug = base;
    let i = 2;
    while (await Society.exists({ slug }).session(session ?? null)) {
      slug = `${base}-${i}`;
      i += 1;
    }
    return slug;
  }

  /** Creates society + admin + default roles + subscription atomically, then runs module initializers. */
  async createSociety(input: CreateSocietyInput): Promise<{ society: SocietyDoc; adminUser: UserDoc; tempPassword?: string; adminExisted: boolean }> {
    const plan = await Plan.findById(input.planId).lean();
    if (!plan || plan.status !== 'ACTIVE') throw Errors.custom(400, ErrorCodes.PLAN_UNAVAILABLE, 'Selected plan is not available');
    const email = input.admin.email.toLowerCase();
    const existingUser = await User.findOne({ email }).select('+passwordHash');
    if (existingUser && !input.allowExistingAdmin) {
      throw Errors.conflict('An account with this email already exists. Sign in and create the society from your account, or use another email.', { field: 'admin.email' });
    }
    let tempPassword: string | undefined;

    const result = await withTransaction(async (session) => {
      const slug = await this.generateSlug(input.society.name, input.society.slug, session);
      let adminUser = existingUser;
      if (!adminUser) {
        const password = input.admin.password ?? (tempPassword = `${randomCode(6)}-${randomCode(4)}`);
        const [created] = await User.create(
          [
            {
              name: input.admin.name,
              email,
              phone: input.admin.phone,
              passwordHash: await hashPassword(password),
              status: 'ACTIVE',
              mustChangePassword: !input.admin.password,
              emailVerifiedAt: input.source === 'SIGNUP' ? undefined : new Date(),
              createdBy: input.byUserId,
            },
          ],
          { session },
        );
        adminUser = created as any;
      }
      const [society] = await Society.create(
        [
          {
            name: input.society.name,
            slug,
            type: input.society.type ?? 'APARTMENT',
            registrationNumber: input.society.registrationNumber,
            address: { line1: input.society.addressLine1, city: input.society.city, state: input.society.state, pincode: input.society.pincode },
            contact: { email: input.society.contactEmail ?? email, phone: input.society.contactPhone ?? input.admin.phone },
            timezone: input.society.timezone ?? 'Asia/Kolkata',
            currency: input.society.currency ?? plan.currency ?? 'INR',
            status: 'ACTIVE',
            onboarding: { completed: false, step: 1 },
            primaryAdminUserId: adminUser!._id,
            expectedUnits: input.society.totalUnits,
            source: input.source,
            createdBy: input.byUserId ?? adminUser!._id,
          },
        ],
        { session },
      );
      const roles = await Role.create(
        DEFAULT_SOCIETY_ROLES.map((r) => ({
          societyId: society._id,
          scope: 'SOCIETY',
          key: r.key,
          name: r.name,
          description: r.description,
          permissions: r.permissions,
          grantsAllPermissions: r.grantsAllPermissions,
          landing: r.landing,
          isSystem: r.isSystem,
          color: r.color,
          createdBy: input.byUserId ?? adminUser!._id,
        })),
        { session, ordered: true },
      );
      const adminRole = roles.find((r) => r.key === 'SOCIETY_ADMIN')!;
      await Membership.create([{ userId: adminUser!._id, societyId: society._id, status: 'ACTIVE', isPrimaryAdmin: true, joinedAt: new Date() }], { session });
      await UserRole.create([{ userId: adminUser!._id, roleId: adminRole._id, societyId: society._id, assignedBy: input.byUserId ?? adminUser!._id }], { session });
      await subscriptionEngine.createForSociety({
        societyId: String(society._id),
        planId: input.planId,
        billingCycle: input.billingCycle,
        byUserId: input.byUserId ?? String(adminUser!._id),
        startTrial: input.startTrial,
        trialDaysOverride: input.trialDaysOverride,
        session,
      });
      for (const init of initializers) {
        await init.fn({ societyId: String(society._id), adminUserId: String(adminUser!._id), session });
      }
      return { society, adminUser: adminUser! };
    });

    await accessControlService.invalidateSociety(String(result.society._id));
    await accessControlService.invalidateUser(String(result.adminUser._id));
    const sub = await Subscription.findOne({ societyId: result.society._id }).lean();
    auditService.record({
      action: 'society.created',
      resource: 'Society',
      resourceId: result.society._id,
      societyId: String(result.society._id),
      newValue: { name: result.society.name, slug: result.society.slug, planId: input.planId, billingCycle: input.billingCycle, source: input.source },
      actor: input.byUserId ? { id: input.byUserId, type: input.source === 'PLATFORM' ? 'PLATFORM_ADMIN' : 'USER' } : { id: String(result.adminUser._id), type: 'USER', email: result.adminUser.email, name: result.adminUser.name },
    });
    domainEvents.emit(
      'society.created',
      {
        societyId: String(result.society._id),
        societyName: result.society.name,
        planName: plan.name,
        adminEmail: result.adminUser.email,
        adminName: result.adminUser.name,
        trialEndDate: sub?.trialEndDate ?? null,
        source: input.source,
      },
      { societyId: String(result.society._id), actorId: input.byUserId ?? String(result.adminUser._id) },
    );
    logger.info({ societyId: String(result.society._id), slug: result.society.slug }, 'Society created');
    return { ...result, tempPassword, adminExisted: Boolean(existingUser) };
  }

  async getById(societyId: string): Promise<SocietyDoc> {
    const society = await Society.findById(societyId);
    if (!society) throw Errors.notFound('Society');
    return society;
  }

  async updateProfile(societyId: string, patch: Record<string, unknown>, byUserId: string, req?: any): Promise<SocietyDoc> {
    const society = await this.getById(societyId);
    const old = society.toObject();
    const allowed = ['name', 'type', 'registrationNumber', 'address', 'contact', 'timezone', 'currency', 'locale', 'logoUrl', 'expectedUnits', 'notes'];
    for (const key of allowed) if (patch[key] !== undefined) society.set(key, patch[key]);
    if (patch.slug && patch.slug !== society.slug) society.slug = await this.generateSlug(society.name, String(patch.slug));
    await society.save();
    await accessControlService.invalidateSociety(societyId);
    auditService.record({ action: 'society.updated', resource: 'Society', resourceId: society._id, societyId, oldValue: { name: old.name, address: old.address, contact: old.contact }, newValue: patch, actor: { id: byUserId, type: req?.auth?.isPlatform ? 'PLATFORM_ADMIN' : 'USER' }, req });
    return society;
  }

  async updateOnboarding(societyId: string, patch: { step?: number; completed?: boolean; skippedStep?: number }): Promise<SocietyDoc> {
    const society = await this.getById(societyId);
    if (patch.step !== undefined) society.set('onboarding.step', Math.max(society.onboarding?.step ?? 1, patch.step));
    if (patch.skippedStep !== undefined) society.set('onboarding.skippedSteps', [...(society.onboarding?.skippedSteps ?? []), patch.skippedStep]);
    if (patch.completed) {
      society.set('onboarding.completed', true);
      society.set('onboarding.completedAt', new Date());
    }
    await society.save();
    await accessControlService.invalidateSociety(societyId);
    return society;
  }

  async computeStats(societyId: string): Promise<{ units: number; residents: number; users: number }> {
    const count = async (model: string, filter: Record<string, unknown>) => (mongoose.modelNames().includes(model) ? mongoose.model(model).countDocuments({ societyId, ...filter }) : 0);
    const [units, residents, users] = await Promise.all([count('Unit', { deletedAt: null }), count('Resident', { status: { $ne: 'MOVED_OUT' }, deletedAt: null }), Membership.countDocuments({ societyId, status: 'ACTIVE' })]);
    await Society.updateOne({ _id: societyId }, { $set: { stats: { units, residents, users, lastComputedAt: new Date() } } });
    return { units, residents, users };
  }

  // ------------------------------------------------------------------ platform operations
  async setStatus(societyId: string, status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED', meta: { byUserId: string; reason?: string; req?: any }): Promise<SocietyDoc> {
    const society = await this.getById(societyId);
    const from = society.status;
    society.status = status;
    if (status === 'SUSPENDED') {
      society.suspendedAt = new Date();
      society.suspendReason = meta.reason;
    }
    if (status === 'ARCHIVED') society.archivedAt = new Date();
    if (status === 'ACTIVE') {
      society.suspendedAt = undefined;
      society.suspendReason = undefined;
      society.archivedAt = undefined;
    }
    await society.save();
    await accessControlService.invalidateSociety(societyId);
    auditService.record({ action: `society.${status.toLowerCase()}`, resource: 'Society', resourceId: society._id, societyId, oldValue: { status: from }, newValue: { status, reason: meta.reason }, actor: { id: meta.byUserId, type: 'PLATFORM_ADMIN' }, req: meta.req });
    domainEvents.emit('society.status_changed', { societyId, from, to: status }, { societyId, actorId: meta.byUserId });
    return society;
  }

  async listForPlatform(query: { page?: number; limit?: number; search?: string; status?: string; subscriptionStatus?: string; planId?: string; sort?: string; expiringWithinDays?: number }) {
    const match: Record<string, unknown> = {};
    if (query.status) match.status = query.status;
    if (query.search) {
      const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [{ name: rx }, { slug: rx }, { 'address.city': rx }, { 'contact.email': rx }];
    }
    const subMatch: Record<string, unknown> = {};
    if (query.subscriptionStatus) subMatch['subscription.status'] = query.subscriptionStatus;
    if (query.planId) subMatch['subscription.planId'] = new mongoose.Types.ObjectId(query.planId);
    if (query.expiringWithinDays !== undefined) {
      subMatch['subscription.renewalDate'] = { $lte: new Date(Date.now() + query.expiringWithinDays * 86400000) };
      subMatch['subscription.status'] = { $in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] };
    }
    const sortMap: Record<string, Record<string, 1 | -1>> = {
      '-createdAt': { createdAt: -1 },
      createdAt: { createdAt: 1 },
      name: { name: 1 },
      '-name': { name: -1 },
      renewalDate: { 'subscription.renewalDate': 1 },
      '-renewalDate': { 'subscription.renewalDate': -1 },
    };
    const pipeline: mongoose.PipelineStage[] = [
      { $match: match },
      { $lookup: { from: 'subscriptions', localField: '_id', foreignField: 'societyId', as: 'subscription' } },
      { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'plans', localField: 'subscription.planId', foreignField: '_id', pipeline: [{ $project: { name: 1, slug: 1 } }], as: 'plan' } },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'users', localField: 'primaryAdminUserId', foreignField: '_id', pipeline: [{ $project: { name: 1, email: 1, phone: 1 } }], as: 'admin' } },
      { $unwind: { path: '$admin', preserveNullAndEmptyArrays: true } },
      ...(Object.keys(subMatch).length ? [{ $match: subMatch } as mongoose.PipelineStage] : []),
      { $project: { name: 1, slug: 1, type: 1, status: 1, address: 1, contact: 1, stats: 1, createdAt: 1, onboarding: 1, admin: 1, plan: 1, subscription: { status: 1, renewalDate: 1, trialEndDate: 1, billingCycle: 1, amount: 1, currency: 1, gracePeriodEndsAt: 1 } } },
    ];
    return paginateAggregate(Society as any, pipeline, { page: query.page, limit: query.limit, sort: sortMap[query.sort ?? '-createdAt'] ?? { createdAt: -1 } });
  }

  async getDetailForPlatform(societyId: string) {
    const society = await this.getById(societyId);
    const [subscription, admin, stats, modules, limits, adminRoleIds] = await Promise.all([
      Subscription.findOne({ societyId }).populate('planId', 'name slug monthlyPrice annualPrice currency modules limits').lean(),
      society.primaryAdminUserId ? User.findById(society.primaryAdminUserId).select('name email phone status lastLoginAt').lean() : null,
      this.computeStats(societyId),
      moduleEngine.getSocietyModuleStates(societyId),
      limitService.getLimitsWithUsage(societyId),
      Role.find({ societyId, grantsAllPermissions: true }).select('_id').lean(),
    ]);
    const adminCount = await UserRole.countDocuments({ societyId, roleId: { $in: adminRoleIds.map((r) => r._id) } });
    return { society: society.toJSON(), subscription, admin, stats, modules, limits, adminCount };
  }
}

export const societyService = new SocietyService();
