import type { ClientSession } from 'mongoose';
import { CategoryTypes, ErrorCodes, type CategoryType } from '@society-erp/shared';
import { Category } from '../../models/category.model';
import { Errors } from '../../lib/errors';
import { configCache, invalidationBus } from '../../lib/cache';
import { CATEGORY_DEFAULTS } from './defaults';
import { registerSocietyInitializer } from '../tenancy/society.service';
import { auditService } from '../audit/audit.service';

function keyFromName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'CATEGORY';
}

/** Configurable category engine shared by complaints, visitors, staff, vendors, expenses, assets... */
class CategoryService {
  async ensureDefaults(societyId: string, session?: ClientSession, types: CategoryType[] = [...CategoryTypes]): Promise<void> {
    for (const type of types) {
      const existing = await Category.countDocuments({ societyId, type }).session(session ?? null);
      if (existing > 0) continue;
      const defaults = CATEGORY_DEFAULTS[type] ?? [];
      if (!defaults.length) continue;
      await Category.create(
        defaults.map((d, i) => ({ societyId, type, key: d.key, name: d.name, color: d.color, icon: d.icon, metadata: d.metadata ?? {}, sortOrder: i, isActive: true, isSystem: Boolean(d.isSystem) })),
        { session, ordered: true },
      );
    }
    configCache.deletePrefix(`config:categories:${societyId}`);
  }

  async list(societyId: string, type?: CategoryType, opts: { includeInactive?: boolean } = {}) {
    const cacheKey = `config:categories:${societyId}:${type ?? 'all'}:${opts.includeInactive ? 1 : 0}`;
    return configCache.getOrSet(cacheKey, async () => {
      const filter: Record<string, unknown> = { societyId };
      if (type) filter.type = type;
      if (!opts.includeInactive) filter.isActive = true;
      return Category.find(filter).sort({ type: 1, sortOrder: 1, name: 1 }).lean();
    });
  }

  async getById(societyId: string, id: string) {
    const doc = await Category.findOne({ _id: id, societyId }).lean();
    if (!doc) throw Errors.notFound('Category');
    return doc;
  }

  async getByKey(societyId: string, type: CategoryType, key: string) {
    const all = await this.list(societyId, type, { includeInactive: true });
    return all.find((c) => c.key === key) ?? null;
  }

  async create(societyId: string, type: CategoryType, input: { name: string; key?: string; description?: string; color?: string; icon?: string; metadata?: Record<string, unknown>; sortOrder?: number }, byUserId: string, req?: any) {
    const key = input.key ? keyFromName(input.key) : keyFromName(input.name);
    if (await Category.exists({ societyId, type, key })) throw Errors.conflict(`A ${type.toLowerCase().replace(/_/g, ' ')} with key ${key} already exists`);
    const count = await Category.countDocuments({ societyId, type });
    const doc = await Category.create({ societyId, type, key, name: input.name, description: input.description, color: input.color, icon: input.icon, metadata: input.metadata ?? {}, sortOrder: input.sortOrder ?? count, createdBy: byUserId });
    await this.invalidate(societyId);
    auditService.record({ action: 'category.created', resource: 'Category', resourceId: doc._id, societyId, newValue: { type, key, name: input.name }, req });
    return doc.toJSON();
  }

  async update(societyId: string, id: string, patch: { name?: string; description?: string; color?: string; icon?: string; metadata?: Record<string, unknown>; sortOrder?: number; isActive?: boolean }, req?: any) {
    const doc = await Category.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Category');
    const old = doc.toObject();
    if (doc.isSystem && patch.isActive === false) throw Errors.custom(400, ErrorCodes.SYSTEM_ROLE_PROTECTED, 'System categories cannot be deactivated');
    if (patch.name !== undefined) doc.name = patch.name;
    if (patch.description !== undefined) doc.description = patch.description;
    if (patch.color !== undefined) doc.color = patch.color;
    if (patch.icon !== undefined) doc.icon = patch.icon;
    if (patch.metadata !== undefined) doc.metadata = { ...(old.metadata ?? {}), ...patch.metadata };
    if (patch.sortOrder !== undefined) doc.sortOrder = patch.sortOrder;
    if (patch.isActive !== undefined) doc.isActive = patch.isActive;
    await doc.save();
    await this.invalidate(societyId);
    auditService.record({ action: 'category.updated', resource: 'Category', resourceId: doc._id, societyId, oldValue: { name: old.name, isActive: old.isActive, metadata: old.metadata }, newValue: patch, req });
    return doc.toJSON();
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await Category.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Category');
    if (doc.isSystem) throw Errors.custom(400, ErrorCodes.SYSTEM_ROLE_PROTECTED, 'System categories cannot be deleted; deactivate custom ones instead');
    // categories are referenced by business records → deactivate instead of hard delete
    doc.isActive = false;
    await doc.save();
    await this.invalidate(societyId);
    auditService.record({ action: 'category.deactivated', resource: 'Category', resourceId: doc._id, societyId, oldValue: { name: doc.name, type: doc.type }, req });
  }

  async reorder(societyId: string, type: CategoryType, orderedIds: string[]): Promise<void> {
    await Promise.all(orderedIds.map((id, i) => Category.updateOne({ _id: id, societyId, type }, { $set: { sortOrder: i } })));
    await this.invalidate(societyId);
  }

  async invalidate(societyId: string): Promise<void> {
    configCache.deletePrefix(`config:categories:${societyId}`);
    await invalidationBus.invalidate('config:categories', `${societyId}*`);
  }
}

export const categoryService = new CategoryService();

registerSocietyInitializer('categories', async ({ societyId, session }) => {
  await categoryService.ensureDefaults(societyId, session);
});
