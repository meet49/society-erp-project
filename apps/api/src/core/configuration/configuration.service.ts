import { PlatformSetting } from '../../models/platform-setting.model';
import { SocietySetting } from '../../models/society-setting.model';
import { FeatureFlag } from '../../models/feature-flag.model';
import { ModuleModel } from '../../models/module.model';
import { SocietyModule } from '../../models/society-module.model';
import { Plan } from '../../models/plan.model';
import { WorkflowDefinition } from '../../models/workflow.model';
import { configCache, invalidationBus } from '../../lib/cache';
import { PLATFORM_SETTING_DEFAULTS, SOCIETY_SETTING_DEFAULTS } from './defaults';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override === undefined ? base : override) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/**
 * Centralised configuration access. All business configuration flows through here so callers never
 * scatter setting lookups or hard-code defaults.
 */
class ConfigurationService {
  // ---------- platform settings
  async getPlatformSetting<T = unknown>(key: string, fallback?: T): Promise<T> {
    const all = await this.loadPlatformSettings();
    if (key in all) return all[key] as T;
    const def = PLATFORM_SETTING_DEFAULTS.find((d) => d.key === key);
    return (def ? def.value : fallback) as T;
  }

  async getPlatformSettings(group?: string): Promise<Record<string, unknown>> {
    const all = await this.loadPlatformSettings();
    if (!group) return all;
    const keys = new Set(PLATFORM_SETTING_DEFAULTS.filter((d) => d.group === group).map((d) => d.key));
    const docs = await PlatformSetting.find({ group }).lean();
    docs.forEach((d) => keys.add(d.key));
    return Object.fromEntries([...keys].map((k) => [k, all[k]]));
  }

  async getPublicPlatformSettings(): Promise<Record<string, unknown>> {
    return configCache.getOrSet('config:platform-public', async () => {
      const docs = await PlatformSetting.find({ isPublic: true, isSecret: { $ne: true } }).lean();
      const stored = new Map(docs.map((d) => [d.key, d.value]));
      const out: Record<string, unknown> = {};
      for (const def of PLATFORM_SETTING_DEFAULTS) {
        if (def.isPublic) out[def.key] = stored.has(def.key) ? stored.get(def.key) : def.value;
      }
      for (const d of docs) if (!(d.key in out)) out[d.key] = d.value;
      return out;
    });
  }

  async setPlatformSetting(key: string, value: unknown, byUserId?: string): Promise<void> {
    const def = PLATFORM_SETTING_DEFAULTS.find((d) => d.key === key);
    await PlatformSetting.updateOne(
      { key },
      {
        $set: { value, updatedBy: byUserId },
        $setOnInsert: { group: def?.group ?? 'custom', label: def?.label ?? key, isPublic: def?.isPublic ?? false, isSecret: def?.isSecret ?? false },
      },
      { upsert: true },
    );
    await invalidationBus.invalidate('config:platform');
    await invalidationBus.invalidate('config:platform-public');
    await invalidationBus.invalidate('config:landing');
    await invalidationBus.invalidate('access');
  }

  private async loadPlatformSettings(): Promise<Record<string, unknown>> {
    return configCache.getOrSet('config:platform:all', async () => {
      const docs = await PlatformSetting.find().lean();
      const out: Record<string, unknown> = {};
      for (const def of PLATFORM_SETTING_DEFAULTS) out[def.key] = def.value;
      for (const d of docs) out[d.key] = d.value;
      return out;
    });
  }

  // ---------- society settings
  async getSocietySetting<T = Record<string, unknown>>(societyId: string, key: string): Promise<T> {
    const all = await this.loadSocietySettings(societyId);
    const def = SOCIETY_SETTING_DEFAULTS[key];
    const stored = all[key];
    if (stored === undefined) return def as T;
    return deepMerge(def, stored) as T;
  }

