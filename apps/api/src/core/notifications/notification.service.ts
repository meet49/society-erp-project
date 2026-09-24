import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { hasPermission, type NotificationChannel } from '@society-erp/shared';
import { env } from '../../config/env';
import { Notification } from '../../models/notification.model';
import { NotificationTemplate } from '../../models/notification-template.model';
import { User } from '../../models/user.model';
import { Membership } from '../../models/membership.model';
import { UserRole } from '../../models/user-role.model';
import { Role } from '../../models/role.model';
import { Society } from '../../models/society.model';
import { paginate } from '../../lib/pagination';
import { logger } from '../../lib/logger';
import { configCache } from '../../lib/cache';
import { configurationService } from '../configuration/configuration.service';
import { realtime } from '../realtime/socket';
import { jobQueue } from '../jobs/queue';
import { JobNames } from '../jobs/scheduler';
import { renderTemplate, htmlToText, wrapEmailLayout } from './render';
import { emailProvider } from './providers/email.provider';
import { whatsappProvider } from './providers/whatsapp.provider';
import { pushProvider } from './providers/push.provider';

export interface RecipientSpec {
  userIds?: string[];
  roleKeys?: string[];
  permission?: string | string[];
  unitIds?: string[];
  residentIds?: string[];
  all?: boolean;
  platformAdmins?: boolean;
  excludeUserIds?: string[];
}

export interface NotifyInput {
  societyId?: string | null;
  recipients: RecipientSpec | string[];
  type: string;
  title?: string;
  body?: string;
  vars?: Record<string, unknown>;
  data?: Record<string, unknown>;
  link?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  channels?: NotificationChannel[];
  socketEvent?: string;
}

type TemplateDoc = { key: string; channel: string; subject?: string | null; body: string; enabled: boolean; societyId?: unknown };

class NotificationService {
  // ------------------------------------------------------------------ templates
  private async getTemplate(societyId: string | null | undefined, key: string, channel: NotificationChannel): Promise<TemplateDoc | null> {
    const all = await configCache.getOrSet(`config:templates:${societyId ?? 'platform'}`, async () => {
      const filter = societyId ? { $or: [{ societyId: null }, { societyId }] } : { societyId: null };
      return NotificationTemplate.find(filter).lean() as Promise<TemplateDoc[]>;
    });
    const own = all.find((t) => t.key === key && t.channel === channel && t.societyId && String(t.societyId) === String(societyId));
    const base = all.find((t) => t.key === key && t.channel === channel && !t.societyId);
    return own ?? base ?? null;
  }

  private async brandVars(societyId?: string | null): Promise<Record<string, unknown>> {
    const brandName = await configurationService.getPlatformSetting<string>('brand.name', 'Society ERP');
    const primaryColor = await configurationService.getPlatformSetting<string>('brand.primaryColor', '#4f46e5');
    const society = societyId ? await Society.findById(societyId).select('name').lean() : null;
    return { brandName, primaryColor, appUrl: env.APP_URL, societyName: society?.name };
  }

