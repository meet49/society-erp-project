import dayjs from 'dayjs';
import { Poll, PollVote, type PollDoc } from '../../models/poll.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { audienceService, type Audience, type AudienceMember } from '../../core/audience/audience.service';
import { domainEvents } from '../../core/events/event-bus';

export interface Actor extends AudienceMember { ownScope: boolean; canSeeResults: boolean }
const ALL: Audience = { type: 'ALL', buildingIds: [], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] };

class PollService {
  private canSeeCounts(poll: any, actor: Actor): boolean {
    return actor.canSeeResults || poll.status === 'CLOSED' || Boolean(poll.showLiveResults);
  }

  private async decorate(actor: Actor, items: any[]) {
    if (!items.length) return items;
    const votes = await PollVote.find({ userId: actor.userId, pollId: { $in: items.map((p) => p._id) } }).select('pollId optionKeys').lean();
    const byId = new Map(votes.map((v) => [String(v.pollId), v.optionKeys]));
    return items.map((p) => {
      const show = this.canSeeCounts(p, actor);
      return { ...p, id: String(p._id), myVote: byId.get(String(p._id)) ?? null, options: (p.options ?? []).map((o: any) => ({ key: o.key, label: o.label, votes: show ? o.votes : null })), voteCount: show ? p.voteCount : null, resultsVisible: show, isOpen: p.status === 'OPEN' && (!p.endAt || dayjs(p.endAt).isAfter(dayjs())) };
    });
  }

