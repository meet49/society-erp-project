import mongoose from 'mongoose';
import {
  hasPermission as sharedHasPermission,
  moduleOfPermission,
  type AccessContext,
  type AccessibleModule,
  type AuthUser,
  type NavigationGroup,
  type NavigationItem,
  type RoleLanding,
  type NavAudience,
} from '@society-erp/shared';
import { Society } from '../../models/society.model';
import { Membership } from '../../models/membership.model';
import { UserRole } from '../../models/user-role.model';
import { Role } from '../../models/role.model';
import { Subscription } from '../../models/subscription.model';
import type { UserDoc } from '../../models/user.model';
import { accessCache, invalidationBus } from '../../lib/cache';
import { moduleEngine, type ModuleState } from '../modules/module-engine.service';
import { subscriptionEngine } from '../subscription/subscription-engine.service';
import { configurationService } from '../configuration/configuration.service';

type TenantContext = Express.TenantContext;
type PlatformContext = Express.PlatformContext;

const LANDING_PRECEDENCE: RoleLanding[] = ['PLATFORM', 'ADMIN', 'GUARD', 'MEMBER'];

function permissionsForModules(states: ModuleState[], accessible: Set<string>): string[] {
  return states.filter((s) => accessible.has(s.key)).flatMap((s) => s.actions.map((a) => `${s.key}:${a.key}`));
}

/**
 * The single place where effective access is computed:
 * roles + direct permissions, filtered by module accessibility, plus subscription state.
 */
class AccessControlService {
  // ------------------------------------------------------------ tenant (society) context
  async resolveTenantContext(userId: string, societyId: string): Promise<TenantContext | null> {
    return accessCache.getOrSet(`access:tenant:${userId}:${societyId}`, async () => {
      const [society, membership] = await Promise.all([Society.findById(societyId).lean(), Membership.findOne({ userId, societyId }).lean()]);
      if (!society || !membership) return null;
      const assignments = await UserRole.find({ userId, societyId }).lean();
      const roles = assignments.length ? await Role.find({ _id: { $in: assignments.map((a) => a.roleId) }, status: 'ACTIVE' }).lean() : [];
      const states = await moduleEngine.getSocietyModuleStates(societyId);
      const accessible = new Set(states.filter((s) => s.accessible).map((s) => s.key));

      const permissions = new Set<string>();
      if (roles.some((r) => r.grantsAllPermissions)) {
        permissionsForModules(states, accessible).forEach((p) => permissions.add(p));
      } else {
        for (const r of roles) for (const p of r.permissions) if (accessible.has(moduleOfPermission(p)) || p === '*') permissions.add(p);
      }
      for (const p of membership.directPermissions?.allow ?? []) if (accessible.has(moduleOfPermission(p))) permissions.add(p);
      for (const p of membership.directPermissions?.deny ?? []) permissions.delete(p);

      let unitIds: string[] = [];
      let residentId: string | null = membership.residentId ? String(membership.residentId) : null;
      if (mongoose.modelNames().includes('Resident')) {
        const Resident = mongoose.model('Resident');
        const residents = await Resident.find({ societyId, $or: [{ userId }, ...(residentId ? [{ _id: residentId }] : [])], status: { $ne: 'MOVED_OUT' } })
          .select('_id unitId unitIds primary')
          .lean();
        unitIds = [...new Set(residents.flatMap((r: any) => [r.unitId, ...(r.unitIds ?? [])].filter(Boolean).map(String)))];
        if (!residentId && residents.length) residentId = String((residents[0] as any)._id);
      }

      const subscription = await subscriptionEngine.getAccess(societyId);
      return {
        societyId: String(society._id),
        society: { id: String(society._id), name: society.name, slug: society.slug, status: society.status, timezone: society.timezone, currency: society.currency },
        membershipId: String(membership._id),
        residentId,
        unitIds,
        roleIds: roles.map((r) => String(r._id)),
        roleKeys: roles.map((r) => r.key),
        permissions,
        accessibleModules: accessible,
        subscription,
      } satisfies TenantContext;
    });
  }

  // ------------------------------------------------------------ platform context
  async resolvePlatformContext(userId: string): Promise<PlatformContext | null> {
    return accessCache.getOrSet(`access:platform:${userId}`, async () => {
      const assignments = await UserRole.find({ userId, societyId: null }).lean();
      if (!assignments.length) return null;
      const roles = await Role.find({ _id: { $in: assignments.map((a) => a.roleId) }, scope: 'PLATFORM', status: 'ACTIVE' }).lean();
      if (!roles.length) return null;
      const platformModules = await moduleEngine.getGlobalModules('PLATFORM');
      const permissions = new Set<string>();
      if (roles.some((r) => r.grantsAllPermissions)) {
        for (const m of platformModules) if (m.status !== 'INACTIVE') for (const a of m.actions) permissions.add(`${m.key}:${a.key}`);
      } else {
        for (const r of roles) r.permissions.forEach((p) => permissions.add(p));
      }
      return { permissions, roleKeys: roles.map((r) => r.key) } satisfies PlatformContext;
    });
  }

