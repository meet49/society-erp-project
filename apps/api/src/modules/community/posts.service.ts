import dayjs from 'dayjs';
import { Post } from '../../models/post.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { audienceService, type Audience, type AudienceMember } from '../../core/audience/audience.service';
import { domainEvents } from '../../core/events/event-bus';

export interface CommunityConfig { memberPostsEnabled: boolean; moderateMemberPosts: boolean; allowComments: boolean; allowReports: boolean }
export interface Actor extends AudienceMember { isModerator: boolean; canAnnounce: boolean; canCreate: boolean }

const ALL: Audience = { type: 'ALL', buildingIds: [], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] };
const excerpt = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 140);
const POPULATE = [{ path: 'createdBy', select: 'name' }, { path: 'unitId', select: 'code' }, { path: 'comments.userId', select: 'name' }, { path: 'reports.userId', select: 'name' }];

class CommunityService {
  getConfig(societyId: string): Promise<CommunityConfig> { return configurationService.getSocietySetting<CommunityConfig>(societyId, 'communication.config'); }

  async updateConfig(societyId: string, patch: Partial<CommunityConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'communication.config', patch, byUserId);
    auditService.record({ action: 'community.config_updated', resource: 'SocietySetting', resourceId: 'communication.config', societyId, newValue: patch, req });
    return merged;
  }

  private present(doc: any, actor: Actor) {
    const mine = String(doc.createdBy?._id ?? doc.createdBy) === actor.userId;
    return {
      ...doc,
      id: String(doc._id),
      mine,
      liked: (doc.likes ?? []).some((u: any) => String(u) === actor.userId),
      likes: undefined,
      comments: (doc.comments ?? []).filter((c: any) => !c.hidden || actor.isModerator).map((c: any) => ({ ...c, id: String(c._id), mine: String(c.userId?._id ?? c.userId) === actor.userId })),
      reports: actor.isModerator ? doc.reports : undefined,
      reportCount: actor.isModerator ? doc.reportCount : undefined,
    };
  }

  private async visibilityFilter(societyId: string, actor: Actor, query: Record<string, any>): Promise<Record<string, unknown>[]> {
    const and: Record<string, unknown>[] = [{ societyId, deletedAt: null }];
    if (actor.isModerator) {
      if (query.status) and.push({ status: query.status });
      if (query.reportedOnly) and.push({ reportCount: { $gt: 0 } });
    } else {
      and.push({ $or: [{ status: 'ACTIVE' }, { createdBy: actor.userId, status: 'PENDING' }] });
      and.push({ $or: [{ kind: 'POST' }, { $and: [{ kind: 'ANNOUNCEMENT' }, await audienceService.matchFilter(societyId, actor)] }] });
    }
    return and;
  }

  async feed(societyId: string, query: Record<string, any>, actor: Actor) {
    const and = await this.visibilityFilter(societyId, actor, query);
    if (query.kind) and.push({ kind: query.kind });
    if (query.mine) and.push({ createdBy: actor.userId });
    const rx = searchRegex(query.search);
    if (rx) and.push({ $or: [{ title: rx }, { body: rx }] });
    const page = await paginate(Post as any, { $and: and }, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-isPinned,-createdAt', allowedSorts: ['isPinned', 'createdAt', 'likeCount', 'commentCount', 'reportCount'], populate: POPULATE });
    page.items = page.items.map((p: any) => this.present(p, actor));
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const and = await this.visibilityFilter(societyId, actor, {});
    const doc: any = await Post.findOne({ $and: [{ _id: id }, ...and] }).populate(POPULATE).lean();
    if (!doc) throw Errors.notFound('Post');
    return this.present(doc, actor);
  }

  async create(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    const cfg = await this.getConfig(societyId);
    const kind = input.kind ?? 'POST';
    if (kind === 'ANNOUNCEMENT') {
      if (!actor.canAnnounce) throw Errors.permissionDenied('communication:announce');
    } else {
      if (!actor.canCreate) throw Errors.permissionDenied('communication:create');
      if (!cfg.memberPostsEnabled && !actor.isModerator) throw Errors.conflict('Community posts are switched off for residents');
    }
    const audience: Audience = kind === 'ANNOUNCEMENT' ? (input.audience ?? ALL) : ALL;
    const status = kind === 'POST' && cfg.moderateMemberPosts && !actor.isModerator ? 'PENDING' : 'ACTIVE';
    const doc = await Post.create({ kind, title: input.title, body: input.body, attachments: input.attachments ?? [], audience, audienceLabel: await audienceService.describe(societyId, audience), societyId, createdBy: actor.userId, unitId: actor.unitIds[0] ?? null, status, isPinned: kind === 'ANNOUNCEMENT' && Boolean(input.isPinned) });
    auditService.record({ action: kind === 'ANNOUNCEMENT' ? 'community.announced' : 'community.posted', resource: 'Post', resourceId: doc._id, societyId, newValue: { kind, status, audience: doc.audienceLabel }, req });
    if (kind === 'ANNOUNCEMENT') domainEvents.emit('community.announcement', { postId: String(doc._id), title: doc.title ?? 'Announcement', excerpt: excerpt(doc.body), userIds: await audienceService.resolveUserIds(societyId, audience) }, { societyId, actorId: actor.userId });
    else if (status === 'PENDING') domainEvents.emit('community.pending', { postId: String(doc._id), excerpt: excerpt(doc.body) }, { societyId, actorId: actor.userId });
    domainEvents.emit('community.changed', { postId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, String(doc._id), actor);
  }

  async comment(societyId: string, id: string, body: string, actor: Actor, req?: any) {
    const cfg = await this.getConfig(societyId);
    if (!cfg.allowComments && !actor.isModerator) throw Errors.conflict('Comments are switched off');
    const doc = await Post.findOne({ _id: id, societyId, deletedAt: null, status: actor.isModerator ? { $ne: 'HIDDEN' } : 'ACTIVE' });
    if (!doc) throw Errors.notFound('Post');
    doc.comments.push({ userId: actor.userId, body, at: new Date() } as any);
    doc.commentCount = doc.comments.filter((c) => !c.hidden).length;
    await doc.save();
    if (String(doc.createdBy) !== actor.userId) domainEvents.emit('community.commented', { postId: String(doc._id), authorId: String(doc.createdBy), byUserId: actor.userId, excerpt: excerpt(body) }, { societyId, actorId: actor.userId });
    domainEvents.emit('community.changed', { postId: String(doc._id) }, { societyId, actorId: actor.userId });
    void req;
    return this.get(societyId, id, actor);
  }

  async removeComment(societyId: string, id: string, commentId: string, actor: Actor) {
    const doc = await Post.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Post');
    const c: any = doc.comments.find((x: any) => String(x._id) === commentId);
    if (!c) throw Errors.notFound('Comment');
    if (String(c.userId) !== actor.userId && !actor.isModerator) throw Errors.forbidden('You can only remove your own comments');
    c.hidden = true;
    doc.commentCount = doc.comments.filter((x) => !x.hidden).length;
    doc.markModified('comments');
    await doc.save();
    return this.get(societyId, id, actor);
  }

  async toggleLike(societyId: string, id: string, actor: Actor) {
    const doc = await Post.findOne({ _id: id, societyId, deletedAt: null, status: 'ACTIVE' });
    if (!doc) throw Errors.notFound('Post');
    const liked = doc.likes.some((u) => String(u) === actor.userId);
    if (liked) doc.likes = doc.likes.filter((u) => String(u) !== actor.userId) as any;
    else doc.likes.push(actor.userId as any);
    doc.likeCount = doc.likes.length;
    await doc.save();
    return { liked: !liked, likeCount: doc.likeCount };
  }

  async report(societyId: string, id: string, reason: string, actor: Actor) {
    const cfg = await this.getConfig(societyId);
    if (!cfg.allowReports) throw Errors.conflict('Reporting is switched off');
    const doc = await Post.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Post');
    if (doc.reports.some((r) => String(r.userId) === actor.userId)) throw Errors.conflict('You already reported this post');
    doc.reports.push({ userId: actor.userId, reason, at: new Date() } as any);
    doc.reportCount = doc.reports.length;
    await doc.save();
    domainEvents.emit('community.reported', { postId: String(doc._id), reason, byUserId: actor.userId }, { societyId, actorId: actor.userId });
    return { reported: true, reportCount: doc.reportCount };
  }

  async moderate(societyId: string, id: string, input: { action: string; note?: string }, byUserId: string, req?: any) {
    const doc = await Post.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Post');
    switch (input.action) {
      case 'HIDE': doc.status = 'HIDDEN'; break;
      case 'UNHIDE':
      case 'APPROVE': doc.status = 'ACTIVE'; break;
      case 'PIN': doc.isPinned = true; break;
      case 'UNPIN': doc.isPinned = false; break;
      case 'CLEAR_REPORTS': doc.set('reports', []); doc.reportCount = 0; break;
      case 'DELETE': doc.deletedAt = new Date(); break;
      default: throw Errors.badRequest('Unknown moderation action');
    }
    doc.moderatedBy = byUserId as any;
    if (input.note !== undefined) doc.moderationNote = input.note;
    await doc.save();
    auditService.record({ action: `community.${input.action.toLowerCase()}`, resource: 'Post', resourceId: doc._id, societyId, newValue: { note: input.note }, req });
    domainEvents.emit('community.changed', { postId: String(doc._id) }, { societyId, actorId: byUserId });
    if (input.action === 'DELETE') return { deleted: true };
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], isModerator: true, canAnnounce: true, canCreate: true });
  }

  async remove(societyId: string, id: string, actor: Actor, req?: any): Promise<void> {
    const doc = await Post.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Post');
    if (String(doc.createdBy) !== actor.userId && !actor.isModerator) throw Errors.forbidden('You can only delete your own posts');
    doc.deletedAt = new Date();
    await doc.save();
    auditService.record({ action: 'community.deleted', resource: 'Post', resourceId: doc._id, societyId, req });
    domainEvents.emit('community.changed', { postId: String(doc._id) }, { societyId, actorId: actor.userId });
  }

  async stats(societyId: string) {
    const weekAgo = dayjs().subtract(7, 'day').toDate();
    const [postsThisWeek, pending, reported, announcements] = await Promise.all([
      Post.countDocuments({ societyId, deletedAt: null, createdAt: { $gte: weekAgo } }),
      Post.countDocuments({ societyId, deletedAt: null, status: 'PENDING' }),
      Post.countDocuments({ societyId, deletedAt: null, reportCount: { $gt: 0 } }),
      Post.countDocuments({ societyId, deletedAt: null, kind: 'ANNOUNCEMENT', status: 'ACTIVE' }),
    ]);
    return { postsThisWeek, pending, reported, announcements };
  }
}

export const communityService = new CommunityService();
