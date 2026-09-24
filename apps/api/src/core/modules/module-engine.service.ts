import { ErrorCodes } from '@society-erp/shared';
import { ModuleModel, type ModuleLean } from '../../models/module.model';
import { SocietyModule } from '../../models/society-module.model';
import { Subscription } from '../../models/subscription.model';
import { accessCache, configCache, invalidationBus } from '../../lib/cache';
import { Errors } from '../../lib/errors';
import { configurationService } from '../configuration/configuration.service';
import { domainEvents } from '../events/event-bus';

export interface ModuleState {
  key: string;
  name: string;
  description?: string;
  icon: string;
  category: string;
  isCore: boolean;
  status: string;
  sortOrder: number;
  dependencies: string[];
  actions: { key: string; label: string; description?: string; ownScope?: boolean }[];
  navigation: any[];
  configuration: Record<string, unknown>;
  settings: Record<string, unknown>;
  globallyActive: boolean;
  inPlan: boolean;
  enabledBySociety: boolean;
  featureFlagBlocked: boolean;
  dependenciesMet: boolean;
  missingDependencies: string[];
  /** usable by the society: global + plan + society toggle + flag + dependencies */
  accessible: boolean;
}

type LeanModule = ModuleLean;

/**
 * Module engine. Resolves the access hierarchy
 * GLOBAL MODULE → PLAN → (SUBSCRIPTION enforced separately) → SOCIETY MODULE → (ROLE/PERMISSION in AccessControl).
 */
class ModuleEngine {
  async getGlobalModules(scope?: 'SOCIETY' | 'PLATFORM'): Promise<LeanModule[]> {
    const all = await configCache.getOrSet('config:modules-all', () => ModuleModel.find().sort({ sortOrder: 1 }).lean() as Promise<LeanModule[]>);
    return scope ? all.filter((m) => m.scope === scope) : all;
  }

  async getModule(key: string): Promise<LeanModule | null> {
    const all = await this.getGlobalModules();
    return all.find((m) => m.key === key) ?? null;
  }

