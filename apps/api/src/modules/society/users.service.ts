import dayjs from 'dayjs';
import mongoose from 'mongoose';
import { ErrorCodes } from '@society-erp/shared';
import { env } from '../../config/env';
import { User } from '../../models/user.model';
import { Role } from '../../models/role.model';
import { Membership } from '../../models/membership.model';
import { UserRole } from '../../models/user-role.model';
import { Invitation } from '../../models/invitation.model';
import { Session } from '../../models/session.model';
import { Society } from '../../models/society.model';
import { AuditLog } from '../../models/audit-log.model';
import { Errors } from '../../lib/errors';
import { hashPassword, randomCode, randomToken, sha256 } from '../../lib/crypto';
import { paginateAggregate } from '../../lib/pagination';
import { invalidationBus } from '../../lib/cache';
import { withTransaction } from '../../lib/mongo';
import { accessControlService } from '../../core/access-control/access-control.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { limitService } from '../../core/limits/limit.service';
import { auditService } from '../../core/audit/audit.service';
import { domainEvents } from '../../core/events/event-bus';

class SocietyUserService {
  // ------------------------------------------------------------------ helpers
  private async adminRoleIds(societyId: string) {
    const roles = await Role.find({ societyId, grantsAllPermissions: true, status: 'ACTIVE' }).select('_id').lean();
    return roles.map((r) => r._id);
  }

  /** Throws when removing admin access from `userId` would leave the society without any active admin. */
  async assertNotLastAdmin(societyId: string, userId: string): Promise<void> {
    const adminRoles = await this.adminRoleIds(societyId);
    const holders = await UserRole.find({ societyId, roleId: { $in: adminRoles }, userId: { $ne: userId } }).select('userId').lean();
    if (!holders.length) throw Errors.custom(409, ErrorCodes.LAST_ADMIN_PROTECTED, 'This is the last active administrator of the society. Assign another administrator first.');
    const active = await Membership.countDocuments({ societyId, status: 'ACTIVE', userId: { $in: holders.map((h) => h.userId) } });
    if (!active) throw Errors.custom(409, ErrorCodes.LAST_ADMIN_PROTECTED, 'This is the last active administrator of the society. Assign another administrator first.');
  }

  private async validateRoles(societyId: string, roleIds: string[]) {
    const unique = [...new Set(roleIds)];
    const roles = await Role.find({ _id: { $in: unique }, societyId, status: 'ACTIVE' }).lean();
    if (roles.length !== unique.length) throw Errors.validation({ roleIds: ['One or more roles are invalid for this society'] });
    return roles;
  }

