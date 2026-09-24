import { ErrorCodes, type RoleLanding } from '@society-erp/shared';
import { Role, type RoleDoc } from '../../models/role.model';
import { UserRole } from '../../models/user-role.model';
import { Permission } from '../../models/permission.model';
import { Errors } from '../../lib/errors';
import { accessControlService } from '../../core/access-control/access-control.service';
import { moduleEngine } from '../../core/modules/module-engine.service';
import { auditService } from '../../core/audit/audit.service';

function keyFromName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'ROLE';
}

export interface RoleInput {
  name: string;
  key?: string;
  description?: string;
  permissions: string[];
  landing?: RoleLanding;
  color?: string;
}

class SocietyRoleService {
  private async validatePermissions(permissions: string[]): Promise<string[]> {
    const unique = [...new Set(permissions)];
    if (!unique.length) return [];
    const known = await Permission.find({ key: { $in: unique }, scope: 'SOCIETY' }).select('key').lean();
    const knownSet = new Set(known.map((p) => p.key));
    const unknown = unique.filter((p) => !knownSet.has(p));
    if (unknown.length) throw Errors.validation({ permissions: [`Unknown permissions: ${unknown.join(', ')}`] });
    return unique;
  }

  async list(societyId: string) {
    const roles = await Role.find({ societyId }).sort({ isSystem: -1, name: 1 }).lean();
    const counts = await UserRole.aggregate([{ $match: { societyId: roles[0]?.societyId ?? null } }, { $group: { _id: '$roleId', count: { $sum: 1 } } }]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return roles.map((r) => ({ ...r, id: String(r._id), memberCount: countMap.get(String(r._id)) ?? 0 }));
  }

  async get(societyId: string, roleId: string): Promise<RoleDoc> {
    const role = await Role.findOne({ _id: roleId, societyId });
    if (!role) throw Errors.notFound('Role');
    return role;
  }

  /** Permission catalogue grouped by module, annotated with module accessibility for the role editor. */
  async permissionCatalog(societyId: string) {
    const [states, permissions] = await Promise.all([moduleEngine.getSocietyModuleStates(societyId), Permission.find({ scope: 'SOCIETY' }).sort({ module: 1, action: 1 }).lean()]);
    return states.map((s) => ({
      module: s.key,
      name: s.name,
      description: s.description,
      icon: s.icon,
      category: s.category,
      accessible: s.accessible,
      inPlan: s.inPlan,
      enabledBySociety: s.enabledBySociety,
      permissions: permissions.filter((p) => p.module === s.key).map((p) => ({ key: p.key, action: p.action, label: p.label, description: p.description, ownScope: p.ownScope })),
    }));
  }

  async create(societyId: string, input: RoleInput, byUserId: string, req?: any) {
    const key = keyFromName(input.key ?? input.name);
    if (await Role.exists({ societyId, key })) throw Errors.conflict(`A role with key ${key} already exists`);
    const permissions = await this.validatePermissions(input.permissions);
    const role = await Role.create({ societyId, scope: 'SOCIETY', key, name: input.name, description: input.description, permissions, landing: input.landing ?? 'ADMIN', color: input.color ?? 'slate', isSystem: false, createdBy: byUserId });
    auditService.record({ action: 'role.created', resource: 'Role', resourceId: role._id, societyId, newValue: { key, name: input.name, permissions, landing: role.landing }, req });
    return role.toJSON();
  }

  async update(societyId: string, roleId: string, patch: Partial<RoleInput> & { status?: 'ACTIVE' | 'INACTIVE' }, byUserId: string, req?: any) {
    const role = await this.get(societyId, roleId);
    const old = role.toObject();
    if (role.grantsAllPermissions && (patch.permissions !== undefined || patch.status === 'INACTIVE' || (patch.landing && patch.landing !== role.landing))) {
      throw Errors.custom(400, ErrorCodes.SYSTEM_ROLE_PROTECTED, 'The Society Admin role always holds every permission of the accessible modules and cannot be restricted');
    }
    if (patch.name !== undefined) role.name = patch.name;
    if (patch.description !== undefined) role.description = patch.description;
    if (patch.color !== undefined) role.color = patch.color;
    if (patch.landing !== undefined) role.landing = patch.landing;
    if (patch.status !== undefined) {
      if (role.isSystem && patch.status === 'INACTIVE') throw Errors.custom(400, ErrorCodes.SYSTEM_ROLE_PROTECTED, 'System roles cannot be deactivated');
      role.status = patch.status;
    }
    if (patch.permissions !== undefined) role.permissions = await this.validatePermissions(patch.permissions);
    role.updatedBy = byUserId as any;
    await role.save();
    await accessControlService.invalidateSociety(societyId);
    auditService.record({ action: 'role.updated', resource: 'Role', resourceId: role._id, societyId, oldValue: { name: old.name, permissions: old.permissions, landing: old.landing, status: old.status }, newValue: patch, req });
    return role.toJSON();
  }

  async remove(societyId: string, roleId: string, opts: { reassignToRoleId?: string }, req?: any): Promise<void> {
    const role = await this.get(societyId, roleId);
    if (role.isSystem) throw Errors.custom(400, ErrorCodes.SYSTEM_ROLE_PROTECTED, 'System roles cannot be deleted');
    const assignments = await UserRole.find({ societyId, roleId }).lean();
    if (assignments.length) {
      if (!opts.reassignToRoleId) throw Errors.conflict(`${assignments.length} user(s) hold this role. Reassign them to another role first.`, { memberCount: assignments.length });
      const target = await this.get(societyId, opts.reassignToRoleId);
      for (const a of assignments) {
        await UserRole.updateOne({ userId: a.userId, roleId: target._id, societyId }, { $setOnInsert: { assignedAt: new Date(), assignedBy: a.assignedBy } }, { upsert: true });
      }
      await UserRole.deleteMany({ societyId, roleId });
    }
    await role.deleteOne();
    await accessControlService.invalidateSociety(societyId);
    auditService.record({ action: 'role.deleted', resource: 'Role', resourceId: roleId, societyId, oldValue: { key: role.key, name: role.name, permissions: role.permissions }, newValue: { reassignedTo: opts.reassignToRoleId }, req });
  }

  async clone(societyId: string, roleId: string, name: string, byUserId: string, req?: any) {
    const role = await this.get(societyId, roleId);
    return this.create(societyId, { name, description: role.description ?? undefined, permissions: role.grantsAllPermissions ? [] : role.permissions, landing: role.landing as RoleLanding, color: role.color }, byUserId, req);
  }
}

export const societyRoleService = new SocietyRoleService();