  // ------------------------------------------------------------------ recipients
  async resolveRecipients(societyId: string | null | undefined, spec: RecipientSpec | string[]): Promise<string[]> {
    if (Array.isArray(spec)) return [...new Set(spec.map(String))];
    const ids = new Set<string>();
    (spec.userIds ?? []).forEach((u) => ids.add(String(u)));
    if (spec.platformAdmins) {
      const roles = await Role.find({ scope: 'PLATFORM', status: 'ACTIVE' }).select('_id').lean();
      const assignments = await UserRole.find({ roleId: { $in: roles.map((r) => r._id) }, societyId: null }).select('userId').lean();
      assignments.forEach((a) => ids.add(String(a.userId)));
    }
    if (societyId) {
      if (spec.all) {
        const members = await Membership.find({ societyId, status: 'ACTIVE' }).select('userId').lean();
        members.forEach((m) => ids.add(String(m.userId)));
      }
      if (spec.roleKeys?.length) {
        const roles = await Role.find({ societyId, key: { $in: spec.roleKeys }, status: 'ACTIVE' }).select('_id').lean();
        const assignments = await UserRole.find({ societyId, roleId: { $in: roles.map((r) => r._id) } }).select('userId').lean();
        assignments.forEach((a) => ids.add(String(a.userId)));
      }
      if (spec.permission) {
        const roles = await Role.find({ societyId, status: 'ACTIVE' }).lean();
        const matching = roles.filter((r) => r.grantsAllPermissions || hasPermission(r.permissions, spec.permission!));
        const assignments = await UserRole.find({ societyId, roleId: { $in: matching.map((r) => r._id) } }).select('userId').lean();
        assignments.forEach((a) => ids.add(String(a.userId)));
      }
      if ((spec.unitIds?.length || spec.residentIds?.length) && mongoose.modelNames().includes('Resident')) {
        const Resident = mongoose.model('Resident');
        const or: Record<string, unknown>[] = [];
        if (spec.unitIds?.length) or.push({ unitId: { $in: spec.unitIds } }, { unitIds: { $in: spec.unitIds } });
        if (spec.residentIds?.length) or.push({ _id: { $in: spec.residentIds } });
        const residents = await Resident.find({ societyId, status: { $ne: 'MOVED_OUT' }, userId: { $ne: null }, $or: or }).select('userId').lean();
        residents.forEach((r: any) => ids.add(String(r.userId)));
      }
      if (ids.size) {
        // only active members receive society notifications
        const active = await Membership.find({ societyId, userId: { $in: [...ids] }, status: 'ACTIVE' }).select('userId').lean();
        const activeSet = new Set(active.map((m) => String(m.userId)));
        for (const id of [...ids]) if (!activeSet.has(id) && !(spec.platformAdmins || spec.userIds?.includes(id))) ids.delete(id);
      }
    }
    (spec.excludeUserIds ?? []).forEach((u) => ids.delete(String(u)));
    return [...ids];
  }

  // ------------------------------------------------------------------ channels
  private async channelsFor(societyId: string | null | undefined, type: string, override?: NotificationChannel[]): Promise<NotificationChannel[]> {
    if (override) return override;
    if (!societyId) {
      const defaults = await configurationService.getPlatformSetting<Record<string, boolean>>('notifications.defaultChannels', { IN_APP: true, EMAIL: true, WHATSAPP: false, PUSH: true });
      return (Object.keys(defaults) as NotificationChannel[]).filter((c) => defaults[c]);
    }
    const cfg = await configurationService.getSocietySetting<{ IN_APP: boolean; EMAIL: boolean; WHATSAPP: boolean; PUSH: boolean; events: Record<string, NotificationChannel[]> }>(societyId, 'notifications.channels');
    if (cfg.events?.[type]) return cfg.events[type];
    return (['IN_APP', 'EMAIL', 'WHATSAPP', 'PUSH'] as NotificationChannel[]).filter((c) => cfg[c]);
  }

