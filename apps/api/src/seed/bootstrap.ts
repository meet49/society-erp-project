import { ALL_MODULES, PLATFORM_ROLES } from '@society-erp/shared';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { hashPassword } from '../lib/crypto';
import { ModuleModel } from '../models/module.model';
import { Permission } from '../models/permission.model';
import { PlatformSetting } from '../models/platform-setting.model';
import { FeatureFlag } from '../models/feature-flag.model';
import { Role } from '../models/role.model';
import { User } from '../models/user.model';
import { UserRole } from '../models/user-role.model';
import { Plan } from '../models/plan.model';
import { NotificationTemplate } from '../models/notification-template.model';
import { PLATFORM_SETTING_DEFAULTS } from '../core/configuration/defaults';
import { DEFAULT_NOTIFICATION_TEMPLATES } from '../core/notifications/templates';
import { DEFAULT_FEATURE_FLAGS } from './data/feature-flags';
import { DEFAULT_PLANS } from './data/plans';
import { moduleEngine } from '../core/modules/module-engine.service';
import { invalidationBus } from '../lib/cache';
import { landingService } from '../modules/public/landing.service';

/** Sync the module catalogue from the shared registry. Platform-owner edits (name, status, labels) are preserved. */
export async function syncModules(): Promise<void> {
  for (const def of ALL_MODULES) {
    const existing = await ModuleModel.findOne({ key: def.key });
    if (!existing) {
      await ModuleModel.create({ ...def, navigation: def.navigation.map((n) => ({ ...n, hidden: false })) });
      continue;
    }
    const navByKey = new Map((existing.navigation as any[]).map((n) => [n.key, n]));
    existing.set({
      scope: def.scope,
      category: def.category,
      isCore: def.isCore,
      dependencies: def.dependencies,
      actions: def.actions,
      featureFlag: def.featureFlag,
      version: def.version,
      navigation: def.navigation.map((n) => {
        const prev = navByKey.get(n.key);
        return prev ? { ...n, label: prev.label ?? n.label, sortOrder: prev.sortOrder ?? n.sortOrder, hidden: prev.hidden ?? false, icon: prev.icon ?? n.icon } : { ...n, hidden: false };
      }),
      configuration: { ...def.configuration, ...((existing.configuration as Record<string, unknown>) ?? {}) },
    });
    await existing.save();
  }
  for (const def of ALL_MODULES) {
    for (const a of def.actions) {
      await Permission.updateOne(
        { key: `${def.key}:${a.key}` },
        { $set: { module: def.key, action: a.key, scope: def.scope, ownScope: Boolean(a.ownScope) }, $setOnInsert: { label: a.label, description: a.description } },
        { upsert: true },
      );
    }
  }
  await moduleEngine.invalidateGlobal();
}

export async function ensurePlatformSettings(): Promise<void> {
  for (const def of PLATFORM_SETTING_DEFAULTS) {
    await PlatformSetting.updateOne(
      { key: def.key },
      { $setOnInsert: { value: def.value, group: def.group, label: def.label, description: def.description, isPublic: Boolean(def.isPublic), isSecret: Boolean(def.isSecret) } },
      { upsert: true },
    );
  }
  await invalidationBus.invalidate('config:platform');
  await invalidationBus.invalidate('config:platform-public');
}

export async function ensureFeatureFlags(): Promise<void> {
  for (const f of DEFAULT_FEATURE_FLAGS) {
    await FeatureFlag.updateOne({ key: f.key }, { $setOnInsert: { name: f.name, description: f.description, enabled: f.enabled } }, { upsert: true });
  }
  await invalidationBus.invalidate('config:flags');
}

export async function ensurePlatformRoles(): Promise<void> {
  for (const r of PLATFORM_ROLES) {
    await Role.updateOne(
      { societyId: null, key: r.key, scope: 'PLATFORM' },
      { $set: { grantsAllPermissions: r.grantsAllPermissions, isSystem: true, landing: r.landing, status: 'ACTIVE' }, $setOnInsert: { name: r.name, description: r.description, permissions: r.permissions, color: r.color } },
      { upsert: true },
    );
  }
}

export async function ensureSuperAdmin(): Promise<void> {
  const role = await Role.findOne({ societyId: null, key: 'SUPER_ADMIN', scope: 'PLATFORM' });
  if (!role) return;
  const existing = await UserRole.findOne({ roleId: role._id, societyId: null }).lean();
  if (existing) return;
  let user = await User.findOne({ email: env.SEED_SUPER_ADMIN_EMAIL.toLowerCase() });
  if (!user) {
    user = await User.create({
      name: 'Platform Super Admin',
      email: env.SEED_SUPER_ADMIN_EMAIL.toLowerCase(),
      passwordHash: await hashPassword(env.SEED_SUPER_ADMIN_PASSWORD),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      mustChangePassword: env.NODE_ENV === 'production',
    });
  }
  await UserRole.updateOne({ userId: user._id, roleId: role._id, societyId: null }, { $setOnInsert: { assignedAt: new Date() } }, { upsert: true });
  logger.warn({ email: user.email }, 'SUPER_ADMIN account ensured (change the default password!)');
}

export async function ensureDefaultPlans(): Promise<void> {
  const count = await Plan.countDocuments();
  if (count > 0) return;
  await Plan.insertMany(DEFAULT_PLANS);
  logger.info({ plans: DEFAULT_PLANS.length }, 'Default plans created');
}

export async function ensureNotificationTemplates(): Promise<void> {
  for (const t of DEFAULT_NOTIFICATION_TEMPLATES) {
    await NotificationTemplate.updateOne(
      { societyId: null, key: t.key, channel: t.channel },
      { $setOnInsert: { subject: t.subject, body: t.body, description: t.description, variables: t.variables, enabled: true } },
      { upsert: true },
    );
  }
}

/** Idempotent structural bootstrap executed at every API start. Never touches tenant data. */
export async function ensureBootstrapData(): Promise<void> {
  await syncModules();
  await ensurePlatformSettings();
  await ensureFeatureFlags();
  await ensurePlatformRoles();
  await ensureSuperAdmin();
  await ensureDefaultPlans();
  await ensureNotificationTemplates();
  await landingService.ensureDefaults();
  await invalidationBus.invalidate('all');
  logger.info('Bootstrap data ensured');
}