  // ------------------------------------------------------------ checks
  hasPermission(ctx: { permissions: Set<string> } | null | undefined, required: string | string[]): boolean {
    if (!ctx) return false;
    return sharedHasPermission(ctx.permissions, required);
  }

  hasModuleAccess(ctx: TenantContext | null | undefined, moduleKey: string): boolean {
    return Boolean(ctx?.accessibleModules.has(moduleKey));
  }

  async hasPlanFeature(societyId: string, featureKey: string): Promise<boolean> {
    const sub = await Subscription.findOne({ societyId }).lean();
    if (!sub) return false;
    const plan = await configurationService.getPlanConfiguration(String(sub.planId));
    return Boolean(plan?.features?.some((f) => f.key === featureKey && f.included));
  }

  async hasSubscriptionAccess(societyId: string, opts: { write?: boolean } = {}): Promise<boolean> {
    const access = await subscriptionEngine.getAccess(societyId);
    if (access.blocked) return false;
    if (opts.write && access.readOnly) return false;
    return true;
  }

  getEffectivePermissions(ctx: { permissions: Set<string> } | null | undefined): string[] {
    return ctx ? [...ctx.permissions].sort() : [];
  }

  getAccessibleModules(ctx: TenantContext, states: ModuleState[]): AccessibleModule[] {
    return states.map((s) => ({
      key: s.key,
      name: s.name,
      icon: s.icon,
      category: s.category,
      isCore: s.isCore,
      status: s.status,
      accessible: s.accessible,
      enabledBySociety: s.enabledBySociety,
      inPlan: s.inPlan,
      globallyActive: s.globallyActive,
      featureFlagBlocked: s.featureFlagBlocked,
      userHasPermission: s.actions.some((a) => this.hasPermission(ctx, `${s.key}:${a.key}`)),
      configuration: s.configuration,
      settings: s.settings,
    }));
  }

  /** Builds navigation groups from module definitions filtered by module access + permissions + flags. */
  async getAccessibleNavigation(
    permissions: Set<string>,
    modules: { key: string; navigation: any[]; accessible: boolean }[],
    flags: Record<string, boolean>,
    audiences: NavAudience[],
  ): Promise<NavigationGroup[]> {
    const groupDefs = await configurationService.getPlatformSetting<{ key: string; label: string; sortOrder: number; audience: NavAudience }[]>('navigation.groups', []);
    const items: NavigationItem[] = [];
    for (const m of modules) {
      if (!m.accessible) continue;
      for (const n of m.navigation) {
        if (n.hidden) continue;
        if (!audiences.includes(n.audience)) continue;
        if (n.featureFlag && !flags[n.featureFlag]) continue;
        if (n.permissions?.length && !sharedHasPermission(permissions, n.permissions)) continue;
        items.push({ key: `${m.key}.${n.key}`, module: m.key, group: n.group, label: n.label, path: n.path, icon: n.icon, sortOrder: n.sortOrder ?? 0, audience: n.audience });
      }
    }
    const groups: NavigationGroup[] = [];
    for (const g of groupDefs) {
      if (!audiences.includes(g.audience)) continue;
      const groupItems = items.filter((i) => i.group === g.key && i.audience === g.audience).sort((a, b) => a.sortOrder - b.sortOrder);
      if (groupItems.length) groups.push({ key: g.key, label: g.label, sortOrder: g.sortOrder, audience: g.audience, items: groupItems });
    }
    return groups.sort((a, b) => (a.audience === b.audience ? a.sortOrder - b.sortOrder : audiences.indexOf(a.audience) - audiences.indexOf(b.audience)));
  }

  // ------------------------------------------------------------ full context for the client
  async buildAuthUser(user: UserDoc | any, opts: { isPlatformAdmin: boolean }): Promise<AuthUser> {
    const memberships = await Membership.find({ userId: user._id, status: 'ACTIVE' }).populate('societyId', 'name slug logoUrl status').lean();
    const assignments = await UserRole.find({ userId: user._id, societyId: { $ne: null } }).populate('roleId', 'key').lean();
    return {
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      status: user.status,
      isPlatformAdmin: opts.isPlatformAdmin,
      mustChangePassword: Boolean(user.mustChangePassword),
      societies: memberships
        .filter((m: any) => m.societyId && m.societyId.status !== 'ARCHIVED')
        .map((m: any) => ({
          id: String(m.societyId._id),
          name: m.societyId.name,
          slug: m.societyId.slug,
          logoUrl: m.societyId.logoUrl ?? null,
          roleKeys: assignments.filter((a: any) => String(a.societyId) === String(m.societyId._id) && a.roleId).map((a: any) => a.roleId.key),
        })),
    };
  }