  // ------------------------------------------------------------------ notify
  /** Creates DB notifications (source of truth), pushes them over sockets and queues channel deliveries. */
  async notify(input: NotifyInput): Promise<number> {
    const recipients = await this.resolveRecipients(input.societyId, input.recipients);
    if (!recipients.length) return 0;
    const brand = await this.brandVars(input.societyId);
    const vars = { ...brand, ...(input.vars ?? {}) };
    const inApp = await this.getTemplate(input.societyId, input.type, 'IN_APP');
    const title = input.title ?? (inApp?.subject ? renderTemplate(inApp.subject, vars) : input.type);
    const body = input.body ?? (inApp ? renderTemplate(inApp.body, vars) : '');
    const channels = await this.channelsFor(input.societyId, input.type, input.channels);
    const externalChannels = channels.filter((c) => c !== 'IN_APP');

    const docs = await Notification.insertMany(
      recipients.map((userId) => ({
        societyId: input.societyId ?? null,
        userId,
        type: input.type,
        title,
        body,
        data: { ...(input.data ?? {}), vars: input.vars ?? {} },
        link: input.link,
        priority: input.priority ?? 'NORMAL',
        channels: externalChannels.map((channel) => ({ channel, status: 'PENDING' })),
      })),
    );

    for (const doc of docs) {
      const payload = { id: String(doc._id), type: doc.type, title: doc.title, body: doc.body, link: doc.link, data: doc.data, priority: doc.priority, createdAt: doc.createdAt, readAt: null };
      realtime.toUser(String(doc.userId), 'notification', payload);
      if (input.socketEvent) realtime.toUser(String(doc.userId), input.socketEvent, payload);
      for (const channel of externalChannels) {
        await jobQueue.add(JobNames.NOTIFICATION_DELIVER, { notificationId: String(doc._id), channel }, { jobId: `notify:${doc._id}:${channel}` });
      }
    }
    return docs.length;
  }

  /** Job handler: deliver one notification over one channel. Idempotent per (notification, channel). */
  async deliver(notificationId: string, channel: NotificationChannel): Promise<void> {
    const doc = await Notification.findById(notificationId);
    if (!doc) return;
    const state = doc.channels.find((c) => c.channel === channel);
    if (!state || state.status === 'SENT') return;
    const user = await User.findById(doc.userId).lean();
    if (!user) return;
    const prefs = (user.preferences?.channels ?? {}) as Record<string, boolean>;
    const setState = async (status: 'SENT' | 'FAILED' | 'SKIPPED', error?: string) => {
      state.status = status;
      state.attempts = (state.attempts ?? 0) + 1;
      state.error = error;
      if (status === 'SENT') state.sentAt = new Date();
      await doc.save();
    };
    try {
      const vars = { ...(await this.brandVars(doc.societyId ? String(doc.societyId) : null)), ...((doc.data as any)?.vars ?? {}), name: user.name, title: doc.title, body: doc.body };
      if (channel === 'EMAIL') {
        if (prefs.email === false || !user.email) return setState('SKIPPED', 'user preference');
        const tpl = await this.getTemplate(doc.societyId ? String(doc.societyId) : null, doc.type, 'EMAIL');
        if (tpl && !tpl.enabled) return setState('SKIPPED', 'template disabled');
        const subject = tpl?.subject ? renderTemplate(tpl.subject, vars) : doc.title;
        const inner = tpl ? renderTemplate(tpl.body, vars, { html: true }) : `<p>${renderTemplate('{{body}}', vars, { html: true })}</p>`;
        const html = wrapEmailLayout(inner + (doc.link ? `<p><a href="${env.APP_URL}${doc.link}">Open in app</a></p>` : ''), { name: String(vars.brandName), primaryColor: String(vars.primaryColor), appUrl: env.APP_URL });
        await emailProvider.send({ to: user.email, subject, html, text: htmlToText(inner) });
        return setState('SENT');
      }
      if (channel === 'WHATSAPP') {
        if (prefs.whatsapp === false || !user.phone) return setState('SKIPPED', user.phone ? 'user preference' : 'no phone');
        const tpl = await this.getTemplate(doc.societyId ? String(doc.societyId) : null, doc.type, 'WHATSAPP');
        if (tpl && !tpl.enabled) return setState('SKIPPED', 'template disabled');
        const text = tpl ? renderTemplate(tpl.body, vars) : `${doc.title}\n${doc.body}`;
        await whatsappProvider.send({ to: user.phone, text });
        return setState('SENT');
      }
      if (channel === 'PUSH') {
        if (prefs.push === false) return setState('SKIPPED', 'user preference');
        const subs = user.pushSubscriptions ?? [];
        if (!subs.length) return setState('SKIPPED', 'no subscription');
        const gone: string[] = [];
        for (const s of subs) {
          const r = await pushProvider.send({ endpoint: s.endpoint, keys: { p256dh: s.keys?.p256dh ?? '', auth: s.keys?.auth ?? '' } }, { title: doc.title, body: doc.body, link: doc.link ?? undefined, data: { id: String(doc._id), type: doc.type } });
          if (r.gone) gone.push(s.endpoint);
        }
        if (gone.length) await User.updateOne({ _id: user._id }, { $pull: { pushSubscriptions: { endpoint: { $in: gone } } } });
        return setState('SENT');
      }
      return setState('SKIPPED', 'unsupported channel');
    } catch (err: any) {
      logger.error({ err, notificationId, channel }, 'Notification delivery failed');
      await setState('FAILED', String(err?.message ?? err).slice(0, 300));
      throw err;
    }
  }