  private async revokeSocietySessions(userId: string, societyId: string, reason: string): Promise<void> {
    const families = await Session.distinct('familyId', { userId, societyId, revokedAt: null });
    await Session.updateMany({ userId, societyId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
    for (const f of families) await invalidationBus.invalidate('access:session', f);
  }

  // ------------------------------------------------------------------ listing
  async list(societyId: string, query: { page?: number; limit?: number; search?: string; roleId?: string; status?: string }) {
    const match: Record<string, unknown> = { societyId: new mongoose.Types.ObjectId(societyId) };
    if (query.status) match.status = query.status;
    const pipeline: mongoose.PipelineStage[] = [
      { $match: match },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', pipeline: [{ $project: { name: 1, email: 1, phone: 1, status: 1, avatarUrl: 1, lastLoginAt: 1 } }], as: 'user' } },
      { $unwind: '$user' },
      { $lookup: { from: 'userroles', let: { uid: '$userId', sid: '$societyId' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$userId', '$$uid'] }, { $eq: ['$societyId', '$$sid'] }] } } }], as: 'assignments' } },
      { $lookup: { from: 'roles', localField: 'assignments.roleId', foreignField: '_id', pipeline: [{ $project: { key: 1, name: 1, color: 1, landing: 1, grantsAllPermissions: 1 } }], as: 'roles' } },
    ];
    if (query.roleId) pipeline.push({ $match: { 'roles._id': new mongoose.Types.ObjectId(query.roleId) } });
    if (query.search) {
      const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      pipeline.push({ $match: { $or: [{ 'user.name': rx }, { 'user.email': rx }, { 'user.phone': rx }] } });
    }
    pipeline.push({ $project: { assignments: 0 } });
    return paginateAggregate(Membership as any, pipeline, { page: query.page, limit: query.limit, sort: { 'user.name': 1 } });
  }

  async get(societyId: string, userId: string) {
    const membership = await Membership.findOne({ societyId, userId }).lean();
    if (!membership) throw Errors.notFound('User');
    const [user, assignments, tenant, sessions, activity] = await Promise.all([
      User.findById(userId).select('name email phone status avatarUrl lastLoginAt lastLoginIp createdAt mustChangePassword preferences').lean(),
      UserRole.find({ societyId, userId }).populate('roleId', 'key name color landing grantsAllPermissions permissions').lean(),
      accessControlService.resolveTenantContext(userId, societyId),
      Session.find({ userId, societyId }).sort({ createdAt: -1 }).limit(20).select('createdAt lastUsedAt ip userAgent revokedAt revokedReason familyId').lean(),
      AuditLog.find({ actorId: userId, societyId }).sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    if (!user) throw Errors.notFound('User');
    return {
      user: { ...user, id: String(user._id) },
      membership: { ...membership, id: String(membership._id) },
      roles: assignments.map((a: any) => a.roleId).filter(Boolean),
      directPermissions: membership.directPermissions,
      effectivePermissions: tenant ? accessControlService.getEffectivePermissions(tenant) : [],
      accessibleModules: tenant ? [...tenant.accessibleModules] : [],
      loginHistory: sessions,
      activity,
    };
  }

  // ------------------------------------------------------------------ create / invite
  async create(
    societyId: string,
    input: { name: string; email: string; phone?: string; password?: string; roleIds: string[]; residentId?: string; label?: string },
    byUserId: string,
    req?: any,
  ) {
    await limitService.assertWithinLimit(societyId, 'maxUsers');
    const roles = await this.validateRoles(societyId, input.roleIds);
    if (roles.some((r) => r.grantsAllPermissions)) await limitService.assertWithinLimit(societyId, 'maxAdmins');
    const email = input.email.toLowerCase();
    let tempPassword: string | undefined;
    const user = await withTransaction(async (session) => {
      let u = await User.findOne({ email }).session(session ?? null);
      if (u) {
        const existingMembership = await Membership.findOne({ societyId, userId: u._id }).session(session ?? null);
        if (existingMembership?.status === 'ACTIVE') throw Errors.conflict('This user is already a member of the society');
      } else {
        const password = input.password ?? (tempPassword = `${randomCode(6)}-${randomCode(4)}`);
        const [created] = await User.create([{ name: input.name, email, phone: input.phone, passwordHash: await hashPassword(password), status: 'ACTIVE', mustChangePassword: !input.password, createdBy: byUserId }], { session });
        u = created;
      }
      await Membership.updateOne(
        { societyId, userId: u._id },
        { $set: { status: 'ACTIVE', residentId: input.residentId ?? null, label: input.label, invitedBy: byUserId, joinedAt: new Date(), deactivatedAt: null } },
        { upsert: true, session: session ?? undefined },
      );
      await UserRole.deleteMany({ societyId, userId: u._id }).session(session ?? null);
      await UserRole.create(input.roleIds.map((roleId) => ({ userId: u!._id, roleId, societyId, assignedBy: byUserId })), { session, ordered: true });
      return u;
    });
    await accessControlService.invalidateUser(String(user._id));
    auditService.record({ action: 'user.created', resource: 'User', resourceId: user._id, societyId, newValue: { email, roleIds: input.roleIds, residentId: input.residentId }, req });
    domainEvents.emit('user.created', { userId: String(user._id), societyId, email, tempPassword }, { societyId, actorId: byUserId });
    return { user: { id: String(user._id), name: user.name, email: user.email }, tempPassword };
  }

  async invite(societyId: string, input: { email: string; name?: string; phone?: string; roleIds: string[]; residentId?: string; unitId?: string; message?: string }, byUserId: string, req?: any) {
    await limitService.assertWithinLimit(societyId, 'maxUsers');
    const roles = await this.validateRoles(societyId, input.roleIds);
    const email = input.email.toLowerCase();
    const existingUser = await User.findOne({ email }).select('_id').lean();
    if (existingUser) {
      const m = await Membership.findOne({ societyId, userId: existingUser._id, status: 'ACTIVE' }).lean();
      if (m) throw Errors.conflict('This user is already a member of the society');
    }
    await Invitation.updateMany({ societyId, email, status: 'PENDING' }, { $set: { status: 'REVOKED' } });
    const days = await configurationService.getPlatformSetting<number>('security.inviteExpiryDays', 7);
    const raw = randomToken(32);
    const invite = await Invitation.create({
      societyId,
      email,
      name: input.name,
      phone: input.phone,
      roleIds: input.roleIds,
      residentId: input.residentId ?? null,
      unitId: input.unitId ?? null,
      message: input.message,
      tokenHash: sha256(raw),
      expiresAt: dayjs().add(days, 'day').toDate(),
      invitedBy: byUserId,
    });
    const [society, inviter] = await Promise.all([Society.findById(societyId).select('name').lean(), User.findById(byUserId).select('name').lean()]);
    const inviteUrl = `${env.APP_URL}/accept-invite?token=${raw}`;
    domainEvents.emit('user.invited', { invitationId: String(invite._id), societyId, email, name: input.name ?? email.split('@')[0], inviterName: inviter?.name, societyName: society?.name, roles: roles.map((r) => r.name).join(', '), inviteUrl, expiresAt: invite.expiresAt, message: input.message }, { societyId, actorId: byUserId });
    auditService.record({ action: 'user.invited', resource: 'Invitation', resourceId: invite._id, societyId, newValue: { email, roleIds: input.roleIds, residentId: input.residentId }, req });
    return { ...invite.toJSON(), inviteUrl: env.NODE_ENV === 'production' ? undefined : inviteUrl };
  }

  async listInvitations(societyId: string, status?: string) {
    const filter: Record<string, unknown> = { societyId };
    if (status) filter.status = status;
    await Invitation.updateMany({ societyId, status: 'PENDING', expiresAt: { $lt: new Date() } }, { $set: { status: 'EXPIRED' } });
    return Invitation.find(filter).sort({ createdAt: -1 }).populate('roleIds', 'name key color').populate('invitedBy', 'name').lean();
  }

  async resendInvitation(societyId: string, invitationId: string, byUserId: string, req?: any) {
    const invite = await Invitation.findOne({ _id: invitationId, societyId });
    if (!invite) throw Errors.notFound('Invitation');
    if (invite.status === 'ACCEPTED') throw Errors.conflict('Invitation already accepted');
    const days = await configurationService.getPlatformSetting<number>('security.inviteExpiryDays', 7);
    const raw = randomToken(32);
    invite.tokenHash = sha256(raw);
    invite.expiresAt = dayjs().add(days, 'day').toDate();
    invite.status = 'PENDING';
    invite.lastSentAt = new Date();
    await invite.save();
    const [society, inviter, roles] = await Promise.all([Society.findById(societyId).select('name').lean(), User.findById(byUserId).select('name').lean(), Role.find({ _id: { $in: invite.roleIds } }).select('name').lean()]);
    const inviteUrl = `${env.APP_URL}/accept-invite?token=${raw}`;
    domainEvents.emit('user.invited', { invitationId: String(invite._id), societyId, email: invite.email, name: invite.name ?? invite.email.split('@')[0], inviterName: inviter?.name, societyName: society?.name, roles: roles.map((r) => r.name).join(', '), inviteUrl, expiresAt: invite.expiresAt, message: invite.message }, { societyId, actorId: byUserId });
    auditService.record({ action: 'user.invitation_resent', resource: 'Invitation', resourceId: invite._id, societyId, req });
    return { ...invite.toJSON(), inviteUrl: env.NODE_ENV === 'production' ? undefined : inviteUrl };
  }

  async revokeInvitation(societyId: string, invitationId: string, req?: any): Promise<void> {
    const invite = await Invitation.findOne({ _id: invitationId, societyId });
    if (!invite) throw Errors.notFound('Invitation');
    if (invite.status === 'ACCEPTED') throw Errors.conflict('Invitation already accepted');
    invite.status = 'REVOKED';
    await invite.save();
    auditService.record({ action: 'user.invitation_revoked', resource: 'Invitation', resourceId: invite._id, societyId, req });
  }

  // ------------------------------------------------------------------ updates
  async update(societyId: string, userId: string, patch: { name?: string; phone?: string; label?: string }, req?: any) {
    const membership = await Membership.findOne({ societyId, userId });
    if (!membership) throw Errors.notFound('User');
    const user = await User.findById(userId);
    if (!user) throw Errors.notFound('User');
    const old = { name: user.name, phone: user.phone, label: membership.label };
    if (patch.name !== undefined) user.name = patch.name;
    if (patch.phone !== undefined) user.phone = patch.phone || undefined;
    if (patch.label !== undefined) membership.label = patch.label;
    await Promise.all([user.save(), membership.save()]);
    await accessControlService.invalidateUser(userId);
    auditService.record({ action: 'user.updated', resource: 'User', resourceId: userId, societyId, oldValue: old, newValue: patch, req });
    return this.get(societyId, userId);
  }

  async setStatus(societyId: string, userId: string, status: 'ACTIVE' | 'INACTIVE', byUserId: string, req?: any) {
    const membership = await Membership.findOne({ societyId, userId });
    if (!membership) throw Errors.notFound('User');
    if (status === 'INACTIVE') {
      if (userId === byUserId) throw Errors.custom(400, ErrorCodes.SELF_ACTION_NOT_ALLOWED, 'You cannot deactivate your own access');
      await this.assertNotLastAdmin(societyId, userId);
      membership.status = 'INACTIVE';
      membership.deactivatedAt = new Date();
      membership.deactivatedBy = byUserId as any;
      await membership.save();
      await this.revokeSocietySessions(userId, societyId, 'MEMBERSHIP_DEACTIVATED');
    } else {
      await limitService.assertWithinLimit(societyId, 'maxUsers');
      membership.status = 'ACTIVE';
      membership.deactivatedAt = undefined;
      await membership.save();
    }
    await accessControlService.invalidateUser(userId);
    auditService.record({ action: status === 'ACTIVE' ? 'user.reactivated' : 'user.deactivated', resource: 'Membership', resourceId: membership._id, societyId, newValue: { userId, status }, req });
    return this.get(societyId, userId);
  }

  async assignRoles(societyId: string, userId: string, roleIds: string[], byUserId: string, req?: any) {
    const membership = await Membership.findOne({ societyId, userId }).lean();
    if (!membership) throw Errors.notFound('User');
    const roles = await this.validateRoles(societyId, roleIds);
    const current = await UserRole.find({ societyId, userId }).lean();
    const adminRoles = new Set((await this.adminRoleIds(societyId)).map(String));
    const hadAdmin = current.some((c) => adminRoles.has(String(c.roleId)));
    const willHaveAdmin = roleIds.some((r) => adminRoles.has(String(r)));
    if (hadAdmin && !willHaveAdmin) await this.assertNotLastAdmin(societyId, userId);
    if (!hadAdmin && willHaveAdmin) await limitService.assertWithinLimit(societyId, 'maxAdmins');
    await withTransaction(async (session) => {
      await UserRole.deleteMany({ societyId, userId }).session(session ?? null);
      if (roleIds.length) await UserRole.create(roleIds.map((roleId) => ({ userId, roleId, societyId, assignedBy: byUserId })), { session, ordered: true });
    });
    await accessControlService.invalidateUser(userId);
    auditService.record({ action: 'user.roles_changed', resource: 'User', resourceId: userId, societyId, oldValue: { roleIds: current.map((c) => String(c.roleId)) }, newValue: { roleIds, roleKeys: roles.map((r) => r.key) }, req });
    return this.get(societyId, userId);
  }

  async setDirectPermissions(societyId: string, userId: string, input: { allow: string[]; deny: string[] }, req?: any) {
    const membership = await Membership.findOne({ societyId, userId });
    if (!membership) throw Errors.notFound('User');
    const old = membership.toObject().directPermissions;
    membership.set('directPermissions', { allow: [...new Set(input.allow)], deny: [...new Set(input.deny)] });
    await membership.save();
    await accessControlService.invalidateUser(userId);
    auditService.record({ action: 'user.permissions_changed', resource: 'User', resourceId: userId, societyId, oldValue: old, newValue: input, req });
    return this.get(societyId, userId);
  }

  async revokeSessions(societyId: string, userId: string, req?: any): Promise<void> {
    await this.revokeSocietySessions(userId, societyId, 'ADMIN_REVOKED');
    auditService.record({ action: 'user.sessions_revoked', resource: 'User', resourceId: userId, societyId, req });
  }

  async resetPassword(societyId: string, userId: string, byUserId: string, req?: any): Promise<{ tempPassword: string }> {
    const membership = await Membership.findOne({ societyId, userId }).lean();
    if (!membership) throw Errors.notFound('User');
    if (userId === byUserId) throw Errors.custom(400, ErrorCodes.SELF_ACTION_NOT_ALLOWED, 'Use change password for your own account');
    const user = await User.findById(userId).select('+passwordHash');
    if (!user) throw Errors.notFound('User');
    const tempPassword = `${randomCode(6)}-${randomCode(4)}`;
    user.passwordHash = await hashPassword(tempPassword);
    user.mustChangePassword = true;
    user.passwordChangedAt = new Date();
    await user.save();
    const families = await Session.distinct('familyId', { userId, revokedAt: null });
    await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'ADMIN_PASSWORD_RESET' } });
    for (const f of families) await invalidationBus.invalidate('access:session', f);
    auditService.record({ action: 'user.password_reset_by_admin', resource: 'User', resourceId: userId, societyId, req });
    return { tempPassword };
  }
}

export const societyUserService = new SocietyUserService();
