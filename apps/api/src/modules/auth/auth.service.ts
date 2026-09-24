import dayjs from 'dayjs';
import { randomUUID } from 'node:crypto';
import { ErrorCodes, type AccessContext, type TokenPair } from '@society-erp/shared';
import { env } from '../../config/env';
import { User, type UserDoc } from '../../models/user.model';
import { Session } from '../../models/session.model';
import { Membership } from '../../models/membership.model';
import { UserRole } from '../../models/user-role.model';
import { Invitation } from '../../models/invitation.model';
import { Token } from '../../models/token.model';
import { Society } from '../../models/society.model';
import { Role } from '../../models/role.model';
import { hashPassword, verifyPassword, randomToken, sha256 } from '../../lib/crypto';
import { signAccessToken, ACCESS_TTL_SECONDS, REFRESH_TTL_MS } from '../../lib/jwt';
import { Errors } from '../../lib/errors';
import { invalidationBus } from '../../lib/cache';
import { withTransaction } from '../../lib/mongo';
import { accessControlService } from '../../core/access-control/access-control.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { auditService } from '../../core/audit/audit.service';
import { domainEvents } from '../../core/events/event-bus';

interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

interface SessionTarget {
  societyId: string | null;
  isPlatform: boolean;
}

const DUMMY_HASH = '$2a$11$CwTycUXWue0Thq9StjUM0uJ8b8Q1Vv5m4b3nQ3f6h1c0h0cW8Fv7K';

class AuthService {
  // ------------------------------------------------------------------ token issuing
  private async issueTokens(user: UserDoc, target: SessionTarget, meta: ClientMeta, familyId = randomUUID()): Promise<TokenPair & { familyId: string }> {
    const raw = randomToken(48);
    await Session.create({
      userId: user._id,
      societyId: target.societyId,
      isPlatform: target.isPlatform,
      familyId,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
      lastUsedAt: new Date(),
    });
    const accessToken = signAccessToken({ sub: String(user._id), sid: familyId, soc: target.societyId, plt: target.isPlatform, email: user.email, name: user.name });
    return { accessToken, refreshToken: raw, accessTokenExpiresIn: ACCESS_TTL_SECONDS, familyId };
  }

  private async enforceSessionLimit(userId: string): Promise<void> {
    const max = await configurationService.getPlatformSetting<number>('security.maxSessionsPerUser', 10);
    const families = await Session.aggregate([
      { $match: { userId: (await User.findById(userId).select('_id').lean())!._id, revokedAt: null, expiresAt: { $gt: new Date() } } },
      { $group: { _id: '$familyId', last: { $max: '$createdAt' } } },
      { $sort: { last: -1 } },
    ]);
    if (families.length > max) {
      const toRevoke = families.slice(max).map((f) => f._id);
      await Session.updateMany({ familyId: { $in: toRevoke } }, { $set: { revokedAt: new Date(), revokedReason: 'SESSION_LIMIT' } });
      for (const f of toRevoke) await invalidationBus.invalidate('access:session', f);
    }
  }

  private async resolveDefaultTarget(user: UserDoc, requestedSocietyId?: string): Promise<SessionTarget> {
    const platform = await accessControlService.resolvePlatformContext(String(user._id));
    const memberships = await Membership.find({ userId: user._id, status: 'ACTIVE' }).select('societyId').lean();
    if (requestedSocietyId) {
      if (!memberships.some((m) => String(m.societyId) === requestedSocietyId)) throw Errors.forbidden('You are not a member of this society', ErrorCodes.MEMBERSHIP_INACTIVE);
      return { societyId: requestedSocietyId, isPlatform: false };
    }
    if (platform) return { societyId: null, isPlatform: true };
    if (memberships.length === 1) return { societyId: String(memberships[0].societyId), isPlatform: false };
    return { societyId: null, isPlatform: false };
  }

