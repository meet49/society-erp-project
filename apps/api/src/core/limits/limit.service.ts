import mongoose from 'mongoose';
import { Subscription } from '../../models/subscription.model';
import { Errors } from '../../lib/errors';
import { configurationService } from '../configuration/configuration.service';

/** Known limit keys with the collection used to compute current usage. Plans may define any key. */
export const LIMIT_DEFINITIONS: { key: string; label: string; model: string; filter?: Record<string, unknown> }[] = [
  { key: 'maxUnits', label: 'Units', model: 'Unit', filter: { deletedAt: null } },
  { key: 'maxResidents', label: 'Residents', model: 'Resident', filter: { status: { $ne: 'MOVED_OUT' }, deletedAt: null } },
  { key: 'maxUsers', label: 'Users', model: 'Membership', filter: { status: 'ACTIVE' } },
  { key: 'maxStaff', label: 'Staff', model: 'Staff', filter: { deletedAt: null } },
  { key: 'maxVehicles', label: 'Vehicles', model: 'Vehicle', filter: { deletedAt: null } },
  { key: 'maxDocuments', label: 'Documents', model: 'Document', filter: { status: { $ne: 'ARCHIVED' } } },
  { key: 'maxAdmins', label: 'Admin users', model: 'UserRole' },
  { key: 'maxVisitorsPerDay', label: 'Visitors per day', model: 'Visitor' },
  { key: 'maxStorageMb', label: 'Storage (MB)', model: 'Document' },
];

class LimitService {
  async getPlanLimits(societyId: string): Promise<Record<string, number | null>> {
    const sub = await Subscription.findOne({ societyId }).lean();
    if (!sub) return {};
    const plan = await configurationService.getPlanConfiguration(String(sub.planId));
    return (plan?.limits ?? {}) as Record<string, number | null>;
  }

  async getUsage(societyId: string): Promise<Record<string, number>> {
    const usage: Record<string, number> = {};
    for (const def of LIMIT_DEFINITIONS) {
      if (!mongoose.modelNames().includes(def.model)) continue;
      const model = mongoose.model(def.model);
      if (def.key === 'maxStorageMb') {
        const agg = await model.aggregate([{ $match: { societyId: new mongoose.Types.ObjectId(societyId) } }, { $group: { _id: null, size: { $sum: '$size' } } }]);
        usage[def.key] = Math.round(((agg[0]?.size ?? 0) / (1024 * 1024)) * 100) / 100;
        continue;
      }
      if (def.key === 'maxVisitorsPerDay') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        usage[def.key] = await model.countDocuments({ societyId, createdAt: { $gte: start } });
        continue;
      }
      if (def.key === 'maxAdmins') {
        const Role = mongoose.model('Role');
        const adminRoles = await Role.find({ societyId, grantsAllPermissions: true }).select('_id').lean();
        usage[def.key] = await model.countDocuments({ societyId, roleId: { $in: adminRoles.map((r: any) => r._id) } });
        continue;
      }
      usage[def.key] = await model.countDocuments({ societyId, ...(def.filter ?? {}) });
    }
    return usage;
  }

  async getLimitsWithUsage(societyId: string) {
    const [limits, usage] = await Promise.all([this.getPlanLimits(societyId), this.getUsage(societyId)]);
    return LIMIT_DEFINITIONS.map((d) => ({
      key: d.key,
      label: d.label,
      limit: limits[d.key] ?? null,
      used: usage[d.key] ?? 0,
      remaining: limits[d.key] == null ? null : Math.max(0, (limits[d.key] as number) - (usage[d.key] ?? 0)),
    }));
  }

  /** Throws PLAN_LIMIT_EXCEEDED when adding `adding` records would exceed the plan limit for `key`. */
  async assertWithinLimit(societyId: string, key: string, adding = 1): Promise<void> {
    const limits = await this.getPlanLimits(societyId);
    const limit = limits[key];
    if (limit === null || limit === undefined || limit <= 0) return; // unlimited
    const usage = await this.getUsage(societyId);
    const current = usage[key] ?? 0;
    if (current + adding > limit) throw Errors.limitExceeded(key, limit, current);
  }
}

export const limitService = new LimitService();