  async getSocietyModuleStates(societyId: string): Promise<ModuleState[]> {
    return accessCache.getOrSet(`access:modules:${societyId}`, async () => {
      const [modules, sub, overrides] = await Promise.all([
        this.getGlobalModules('SOCIETY'),
        Subscription.findOne({ societyId }).lean(),
        SocietyModule.find({ societyId }).lean(),
      ]);
      const plan = sub ? await configurationService.getPlanConfiguration(String(sub.planId)) : null;
      const planModules = new Set<string>(plan?.modules ?? []);
      const flags = await configurationService.getFeatureFlags({ societyId, planId: plan ? String(plan._id) : null });
      const overrideMap = new Map(overrides.map((o) => [o.moduleKey, o]));

      const states = new Map<string, ModuleState>();
      for (const m of modules) {
        const override = overrideMap.get(m.key);
        const inPlan = m.isCore || planModules.has(m.key);
        const globallyActive = m.status !== 'INACTIVE';
        const featureFlagBlocked = m.featureFlag ? !flags[m.featureFlag] : false;
        const enabledBySociety = m.isCore ? true : override ? override.enabled : inPlan; // zero-config: plan modules start enabled
        states.set(m.key, {
          key: m.key,
          name: m.name,
          description: m.description ?? undefined,
          icon: m.icon,
          category: m.category,
          isCore: m.isCore,
          status: m.status,
          sortOrder: m.sortOrder,
          dependencies: m.dependencies ?? [],
          actions: m.actions as any,
          navigation: (m.navigation as any[]).filter((n) => !n.hidden),
          configuration: (m.configuration ?? {}) as Record<string, unknown>,
          settings: (override?.settings ?? {}) as Record<string, unknown>,
          globallyActive,
          inPlan,
          enabledBySociety,
          featureFlagBlocked,
          dependenciesMet: true,
          missingDependencies: [],
          accessible: false,
        });
      }
      // resolve dependencies iteratively (max depth = module count)
      const baseOk = (s: ModuleState) => s.globallyActive && s.inPlan && s.enabledBySociety && !s.featureFlagBlocked;
      for (const s of states.values()) s.accessible = baseOk(s);
      for (let i = 0; i < states.size; i += 1) {
        let changed = false;
        for (const s of states.values()) {
          const missing = s.dependencies.filter((d) => !(states.get(d)?.accessible ?? false));
          const met = missing.length === 0;
          const next = baseOk(s) && met;
          if (next !== s.accessible || s.dependenciesMet !== met) {
            s.accessible = next;
            s.dependenciesMet = met;
            s.missingDependencies = missing;
            changed = true;
          }
        }
        if (!changed) break;
      }
      return [...states.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    });
  }

  async isAccessible(societyId: string, moduleKey: string): Promise<boolean> {
    const states = await this.getSocietyModuleStates(societyId);
    return states.find((s) => s.key === moduleKey)?.accessible ?? false;
  }

  async getAccessibleKeys(societyId: string): Promise<Set<string>> {
    const states = await this.getSocietyModuleStates(societyId);
    return new Set(states.filter((s) => s.accessible).map((s) => s.key));
  }

  /** Throws the most specific error explaining why a module cannot be used. */
  async assertAccessible(societyId: string, moduleKey: string): Promise<void> {
    const states = await this.getSocietyModuleStates(societyId);
    const s = states.find((x) => x.key === moduleKey);
    if (!s) throw Errors.notFound(`Module ${moduleKey}`);
    if (s.accessible) return;
    if (!s.globallyActive) throw Errors.moduleInactive(moduleKey);
    if (!s.inPlan) throw Errors.moduleNotInPlan(moduleKey);
    if (s.featureFlagBlocked) throw Errors.featureDisabled(moduleKey);
    if (!s.dependenciesMet) throw Errors.custom(403, ErrorCodes.MODULE_DEPENDENCY_MISSING, `The ${moduleKey} module requires: ${s.missingDependencies.join(', ')}`, { module: moduleKey, missing: s.missingDependencies });
    throw Errors.moduleDisabled(moduleKey);
  }

  /** Society admin toggle. Data is never deleted; disabling only hides and blocks the module. */
  async setSocietyModule(societyId: string, moduleKey: string, enabled: boolean, byUserId: string): Promise<ModuleState> {
    const states = await this.getSocietyModuleStates(societyId);
    const s = states.find((x) => x.key === moduleKey);
    if (!s) throw Errors.notFound(`Module ${moduleKey}`);
    if (s.isCore) throw Errors.custom(400, ErrorCodes.MODULE_CORE_LOCKED, `${s.name} is a core module and cannot be disabled`, { module: moduleKey });
    if (enabled) {
      if (!s.globallyActive) throw Errors.moduleInactive(moduleKey);
      if (!s.inPlan) throw Errors.moduleNotInPlan(moduleKey);
      const missing = s.dependencies.filter((d) => {
        const dep = states.find((x) => x.key === d);
        return !dep || !(dep.globallyActive && dep.inPlan && dep.enabledBySociety && !dep.featureFlagBlocked);
      });
      if (missing.length) throw Errors.custom(400, ErrorCodes.MODULE_DEPENDENCY_MISSING, `Enable ${missing.join(', ')} first`, { module: moduleKey, missing });
    } else {
      const dependents = states.filter((x) => x.enabledBySociety && x.dependencies.includes(moduleKey) && x.inPlan && !x.isCore).map((x) => x.key);
      if (dependents.length) throw Errors.custom(400, ErrorCodes.MODULE_DEPENDENCY_MISSING, `Disable ${dependents.join(', ')} first (they depend on ${moduleKey})`, { module: moduleKey, dependents });
    }
    await SocietyModule.updateOne(
      { societyId, moduleKey },
      { $set: { enabled, updatedBy: byUserId, ...(enabled ? { enabledAt: new Date() } : { disabledAt: new Date() }) } },
      { upsert: true },
    );
    await this.invalidate(societyId);
    domainEvents.emit('module.toggled', { societyId, moduleKey, enabled }, { societyId, actorId: byUserId });
    const fresh = await this.getSocietyModuleStates(societyId);
    return fresh.find((x) => x.key === moduleKey)!;
  }

  async updateSocietyModuleSettings(societyId: string, moduleKey: string, settings: Record<string, unknown>, byUserId: string): Promise<Record<string, unknown>> {
    const mod = await this.getModule(moduleKey);
    if (!mod || mod.scope !== 'SOCIETY') throw Errors.notFound(`Module ${moduleKey}`);
    const existing = await SocietyModule.findOne({ societyId, moduleKey }).lean();
    const merged = { ...((existing?.settings as Record<string, unknown>) ?? {}), ...settings };
    await SocietyModule.updateOne({ societyId, moduleKey }, { $set: { settings: merged, updatedBy: byUserId }, $setOnInsert: { enabled: true } }, { upsert: true });
    await this.invalidate(societyId);
    return merged;
  }

  async invalidate(societyId?: string): Promise<void> {
    if (societyId) await invalidationBus.invalidate('access:modules', societyId);
    else await invalidationBus.invalidate('access:modules');
    await invalidationBus.invalidate('access:tenant');
  }

  async invalidateGlobal(): Promise<void> {
    await configurationService.invalidateModules();
    await invalidationBus.invalidate('access:modules');
    await invalidationBus.invalidate('access:tenant');
    await invalidationBus.invalidate('access:platform');
  }
}

export const moduleEngine = new ModuleEngine();