  // ------------------------------------------------------------------ login / refresh / logout
  async login(input: { email: string; password: string; societyId?: string }, meta: ClientMeta): Promise<TokenPair & { context: AccessContext }> {
    const maintenance = await configurationService.getPlatformSetting<boolean>('platform.maintenanceMode', false);
    const user = await User.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      await verifyPassword(input.password, DUMMY_HASH); // constant-time-ish response
      throw Errors.invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw Errors.custom(423, ErrorCodes.ACCOUNT_LOCKED, `Account locked. Try again in ${Math.ceil(dayjs(user.lockedUntil).diff(dayjs(), 'minute', true))} minutes.`);
    }
    const valid = await verifyPassword(input.password, user.passwordHash ?? '');
    if (!valid) {
      user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
      if (user.failedLoginAttempts >= env.LOGIN_MAX_ATTEMPTS) {
        user.lockedUntil = dayjs().add(env.LOGIN_LOCK_MINUTES, 'minute').toDate();
        user.failedLoginAttempts = 0;
        auditService.record({ action: 'auth.locked', resource: 'User', resourceId: user._id, actor: { id: String(user._id), type: 'USER', email: user.email, name: user.name }, metadata: { ip: meta.ip } });
      }
      await user.save();
      throw Errors.invalidCredentials();
    }
    if (user.status !== 'ACTIVE') throw Errors.unauthenticated('Your account is not active', ErrorCodes.ACCOUNT_INACTIVE);
    const target = await this.resolveDefaultTarget(user, input.societyId);
    if (maintenance && !target.isPlatform) {
      const platform = await accessControlService.resolvePlatformContext(String(user._id));
      if (!platform) throw Errors.custom(503, ErrorCodes.FORBIDDEN, 'The platform is under maintenance. Please try again later.');
    }
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();
    user.lastLoginIp = meta.ip;
    await user.save();
    const tokens = await this.issueTokens(user, target, meta);
    await this.enforceSessionLimit(String(user._id));
    const context = await accessControlService.buildAccessContext(user, { societyId: target.societyId, platform: target.isPlatform });
    auditService.record({
      action: 'auth.login',
      resource: 'User',
      resourceId: user._id,
      societyId: target.societyId,
      actor: { id: String(user._id), type: target.isPlatform ? 'PLATFORM_ADMIN' : 'USER', email: user.email, name: user.name },
      metadata: { ip: meta.ip, userAgent: meta.userAgent?.slice(0, 200), platform: target.isPlatform },
    });
    return { ...tokens, context };
  }

  async refresh(rawRefreshToken: string, meta: ClientMeta): Promise<TokenPair> {
    const hash = sha256(rawRefreshToken);
    const session = await Session.findOne({ tokenHash: hash });
    if (!session) throw Errors.unauthenticated('Invalid refresh token', ErrorCodes.TOKEN_INVALID);
    if (session.revokedAt) throw Errors.unauthenticated('Session has been revoked', ErrorCodes.SESSION_REVOKED);
    if (session.usedAt) {
      // token reuse → possible theft: revoke the whole family
      await this.revokeFamily(session.familyId, 'TOKEN_REUSE');
      auditService.record({ action: 'auth.token_reuse_detected', resource: 'Session', resourceId: session._id, actor: { id: String(session.userId), type: 'USER' }, metadata: { ip: meta.ip } });
      throw Errors.unauthenticated('Refresh token reuse detected. Please sign in again.', ErrorCodes.TOKEN_REUSED);
    }
    if (session.expiresAt < new Date()) throw Errors.unauthenticated('Session expired', ErrorCodes.TOKEN_EXPIRED);
    const user = await User.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') throw Errors.unauthenticated('Account is not active', ErrorCodes.ACCOUNT_INACTIVE);
    const raw = randomToken(48);
    const newHash = sha256(raw);
    session.usedAt = new Date();
    session.replacedByHash = newHash;
    await session.save();
    await Session.create({
      userId: user._id,
      societyId: session.societyId,
      isPlatform: session.isPlatform,
      familyId: session.familyId,
      tokenHash: newHash,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
      lastUsedAt: new Date(),
    });
    const accessToken = signAccessToken({ sub: String(user._id), sid: session.familyId, soc: session.societyId ? String(session.societyId) : null, plt: session.isPlatform, email: user.email, name: user.name });
    return { accessToken, refreshToken: raw, accessTokenExpiresIn: ACCESS_TTL_SECONDS };
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await Session.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
    await invalidationBus.invalidate('access:session', familyId);
  }

  async logout(input: { refreshToken?: string; familyId?: string; userId?: string }): Promise<void> {
    let familyId = input.familyId;
    if (!familyId && input.refreshToken) {
      const s = await Session.findOne({ tokenHash: sha256(input.refreshToken) }).select('familyId userId').lean();
      if (s) familyId = s.familyId;
    }
    if (familyId) await this.revokeFamily(familyId, 'LOGOUT');
    if (input.userId) auditService.record({ action: 'auth.logout', resource: 'User', resourceId: input.userId, actor: { id: input.userId, type: 'USER' } });
  }

  /** Issues a fresh token pair bound to another society (or the platform console). */
  async switchContext(auth: Express.AuthContext, target: { societyId?: string; platform?: boolean }, meta: ClientMeta): Promise<TokenPair & { context: AccessContext }> {
    const user = await User.findById(auth.userId);
    if (!user || user.status !== 'ACTIVE') throw Errors.unauthenticated();
    let sessionTarget: SessionTarget;
    if (target.platform) {
      const platform = await accessControlService.resolvePlatformContext(auth.userId);
      if (!platform) throw Errors.forbidden('Platform access required');
      sessionTarget = { societyId: null, isPlatform: true };
    } else {
      if (!target.societyId) throw Errors.badRequest('societyId is required');
      const membership = await Membership.findOne({ userId: user._id, societyId: target.societyId, status: 'ACTIVE' }).lean();
      if (!membership) throw Errors.forbidden('You are not a member of this society', ErrorCodes.MEMBERSHIP_INACTIVE);
      sessionTarget = { societyId: target.societyId, isPlatform: false };
    }
    await this.revokeFamily(auth.sessionId, 'CONTEXT_SWITCH');
    const tokens = await this.issueTokens(user, sessionTarget, meta);
    const context = await accessControlService.buildAccessContext(user, { societyId: sessionTarget.societyId, platform: sessionTarget.isPlatform });
    return { ...tokens, context };
  }

  async me(auth: Express.AuthContext): Promise<AccessContext> {
    const user = await User.findById(auth.userId);
    if (!user) throw Errors.unauthenticated();
    return accessControlService.buildAccessContext(user, { societyId: auth.societyId, platform: auth.isPlatform });
  }

  // ------------------------------------------------------------------ sessions
  async listSessions(userId: string, currentFamily: string) {
    const rows = await Session.aggregate([
      { $match: { userId: (await User.findById(userId).select('_id').lean())!._id, revokedAt: null, expiresAt: { $gt: new Date() } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$familyId', createdAt: { $min: '$createdAt' }, lastUsedAt: { $max: '$lastUsedAt' }, ip: { $first: '$ip' }, userAgent: { $first: '$userAgent' }, societyId: { $first: '$societyId' }, isPlatform: { $first: '$isPlatform' } } },
      { $sort: { lastUsedAt: -1 } },
    ]);
    return rows.map((r) => ({ familyId: r._id, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, ip: r.ip, userAgent: r.userAgent, societyId: r.societyId, isPlatform: r.isPlatform, current: r._id === currentFamily }));
  }

  async revokeUserSession(userId: string, familyId: string): Promise<void> {
    const s = await Session.findOne({ familyId, userId }).select('_id').lean();
    if (!s) throw Errors.notFound('Session');
    await this.revokeFamily(familyId, 'USER_REVOKED');
  }

  async revokeAllSessions(userId: string, exceptFamily?: string, reason = 'USER_REVOKED_ALL'): Promise<number> {
    const filter: Record<string, unknown> = { userId, revokedAt: null };
    if (exceptFamily) filter.familyId = { $ne: exceptFamily };
    const families = await Session.distinct('familyId', filter);
    await Session.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } });
    for (const f of families) await invalidationBus.invalidate('access:session', f);
    return families.length;
  }

  // ------------------------------------------------------------------ passwords
  async changePassword(auth: Express.AuthContext, currentPassword: string, newPassword: string): Promise<void> {
    const user = await User.findById(auth.userId).select('+passwordHash');
    if (!user) throw Errors.unauthenticated();
    if (!(await verifyPassword(currentPassword, user.passwordHash ?? ''))) throw Errors.custom(400, ErrorCodes.INVALID_CREDENTIALS, 'Current password is incorrect');
    user.passwordHash = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    await user.save();
    await this.revokeAllSessions(auth.userId, auth.sessionId, 'PASSWORD_CHANGED');
    auditService.record({ action: 'auth.password_changed', resource: 'User', resourceId: user._id, actor: { id: String(user._id), type: 'USER', email: user.email, name: user.name } });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await User.findOne({ email: email.toLowerCase(), status: 'ACTIVE' });
    if (!user) return; // never reveal whether the account exists
    const minutes = await configurationService.getPlatformSetting<number>('security.passwordResetExpiryMinutes', 30);
    const raw = randomToken(32);
    await Token.create({ userId: user._id, type: 'PASSWORD_RESET', tokenHash: sha256(raw), expiresAt: dayjs().add(minutes, 'minute').toDate() });
    domainEvents.emit('auth.password_reset_requested', { userId: String(user._id), email: user.email, name: user.name, token: raw, expiresInMinutes: minutes, resetUrl: `${env.APP_URL}/reset-password?token=${raw}` });
  }

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const token = await Token.findOne({ tokenHash: sha256(rawToken), type: 'PASSWORD_RESET' });
    if (!token || token.usedAt || token.expiresAt < new Date()) throw Errors.custom(400, ErrorCodes.TOKEN_INVALID, 'This reset link is invalid or has expired');
    const user = await User.findById(token.userId).select('+passwordHash');
    if (!user) throw Errors.notFound('User');
    user.passwordHash = await hashPassword(password);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    if (user.status === 'INVITED') user.status = 'ACTIVE';
    await user.save();
    token.usedAt = new Date();
    await token.save();
    await this.revokeAllSessions(String(user._id), undefined, 'PASSWORD_RESET');
    auditService.record({ action: 'auth.password_reset', resource: 'User', resourceId: user._id, actor: { id: String(user._id), type: 'USER', email: user.email, name: user.name } });
  }

  // ------------------------------------------------------------------ invitations
  async getInvitation(rawToken: string) {
    const invite = await Invitation.findOne({ tokenHash: sha256(rawToken) }).lean();
    if (!invite) throw Errors.custom(404, ErrorCodes.TOKEN_INVALID, 'Invitation not found');
    if (invite.status !== 'PENDING' || invite.expiresAt < new Date()) throw Errors.custom(400, ErrorCodes.TOKEN_INVALID, 'This invitation is no longer valid');
    const [society, roles, existing] = await Promise.all([
      Society.findById(invite.societyId).select('name slug logoUrl').lean(),
      Role.find({ _id: { $in: invite.roleIds } }).select('name key').lean(),
      User.findOne({ email: invite.email }).select('_id name').lean(),
    ]);
    return { email: invite.email, name: invite.name, society, roles, expiresAt: invite.expiresAt, existingUser: Boolean(existing), message: invite.message };
  }

  async acceptInvitation(input: { token: string; name?: string; password: string }, meta: ClientMeta): Promise<TokenPair & { context: AccessContext }> {
    const invite = await Invitation.findOne({ tokenHash: sha256(input.token) });
    if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) throw Errors.custom(400, ErrorCodes.TOKEN_INVALID, 'This invitation is no longer valid');
    const society = await Society.findById(invite.societyId).lean();
    if (!society || society.status !== 'ACTIVE') throw Errors.forbidden('This society is not accepting members right now');

    const user = await withTransaction(async (session) => {
      let u = await User.findOne({ email: invite.email }).select('+passwordHash').session(session ?? null);
      if (!u) {
        const [createdUser] = await User.create([{ name: input.name ?? invite.name ?? invite.email.split('@')[0], email: invite.email, phone: invite.phone, passwordHash: await hashPassword(input.password), status: 'ACTIVE', invitedBy: invite.invitedBy, emailVerifiedAt: new Date() }], { session });
        u = createdUser;
      } else {
        if (!u.passwordHash || u.status === 'INVITED') {
          u.passwordHash = await hashPassword(input.password);
          u.status = 'ACTIVE';
          if (input.name) u.name = input.name;
          await u.save({ session });
        } else if (!(await verifyPassword(input.password, u.passwordHash))) {
          throw Errors.custom(400, ErrorCodes.INVALID_CREDENTIALS, 'An account already exists for this email. Enter your existing password to accept the invitation.');
        }
      }
      await Membership.updateOne(
        { userId: u._id, societyId: invite.societyId },
        { $set: { status: 'ACTIVE', residentId: invite.residentId ?? null, invitedBy: invite.invitedBy, joinedAt: new Date(), deactivatedAt: null } },
        { upsert: true, session: session ?? undefined },
      );
      for (const roleId of invite.roleIds) {
        await UserRole.updateOne({ userId: u._id, roleId, societyId: invite.societyId }, { $setOnInsert: { assignedBy: invite.invitedBy, assignedAt: new Date() } }, { upsert: true, session: session ?? undefined });
      }
      if (invite.residentId) {
        const { mongoose } = await import('../../lib/mongo');
        if (mongoose.modelNames().includes('Resident')) {
          await mongoose.model('Resident').updateOne({ _id: invite.residentId, societyId: invite.societyId }, { $set: { userId: u._id, email: u.email } }, { session: session ?? undefined });
        }
      }
      invite.status = 'ACCEPTED';
      invite.acceptedAt = new Date();
      invite.acceptedUserId = u._id;
      await invite.save({ session });
      return u;
    });

    await accessControlService.invalidateUser(String(user._id));
    auditService.record({ action: 'user.invitation_accepted', resource: 'Invitation', resourceId: invite._id, societyId: String(invite.societyId), actor: { id: String(user._id), type: 'USER', email: user.email, name: user.name } });
    domainEvents.emit('user.joined', { userId: String(user._id), societyId: String(invite.societyId), invitedBy: String(invite.invitedBy) }, { societyId: String(invite.societyId), actorId: String(user._id) });
    const tokens = await this.issueTokens(user, { societyId: String(invite.societyId), isPlatform: false }, meta);
    const context = await accessControlService.buildAccessContext(user, { societyId: String(invite.societyId), platform: false });
    return { ...tokens, context };
  }

  // ------------------------------------------------------------------ profile
  async updateProfile(userId: string, input: { name?: string; phone?: string; avatarUrl?: string; preferences?: Record<string, unknown> }) {
    const user = await User.findById(userId);
    if (!user) throw Errors.notFound('User');
    if (input.name) user.name = input.name;
    if (input.phone !== undefined) user.phone = input.phone || undefined;
    if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl || undefined;
    if (input.preferences) user.set('preferences', { ...user.toObject().preferences, ...input.preferences, channels: { ...user.toObject().preferences?.channels, ...((input.preferences as any).channels ?? {}) } });
    await user.save();
    await accessControlService.invalidateUser(userId);
    return accessControlService.buildAuthUser(user, { isPlatformAdmin: Boolean(await accessControlService.resolvePlatformContext(userId)) });
  }

  async addPushSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string): Promise<void> {
    await User.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } });
    await User.updateOne({ _id: userId }, { $push: { pushSubscriptions: { ...sub, userAgent: userAgent?.slice(0, 200), createdAt: new Date() } } });
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<void> {
    await User.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint } } });
  }
}

export const authService = new AuthService();
