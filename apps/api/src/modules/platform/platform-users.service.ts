import { ErrorCodes } from '@society-erp/shared';
import { User } from '../../models/user.model';
import { Role } from '../../models/role.model';
import { UserRole } from '../../models/user-role.model';
import { Session } from '../../models/session.model';
import { Errors } from '../../lib/errors';
import { hashPassword, randomCode } from '../../lib/crypto';
import { invalidationBus } from '../../lib/cache';
import { accessControlService } from '../../core/access-control/access-control.service';
import { auditService } from '../../core/audit/audit.service';

class PlatformUserService {
  async listRoles() {
    return Role.find({ scope: 'PLATFORM' }).sort({ name: 1 }).lean();
  }

  async list() {
    const roles = await this.listRoles();
    const assignments = await UserRole.find({ societyId: null, roleId: { $in: roles.map((r) => r._id) } }).lean();
    const userIds = [...new Set(assignments.map((a) => String(a.userId)))];
    const users = await User.find({ _id: { $in: userIds } }).select('name email phone status lastLoginAt createdAt').lean();
    return users.map((u) => ({
      ...u,
      id: String(u._id),
      roles: assignments.filter((a) => String(a.userId) === String(u._id)).map((a) => roles.find((r) => String(r._id) === String(a.roleId))).filter(Boolean).map((r) => ({ id: String(r!._id), key: r!.key, name: r!.name })),
    }));
  }

  private async assertNotLastSuperAdmin(userId: string): Promise<void> {
    const superRole = await Role.findOne({ scope: 'PLATFORM', key: 'SUPER_ADMIN' }).select('_id').lean();
    if (!superRole) return;
    const others = await UserRole.countDocuments({ societyId: null, roleId: superRole._id, userId: { $ne: userId } });
    if (!others) throw Errors.custom(409, ErrorCodes.LAST_ADMIN_PROTECTED, 'At least one SUPER_ADMIN must remain');
  }

  async create(input: { name: string; email: string; password?: string; roleKeys: string[] }, byUserId: string, req?: any) {
    const roles = await Role.find({ scope: 'PLATFORM', key: { $in: input.roleKeys } }).lean();
    if (roles.length !== new Set(input.roleKeys).size) throw Errors.validation({ roleKeys: ['Unknown platform role'] });
    const email = input.email.toLowerCase();
    let user = await User.findOne({ email });
    let tempPassword: string | undefined;
    if (!user) {
      const password = input.password ?? (tempPassword = `${randomCode(6)}-${randomCode(4)}`);
      user = await User.create({ name: input.name, email, passwordHash: await hashPassword(password), status: 'ACTIVE', mustChangePassword: !input.password, createdBy: byUserId, emailVerifiedAt: new Date() });
    }
    for (const r of roles) await UserRole.updateOne({ userId: user._id, roleId: r._id, societyId: null }, { $setOnInsert: { assignedBy: byUserId, assignedAt: new Date() } }, { upsert: true });
    await accessControlService.invalidateUser(String(user._id));
    auditService.record({ action: 'platform_user.created', resource: 'User', resourceId: user._id, newValue: { email, roleKeys: input.roleKeys }, req });
    return { id: String(user._id), name: user.name, email: user.email, tempPassword };
  }

  async setRoles(userId: string, roleKeys: string[], byUserId: string, req?: any) {
    const roles = await Role.find({ scope: 'PLATFORM', key: { $in: roleKeys } }).lean();
    if (roles.length !== new Set(roleKeys).size) throw Errors.validation({ roleKeys: ['Unknown platform role'] });
    if (!roleKeys.includes('SUPER_ADMIN')) await this.assertNotLastSuperAdmin(userId);
    const platformRoles = await this.listRoles();
    await UserRole.deleteMany({ userId, societyId: null, roleId: { $in: platformRoles.map((r) => r._id) } });
    for (const r of roles) await UserRole.create({ userId, roleId: r._id, societyId: null, assignedBy: byUserId });
    await accessControlService.invalidateUser(userId);
    if (!roles.length) {
      const families = await Session.distinct('familyId', { userId, isPlatform: true, revokedAt: null });
      await Session.updateMany({ userId, isPlatform: true, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'PLATFORM_ACCESS_REMOVED' } });
      for (const f of families) await invalidationBus.invalidate('access:session', f);
    }
    auditService.record({ action: 'platform_user.roles_changed', resource: 'User', resourceId: userId, newValue: { roleKeys }, req });
    return this.list();
  }
}

export const platformUserService = new PlatformUserService();