  /** Transactional email without an in-app notification (invitations, password resets). */
  async sendTransactionalEmail(input: { to: string; templateKey: string; vars: Record<string, unknown>; societyId?: string | null; fallbackSubject?: string; fallbackBody?: string }): Promise<void> {
    await jobQueue.add(JobNames.EMAIL_SEND, input);
  }

  async deliverTransactionalEmail(input: { to: string; templateKey: string; vars: Record<string, unknown>; societyId?: string | null; fallbackSubject?: string; fallbackBody?: string }): Promise<void> {
    const brand = await this.brandVars(input.societyId);
    const vars = { ...brand, ...input.vars };
    const tpl = await this.getTemplate(input.societyId ?? null, input.templateKey, 'EMAIL');
    if (tpl && !tpl.enabled) return;
    const subject = renderTemplate(tpl?.subject ?? input.fallbackSubject ?? input.templateKey, vars);
    const inner = renderTemplate(tpl?.body ?? input.fallbackBody ?? '', vars, { html: true });
    await emailProvider.send({ to: input.to, subject, html: wrapEmailLayout(inner, { name: String(vars.brandName), primaryColor: String(vars.primaryColor), appUrl: env.APP_URL }), text: htmlToText(inner) });
  }

  // ------------------------------------------------------------------ inbox
  async list(userId: string, opts: { page?: number; limit?: number; unreadOnly?: boolean; societyId?: string | null }) {
    const filter: Record<string, unknown> = { userId };
    if (opts.unreadOnly) filter.readAt = null;
    if (opts.societyId !== undefined) filter.$or = [{ societyId: opts.societyId }, { societyId: null }];
    return paginate(Notification as any, filter, { page: opts.page, limit: opts.limit, defaultSort: '-createdAt', select: '-channels' });
  }

  async unreadCount(userId: string, societyId?: string | null): Promise<number> {
    const filter: Record<string, unknown> = { userId, readAt: null };
    if (societyId !== undefined) filter.$or = [{ societyId }, { societyId: null }];
    return Notification.countDocuments(filter);
  }

  async markRead(userId: string, id: string): Promise<void> {
    await Notification.updateOne({ _id: id, userId, readAt: null }, { $set: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<number> {
    const r = await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
    return r.modifiedCount;
  }

  /** Housekeeping helper used by reports: recent delivery stats for a society. */
  async deliveryStats(societyId: string, days = 7) {
    const since = dayjs().subtract(days, 'day').toDate();
    return Notification.aggregate([
      { $match: { societyId: new mongoose.Types.ObjectId(societyId), createdAt: { $gte: since } } },
      { $unwind: '$channels' },
      { $group: { _id: { channel: '$channels.channel', status: '$channels.status' }, count: { $sum: 1 } } },
    ]);
  }

  async invalidateTemplates(societyId?: string | null): Promise<void> {
    configCache.delete(`config:templates:${societyId ?? 'platform'}`);
    if (!societyId) configCache.deletePrefix('config:templates:');
  }
}

export const notificationService = new NotificationService();
