import dayjs from 'dayjs';
import { Notice, NoticeRead, type NoticeDoc } from '../../models/notice.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { categoryService } from '../../core/categories/category.service';
import { audienceService, type Audience, type AudienceMember } from '../../core/audience/audience.service';
import { domainEvents } from '../../core/events/event-bus';

export interface NoticesConfig { defaultChannels: string[]; defaultExpiryDays: number; memberCanSeeArchived: boolean }
/** `ownScope` = a resident who can only read notices addressed to them. */
export interface Actor extends AudienceMember { ownScope: boolean }

const excerpt = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 160);

class NoticeService {
  getConfig(societyId: string): Promise<NoticesConfig> { return configurationService.getSocietySetting<NoticesConfig>(societyId, 'notices.config'); }

  async updateConfig(societyId: string, patch: Partial<NoticesConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'notices.config', patch, byUserId);
    auditService.record({ action: 'notices.config_updated', resource: 'SocietySetting', resourceId: 'notices.config', societyId, newValue: patch, req });
    return merged;
  }

  async categories(societyId: string) {
    await categoryService.ensureDefaults(societyId, undefined, ['NOTICE_CATEGORY']);
    return categoryService.list(societyId, 'NOTICE_CATEGORY');
  }

  async previewAudience(societyId: string, audience: Audience) {
    const [count, label] = await Promise.all([audienceService.count(societyId, audience), audienceService.describe(societyId, audience)]);
    return { count, label };
  }

  private async memberFilter(societyId: string, actor: Actor, opts: { includeExpired?: boolean; includeArchived?: boolean } = {}) {
    const cfg = await this.getConfig(societyId);
    const statuses = ['PUBLISHED'];
    if (opts.includeArchived && cfg.memberCanSeeArchived) statuses.push('ARCHIVED');
    const and: Record<string, unknown>[] = [{ status: { $in: statuses } }, await audienceService.matchFilter(societyId, actor)];
    if (!opts.includeExpired) and.push({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
    return { $and: and };
  }

  private async withReadFlags(societyId: string, actor: Actor, items: any[]) {
    if (!items.length) return items;
    const reads = await NoticeRead.find({ societyId, userId: actor.userId, noticeId: { $in: items.map((n) => n._id) } }).select('noticeId readAt acknowledgedAt').lean();
    const byId = new Map(reads.map((r) => [String(r.noticeId), r]));
    return items.map((n) => ({ ...n, id: String(n._id), read: byId.has(String(n._id)), acknowledged: Boolean(byId.get(String(n._id))?.acknowledgedAt) }));
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const and: Record<string, unknown>[] = [{ societyId }];
    if (actor.ownScope) and.push(await this.memberFilter(societyId, actor, { includeExpired: query.includeExpired, includeArchived: query.status === 'ARCHIVED' }));
    else if (query.status) and.push({ status: query.status });
    if (query.categoryKey) and.push({ categoryKey: String(query.categoryKey).toUpperCase() });
    if (query.pinnedOnly) and.push({ isPinned: true });
    if (query.unreadOnly && actor.ownScope) {
      const reads = await NoticeRead.find({ societyId, userId: actor.userId }).select('noticeId').lean();
      and.push({ _id: { $nin: reads.map((r) => r.noticeId) } });
    }
    const rx = searchRegex(query.search);
    if (rx) and.push({ $or: [{ title: rx }, { body: rx }, { noticeNumber: rx }] });
    const page = await paginate(Notice as any, { $and: and }, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-isPinned,-publishedAt,-createdAt', allowedSorts: ['isPinned', 'publishedAt', 'createdAt', 'title', 'priority', 'expiresAt', 'status'], select: '-body', populate: [{ path: 'createdBy', select: 'name' }] });
    page.items = await this.withReadFlags(societyId, actor, page.items);
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const filter: Record<string, unknown> = actor.ownScope ? { _id: id, societyId, ...(await this.memberFilter(societyId, actor, { includeExpired: true, includeArchived: true })) } : { _id: id, societyId };
    const doc: any = await Notice.findOne(filter).populate('createdBy', 'name').populate('publishedBy', 'name').lean();
    if (!doc) throw Errors.notFound('Notice');
    if (actor.ownScope && doc.status === 'PUBLISHED') {
      const res = await NoticeRead.updateOne({ noticeId: doc._id, userId: actor.userId }, { $setOnInsert: { societyId, noticeId: doc._id, userId: actor.userId, readAt: new Date() } }, { upsert: true });
      if (res.upsertedCount) {
        await Notice.updateOne({ _id: doc._id }, { $inc: { readCount: 1 } });
        doc.readCount += 1;
      }
    }
    const [flagged] = await this.withReadFlags(societyId, actor, [doc]);
    return flagged;
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const cfg = await this.getConfig(societyId);
    const audience: Audience = input.audience ?? { type: 'ALL', buildingIds: [], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] };
    const doc = new Notice({
      ...input,
      societyId,
      noticeNumber: await sequenceService.next(societyId, 'notice', { prefix: 'NTC', padding: 4, resetPolicy: 'YEARLY' }),
      categoryKey: String(input.categoryKey ?? 'GENERAL').toUpperCase(),
      audience,
      audienceLabel: await audienceService.describe(societyId, audience),
      channels: input.channels ?? cfg.defaultChannels,
      status: 'DRAFT',
      publishAt: null,
      createdBy: byUserId,
      updatedBy: byUserId,
    });
    if (!input.publishNow && input.publishAt && dayjs(input.publishAt).isAfter(dayjs())) {
      doc.status = 'SCHEDULED';
      doc.publishAt = input.publishAt;
    }
    await doc.save();
    auditService.record({ action: 'notice.created', resource: 'Notice', resourceId: doc._id, societyId, newValue: { noticeNumber: doc.noticeNumber, title: doc.title, audience: doc.audienceLabel, status: doc.status }, req });
    if (input.publishNow) await this.publishDoc(doc, byUserId, req);
    return this.get(societyId, String(doc._id), { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await Notice.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Notice');
    if (doc.status === 'ARCHIVED') throw Errors.conflict('Archived notices cannot be edited');
    if (patch.audience) {
      doc.set('audience', patch.audience);
      doc.audienceLabel = await audienceService.describe(societyId, patch.audience);
    }
    for (const key of ['title', 'body', 'priority', 'attachments', 'isPinned', 'requiresAcknowledgement', 'channels', 'expiresAt'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    if (patch.categoryKey) doc.categoryKey = String(patch.categoryKey).toUpperCase();
    if (patch.publishAt !== undefined && doc.status !== 'PUBLISHED') {
      const future = patch.publishAt && dayjs(patch.publishAt).isAfter(dayjs());
      doc.publishAt = future ? patch.publishAt : null;
      doc.status = future ? 'SCHEDULED' : 'DRAFT';
    }
    doc.updatedBy = byUserId as any;
    await doc.save();
    auditService.record({ action: 'notice.updated', resource: 'Notice', resourceId: doc._id, societyId, newValue: Object.keys(patch), req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  private async publishDoc(doc: NoticeDoc, byUserId: string | null, req?: any): Promise<void> {
    const societyId = String(doc.societyId);
    const cfg = await this.getConfig(societyId);
    const userIds = await audienceService.resolveUserIds(societyId, doc.audience as any);
    doc.status = 'PUBLISHED';
    doc.publishedAt = new Date();
    doc.publishedBy = byUserId as any;
    doc.publishAt = null;
    if (!doc.expiresAt && cfg.defaultExpiryDays > 0) doc.expiresAt = dayjs().add(cfg.defaultExpiryDays, 'day').toDate();
    doc.recipientCount = userIds.length;
    await doc.save();
    auditService.record({ action: 'notice.published', resource: 'Notice', resourceId: doc._id, societyId, actor: byUserId ? { id: byUserId } : undefined, newValue: { noticeNumber: doc.noticeNumber, recipients: userIds.length, channels: doc.channels }, req });
    domainEvents.emit('notice.published', { noticeId: String(doc._id), noticeNumber: doc.noticeNumber, title: doc.title, excerpt: excerpt(doc.body), priority: doc.priority, categoryKey: doc.categoryKey, userIds, channels: doc.channels, requiresAcknowledgement: doc.requiresAcknowledgement }, { societyId, actorId: byUserId });
  }

  async publish(societyId: string, id: string, input: { publishAt?: Date | null }, byUserId: string, req?: any) {
    const doc = await Notice.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Notice');
    if (!['DRAFT', 'SCHEDULED'].includes(doc.status)) throw Errors.invalidTransition(doc.status, 'PUBLISHED', 'Notice');
    if (input.publishAt && dayjs(input.publishAt).isAfter(dayjs())) {
      doc.status = 'SCHEDULED';
      doc.publishAt = input.publishAt;
      await doc.save();
      auditService.record({ action: 'notice.scheduled', resource: 'Notice', resourceId: doc._id, societyId, newValue: { publishAt: input.publishAt }, req });
    } else await this.publishDoc(doc, byUserId, req);
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async archive(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await Notice.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Notice');
    if (doc.status === 'ARCHIVED') return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
    doc.status = 'ARCHIVED';
    doc.archivedAt = new Date();
    doc.isPinned = false;
    doc.publishAt = null;
    await doc.save();
    auditService.record({ action: 'notice.archived', resource: 'Notice', resourceId: doc._id, societyId, req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await Notice.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Notice');
    if (!['DRAFT', 'SCHEDULED'].includes(doc.status)) throw Errors.conflict('Published notices are archived, not deleted');
    await doc.deleteOne();
    auditService.record({ action: 'notice.deleted', resource: 'Notice', resourceId: doc._id, societyId, req });
  }

  async acknowledge(societyId: string, id: string, actor: Actor) {
    const doc = await Notice.findOne({ _id: id, societyId, status: 'PUBLISHED', ...(actor.ownScope ? await this.memberFilter(societyId, actor, { includeExpired: true }) : {}) });
    if (!doc) throw Errors.notFound('Notice');
    if (!doc.requiresAcknowledgement) throw Errors.conflict('This notice does not ask for acknowledgement');
    const existing = await NoticeRead.findOne({ noticeId: doc._id, userId: actor.userId });
    if (existing?.acknowledgedAt) return this.get(societyId, id, actor);
    await NoticeRead.updateOne({ noticeId: doc._id, userId: actor.userId }, { $set: { acknowledgedAt: new Date() }, $setOnInsert: { societyId, noticeId: doc._id, userId: actor.userId, readAt: new Date() } }, { upsert: true });
    await Notice.updateOne({ _id: doc._id }, { $inc: { ackCount: 1, ...(existing ? {} : { readCount: 1 }) } });
    return this.get(societyId, id, actor);
  }

  async readers(societyId: string, id: string) {
    const doc = await Notice.findOne({ _id: id, societyId }).select('recipientCount readCount ackCount requiresAcknowledgement').lean();
    if (!doc) throw Errors.notFound('Notice');
    const rows = await NoticeRead.find({ societyId, noticeId: doc._id }).populate('userId', 'name email').sort({ readAt: -1 }).limit(500).lean();
    return { recipientCount: doc.recipientCount, readCount: doc.readCount, ackCount: doc.ackCount, requiresAcknowledgement: doc.requiresAcknowledgement, readers: rows.map((r: any) => ({ id: String(r._id), user: r.userId, readAt: r.readAt, acknowledgedAt: r.acknowledgedAt })) };
  }

  async stats(societyId: string) {
    const now = new Date();
    const [published, scheduled, drafts, pinned, recent] = await Promise.all([
      Notice.countDocuments({ societyId, status: 'PUBLISHED', $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }),
      Notice.countDocuments({ societyId, status: 'SCHEDULED' }),
      Notice.countDocuments({ societyId, status: 'DRAFT' }),
      Notice.countDocuments({ societyId, status: 'PUBLISHED', isPinned: true }),
      Notice.find({ societyId, status: { $in: ['PUBLISHED', 'ARCHIVED'] } }).sort({ publishedAt: -1 }).limit(10).select('recipientCount readCount ackCount requiresAcknowledgement').lean(),
    ]);
    const withRecipients = recent.filter((n) => n.recipientCount > 0);
    const readRate = withRecipients.length ? Math.round((withRecipients.reduce((s, n) => s + n.readCount / n.recipientCount, 0) / withRecipients.length) * 100) : null;
    const pendingAcks = recent.filter((n) => n.requiresAcknowledgement).reduce((s, n) => s + Math.max(0, n.recipientCount - n.ackCount), 0);
    return { published, scheduled, drafts, pinned, readRate, pendingAcks };
  }

  /** Sweep: publishes scheduled notices whose time has come. */
  async publishScheduled(now = new Date()): Promise<number> {
    const due = await Notice.find({ status: 'SCHEDULED', publishAt: { $lte: now } });
    for (const doc of due) await this.publishDoc(doc, doc.createdBy ? String(doc.createdBy) : null);
    return due.length;
  }
}

export const noticeService = new NoticeService();