  async getAllSocietySettings(societyId: string): Promise<Record<string, unknown>> {
    const all = await this.loadSocietySettings(societyId);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(SOCIETY_SETTING_DEFAULTS)) out[key] = deepMerge(SOCIETY_SETTING_DEFAULTS[key], all[key]);
    for (const key of Object.keys(all)) if (!(key in out)) out[key] = all[key];
    return out;
  }

  async setSocietySetting(societyId: string, key: string, value: unknown, byUserId?: string): Promise<unknown> {
    // partial updates keep the other keys as they are (defaults <- stored <- patch)
    const current = await this.getSocietySetting<Record<string, unknown>>(societyId, key);
    const merged = deepMerge(current ?? SOCIETY_SETTING_DEFAULTS[key], value);
    await SocietySetting.updateOne({ societyId, key }, { $set: { value: merged, updatedBy: byUserId } }, { upsert: true });
    await invalidationBus.invalidate('config:society', societyId);
    return merged;
  }

  private async loadSocietySettings(societyId: string): Promise<Record<string, unknown>> {
    return configCache.getOrSet(`config:society:${societyId}`, async () => {
      const docs = await SocietySetting.find({ societyId }).lean();
      return Object.fromEntries(docs.map((d) => [d.key, d.value]));
    });
  }

  // ---------- feature flags
  async getFeatureFlags(ctx: { societyId?: string | null; planId?: string | null } = {}): Promise<Record<string, boolean>> {
    const flags = await configCache.getOrSet('config:flags', () => FeatureFlag.find().lean());
    const out: Record<string, boolean> = {};
    for (const f of flags) {
      const sid = ctx.societyId ? String(ctx.societyId) : null;
      const pid = ctx.planId ? String(ctx.planId) : null;
      if (sid && f.disabledForSocietyIds.some((x) => String(x) === sid)) {
        out[f.key] = false;
        continue;
      }
      if (sid && f.enabledForSocietyIds.some((x) => String(x) === sid)) {
        out[f.key] = true;
        continue;
      }
      if (pid && f.enabledForPlanIds.some((x) => String(x) === pid)) {
        out[f.key] = true;
        continue;
      }
      out[f.key] = Boolean(f.enabled);
    }
    return out;
  }

  async getFeatureFlag(key: string, ctx: { societyId?: string | null; planId?: string | null } = {}): Promise<boolean> {
    const flags = await this.getFeatureFlags(ctx);
    return flags[key] ?? false;
  }

  async invalidateFeatureFlags(): Promise<void> {
    await invalidationBus.invalidate('config:flags');
    await invalidationBus.invalidate('access');
  }

  // ---------- module configuration
  async getModuleConfiguration<T = Record<string, unknown>>(moduleKey: string, societyId?: string): Promise<T> {
    const mod = await configCache.getOrSet(`config:module:${moduleKey}`, () => ModuleModel.findOne({ key: moduleKey }).lean());
    const base = (mod?.configuration ?? {}) as Record<string, unknown>;
    if (!societyId) return base as T;
    const sm = await SocietyModule.findOne({ societyId, moduleKey }).lean();
    return deepMerge(base, sm?.settings ?? {}) as T;
  }

  async invalidateModules(): Promise<void> {
    await invalidationBus.invalidate('config:module');
    await invalidationBus.invalidate('config:modules-all');
    await invalidationBus.invalidate('access');
  }

  // ---------- plan configuration
  async getPlanConfiguration(planId: string) {
    return configCache.getOrSet(`config:plan:${planId}`, () => Plan.findById(planId).lean(), 30_000);
  }

  async invalidatePlans(): Promise<void> {
    await invalidationBus.invalidate('config:plan');
    await invalidationBus.invalidate('access');
  }

  // ---------- workflow configuration
  async getWorkflowConfiguration(societyId: string, workflowKey: string) {
    return WorkflowDefinition.findOne({ societyId, key: workflowKey }).lean();
  }
}

export const configurationService = new ConfigurationService();