  private async memberFilter(societyId: string, actor: Actor) {
    return { $and: [{ status: { $in: ['OPEN', 'CLOSED'] } }, await audienceService.matchFilter(societyId, actor)] };
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const and: Record<string, unknown>[] = [{ societyId }];
    if (actor.ownScope) and.push(await this.memberFilter(societyId, actor));
    else if (query.status) and.push({ status: query.status });
    const rx = searchRegex(query.search);
    if (rx) and.push({ question: rx });
    const page = await paginate(Poll as any, { $and: and }, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'endAt', 'status', 'voteCount'], populate: [{ path: 'createdBy', select: 'name' }] });
    page.items = await this.decorate(actor, page.items);
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const filter = actor.ownScope ? { _id: id, societyId, ...(await this.memberFilter(societyId, actor)) } : { _id: id, societyId };
    const doc: any = await Poll.findOne(filter).populate('createdBy', 'name').lean();
    if (!doc) throw Errors.notFound('Poll');
    const [out] = await this.decorate(actor, [doc]);
    return out;
  }

  private optionsFrom(labels: string[]) {
    return labels.map((label, i) => ({ key: `o${i + 1}`, label, votes: 0 }));
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const audience: Audience = input.audience ?? ALL;
    const doc = new Poll({ question: input.question, description: input.description, options: this.optionsFrom(input.options), audience, audienceLabel: await audienceService.describe(societyId, audience), anonymous: input.anonymous, oneVotePerUnit: input.oneVotePerUnit, allowMultiple: input.allowMultiple, showLiveResults: input.showLiveResults, endAt: input.endAt ?? null, societyId, status: 'DRAFT', createdBy: byUserId });
    await doc.save();
    auditService.record({ action: 'poll.created', resource: 'Poll', resourceId: doc._id, societyId, newValue: { question: doc.question, options: input.options.length }, req });
    if (input.openNow) await this.openDoc(doc, byUserId, req);
    return this.get(societyId, String(doc._id), { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await Poll.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Poll');
    if (doc.status !== 'DRAFT') {
      // only the closing time and descriptive text can change once a poll is live
      for (const key of ['description', 'endAt', 'showLiveResults'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    } else {
      if (patch.audience) { doc.set('audience', patch.audience); doc.audienceLabel = await audienceService.describe(societyId, patch.audience); }
      if (patch.options) doc.set('options', this.optionsFrom(patch.options));
      for (const key of ['question', 'description', 'anonymous', 'oneVotePerUnit', 'allowMultiple', 'showLiveResults', 'endAt'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    }
    await doc.save();
    auditService.record({ action: 'poll.updated', resource: 'Poll', resourceId: doc._id, societyId, newValue: Object.keys(patch), req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  private async openDoc(doc: PollDoc, byUserId: string, req?: any): Promise<void> {
    const societyId = String(doc.societyId);
    doc.status = 'OPEN';
    doc.startAt = new Date();
    doc.eligibleCount = await audienceService.count(societyId, doc.audience as any);
    await doc.save();
    auditService.record({ action: 'poll.opened', resource: 'Poll', resourceId: doc._id, societyId, newValue: { eligible: doc.eligibleCount, endAt: doc.endAt }, req });
    domainEvents.emit('poll.opened', { pollId: String(doc._id), question: doc.question, endAt: doc.endAt, userIds: await audienceService.resolveUserIds(societyId, doc.audience as any) }, { societyId, actorId: byUserId });
  }

  async open(societyId: string, id: string, input: { endAt?: Date | null }, byUserId: string, req?: any) {
    const doc = await Poll.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Poll');
    if (doc.status !== 'DRAFT') throw Errors.invalidTransition(doc.status, 'OPEN', 'Poll');
    if (input.endAt !== undefined) doc.endAt = input.endAt;
    await this.openDoc(doc, byUserId, req);
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  async close(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await Poll.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Poll');
    if (doc.status !== 'OPEN') throw Errors.invalidTransition(doc.status, 'CLOSED', 'Poll');
    doc.status = 'CLOSED';
    doc.closedAt = new Date();
    await doc.save();
    auditService.record({ action: 'poll.closed', resource: 'Poll', resourceId: doc._id, societyId, newValue: { votes: doc.voteCount }, req });
    domainEvents.emit('community.changed', { pollId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await Poll.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Poll');
    if (doc.status !== 'DRAFT') throw Errors.conflict('Only draft polls can be deleted; close live polls instead');
    await doc.deleteOne();
    auditService.record({ action: 'poll.deleted', resource: 'Poll', resourceId: doc._id, societyId, req });
  }

  private async recount(doc: PollDoc): Promise<void> {
    const rows = await PollVote.aggregate([{ $match: { pollId: doc._id } }, { $unwind: '$optionKeys' }, { $group: { _id: '$optionKeys', n: { $sum: 1 } } }]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r.n]));
    doc.options.forEach((o) => { o.votes = by[o.key] ?? 0; });
    doc.markModified('options');
    doc.voteCount = await PollVote.countDocuments({ pollId: doc._id });
    await doc.save();
  }

  async vote(societyId: string, id: string, optionKeys: string[], actor: Actor) {
    const doc = await Poll.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Poll');
    if (doc.status !== 'OPEN' || (doc.endAt && dayjs().isAfter(dayjs(doc.endAt)))) throw Errors.conflict('This poll is closed');
    const keys = [...new Set(optionKeys)];
    const valid = new Set(doc.options.map((o) => o.key));
    if (!keys.every((k) => valid.has(k))) throw Errors.validation({ optionKeys: ['Unknown option'] });
    if (!doc.allowMultiple && keys.length > 1) throw Errors.validation({ optionKeys: ['Pick one option'] });
    if (actor.ownScope && !(await audienceService.includes(societyId, actor, doc.audience as any))) throw Errors.forbidden('This poll is not open to you');
    const unitId = actor.unitIds[0] ?? null;
    if (doc.oneVotePerUnit) {
      if (!unitId) throw Errors.conflict('Your login is not linked to a unit, so you cannot vote in a one-vote-per-unit poll');
      const other = await PollVote.findOne({ pollId: doc._id, unitId, userId: { $ne: actor.userId } }).select('_id').lean();
      if (other) throw Errors.conflict('Someone from your unit has already voted');
    }
    await PollVote.updateOne({ pollId: doc._id, userId: actor.userId }, { $set: { optionKeys: keys, unitId }, $setOnInsert: { societyId, pollId: doc._id, userId: actor.userId } }, { upsert: true });
    await this.recount(doc);
    domainEvents.emit('community.changed', { pollId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  async results(societyId: string, id: string, actor: Actor) {
    const doc: any = await Poll.findOne({ _id: id, societyId }).lean();
    if (!doc) throw Errors.notFound('Poll');
    if (!this.canSeeCounts(doc, actor)) throw Errors.forbidden('Results are published when the poll closes');
    const total = doc.voteCount;
    const voters = !doc.anonymous && actor.canSeeResults ? (await PollVote.find({ pollId: doc._id }).populate('userId', 'name').populate('unitId', 'code').lean()).map((v: any) => ({ name: v.userId?.name ?? '—', unitCode: v.unitId?.code ?? null, optionKeys: v.optionKeys, at: v.updatedAt })) : undefined;
    return { id: String(doc._id), question: doc.question, status: doc.status, anonymous: doc.anonymous, total, eligible: doc.eligibleCount, turnout: doc.eligibleCount ? Math.round((total / doc.eligibleCount) * 100) : null, options: doc.options.map((o: any) => ({ key: o.key, label: o.label, votes: o.votes, percent: total ? Math.round((o.votes / total) * 100) : 0 })), voters };
  }

  /** Sweep: closes polls whose end time passed. */
  async closeEnded(now = new Date()): Promise<number> {
    const res = await Poll.updateMany({ status: 'OPEN', endAt: { $ne: null, $lte: now } }, { $set: { status: 'CLOSED', closedAt: now } });
    return res.modifiedCount;
  }
}

export const pollService = new PollService();