  async buildAccessContext(user: UserDoc | any, target: { societyId: string | null; platform: boolean }): Promise<AccessContext> {
    const platformCtx = await this.resolvePlatformContext(String(user._id));
    const authUser = await this.buildAuthUser(user, { isPlatformAdmin: Boolean(platformCtx) });

    if (target.platform && platformCtx) {
      const platformModules = await moduleEngine.getGlobalModules('PLATFORM');
      const flags = await configurationService.getFeatureFlags();
      const mods = platformModules.map((m) => ({ key: m.key, navigation: m.navigation as any[], accessible: m.status !== 'INACTIVE' }));
      const navigation = await this.getAccessibleNavigation(platformCtx.permissions, mods, flags, ['PLATFORM']);
      const roles = await Role.find({ scope: 'PLATFORM', key: { $in: platformCtx.roleKeys } }).lean();
      return {
        user: authUser,
        society: null,
        roles: roles.map((r) => ({ id: String(r._id), key: r.key, name: r.name, landing: r.landing as RoleLanding, color: r.color })),
        permissions: this.getEffectivePermissions(platformCtx),
        landing: 'PLATFORM',
        modules: platformModules.map((m) => ({
          key: m.key,
          name: m.name,
          icon: m.icon,
          category: m.category,
          isCore: true,
          status: m.status,
          accessible: m.status !== 'INACTIVE',
          enabledBySociety: true,
          inPlan: true,
          globallyActive: m.status !== 'INACTIVE',
          featureFlagBlocked: false,
          userHasPermission: m.actions.some((a) => platformCtx.permissions.has(`${m.key}:${a.key}`)),
        })),
        navigation,
        subscription: null,
        featureFlags: flags,
        resident: null,
      };
    }

    if (!target.societyId) {
      return { user: authUser, society: null, roles: [], permissions: [], landing: 'MEMBER', modules: [], navigation: [], subscription: null, featureFlags: {}, resident: null };
    }

    const tenant = await this.resolveTenantContext(String(user._id), target.societyId);
    if (!tenant) {
      return { user: authUser, society: null, roles: [], permissions: [], landing: 'MEMBER', modules: [], navigation: [], subscription: null, featureFlags: {}, resident: null };
    }
    const states = await moduleEngine.getSocietyModuleStates(target.societyId);
    const society = await Society.findById(target.societyId).lean();
    const sub = await Subscription.findOne({ societyId: target.societyId }).lean();
    const flags = await configurationService.getFeatureFlags({ societyId: target.societyId, planId: sub ? String(sub.planId) : null });
    const roles = await Role.find({ _id: { $in: tenant.roleIds } }).lean();
    const landings = roles.map((r) => r.landing as RoleLanding);
    const landing = LANDING_PRECEDENCE.find((l) => landings.includes(l)) ?? 'MEMBER';
    const audiences: NavAudience[] = landing === 'GUARD' ? ['GUARD', 'MEMBER'] : landing === 'ADMIN' ? ['ADMIN', 'MEMBER', 'GUARD'] : ['MEMBER', 'GUARD'];
    const navigation = await this.getAccessibleNavigation(tenant.permissions, states, flags, audiences);
    return {
      user: authUser,
      society: society
        ? { id: String(society._id), name: society.name, slug: society.slug, status: society.status, logoUrl: society.logoUrl ?? null, timezone: society.timezone, currency: society.currency, onboardingCompleted: Boolean(society.onboarding?.completed) }
        : null,
      roles: roles.map((r) => ({ id: String(r._id), key: r.key, name: r.name, landing: r.landing as RoleLanding, color: r.color })),
      permissions: this.getEffectivePermissions(tenant),
      landing,
      modules: this.getAccessibleModules(tenant, states),
      navigation,
      subscription: tenant.subscription,
      featureFlags: flags,
      resident: tenant.residentId ? { id: tenant.residentId, unitIds: tenant.unitIds, primaryUnitId: tenant.unitIds[0] ?? null, type: 'RESIDENT' } : null,
    };
  }

  // ------------------------------------------------------------ invalidation
  async invalidateUser(userId: string): Promise<void> {
    await invalidationBus.invalidate('access:tenant', `${userId}:*`);
    await invalidationBus.invalidate('access:platform', userId);
  }

  async invalidateSociety(societyId: string): Promise<void> {
    await invalidationBus.invalidate('access:tenant');
    await invalidationBus.invalidate('access:modules', societyId);
    await invalidationBus.invalidate('access:subscription', societyId);
  }

  async invalidateAll(): Promise<void> {
    await invalidationBus.invalidate('access');
  }
}

export const accessControlService = new AccessControlService();
