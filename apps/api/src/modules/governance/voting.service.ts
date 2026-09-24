import dayjs from 'dayjs';
import { Voting, VotingBallot, type VotingDoc } from '../../models/voting.model';
import { Resident } from '../../models/resident.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { audienceService, type Audience, type AudienceMember } from '../../core/audience/audience.service';
import { domainEvents } from '../../core/events/event-bus';

export interface VotingConfig { oneVotePerUnit: boolean; anonymous: boolean; passThresholdPercent: number; quorumPercent: number }
export interface Actor extends AudienceMember { ownScope: boolean; canSeeResults: boolean }
const ALL: Audience = { type: 'ALL', buildingIds: [], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] };
const RESOLUTION_OPTIONS = [{ key: 'FOR', label: 'For' }, { key: 'AGAINST', label: 'Against' }, { key: 'ABSTAIN', label: 'Abstain' }];

class VotingService {
  getConfig(societyId: string): Promise<VotingConfig> { return configurationService.getSocietySetting<VotingConfig>(societyId, 'voting.config'); }

  async updateConfig(societyId: string, patch: Partial<VotingConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'voting.config', patch, byUserId);
    auditService.record({ action: 'voting.config_updated', resource: 'SocietySetting', resourceId: 'voting.config', societyId, newValue: patch, req });
    return merged;
  }

  private optionsFor(type: string, candidates: any[] = []) {
    if (type === 'RESOLUTION') return RESOLUTION_OPTIONS.map((o) => ({ ...o, votes: 0 }));
    return candidates.map((c, i) => ({ key: c.key || `c${i + 1}`, label: c.label, unitCode: c.unitCode, userId: c.userId ?? null, statement: c.statement, votes: 0 }));
  }

  private canSeeCounts(v: any, actor: Actor): boolean {
    return actor.canSeeResults || v.status === 'CLOSED';
  }

  private async decorate(actor: Actor, items: any[]) {
    if (!items.length) return items;
    const ballots = await VotingBallot.find({ userId: actor.userId, votingId: { $in: items.map((v) => v._id) } }).select('votingId choices').lean();
    const byId = new Map(ballots.map((b) => [String(b.votingId), b.choices]));
    return items.map((v) => {
      const show = this.canSeeCounts(v, actor);
      return { ...v, id: String(v._id), myBallot: byId.get(String(v._id)) ?? null, options: (v.options ?? []).map((o: any) => ({ ...o, votes: show ? o.votes : null })), voteCount: show ? v.voteCount : null, results: show ? v.results : undefined, resultsVisible: show, isOpen: v.status === 'OPEN' && (!v.endAt || dayjs(v.endAt).isAfter(dayjs())) };
    });
  }

  private async memberFilter(societyId: string, actor: Actor) {
    return { $and: [{ status: { $in: ['OPEN', 'CLOSED'] } }, await audienceService.matchFilter(societyId, actor)] };
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const and: Record<string, unknown>[] = [{ societyId }];
    if (actor.ownScope) and.push(await this.memberFilter(societyId, actor));
    else if (query.status) and.push({ status: query.status });
    if (query.type) and.push({ type: query.type });
    const rx = searchRegex(query.search);
    if (rx) and.push({ title: rx });
    const page = await paginate(Voting as any, { $and: and }, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'endAt', 'status', 'voteCount', 'title'], populate: [{ path: 'createdBy', select: 'name' }] });
    page.items = await this.decorate(actor, page.items);
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const filter = actor.ownScope ? { _id: id, societyId, ...(await this.memberFilter(societyId, actor)) } : { _id: id, societyId };
    const doc: any = await Voting.findOne(filter).populate('createdBy', 'name').populate('meetingId', 'title meetingNumber').lean();
    if (!doc) throw Errors.notFound('Voting');
    const [out] = await this.decorate(actor, [doc]);
    return out;
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const cfg = await this.getConfig(societyId);
    const audience: Audience = input.audience ?? ALL;
    const doc = new Voting({
      title: input.title, description: input.description, type: input.type ?? 'RESOLUTION', audience, audienceLabel: await audienceService.describe(societyId, audience),
      options: this.optionsFor(input.type ?? 'RESOLUTION', input.candidates), seats: input.type === 'ELECTION' ? input.seats ?? 1 : 1,
      oneVotePerUnit: input.oneVotePerUnit ?? cfg.oneVotePerUnit, anonymous: input.anonymous ?? cfg.anonymous, passThresholdPercent: input.passThresholdPercent ?? cfg.passThresholdPercent, quorumPercent: input.quorumPercent ?? cfg.quorumPercent,
      endAt: input.endAt ?? null, meetingId: input.meetingId ?? null, resolutionKey: input.resolutionKey ?? null, societyId, status: 'DRAFT', createdBy: byUserId,
    });
    await doc.save();
    auditService.record({ action: 'voting.created', resource: 'Voting', resourceId: doc._id, societyId, newValue: { title: doc.title, type: doc.type }, req });
    if (input.openNow) await this.openDoc(doc, byUserId, req);
    return this.get(societyId, String(doc._id), { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await Voting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Voting');
    if (doc.status !== 'DRAFT') {
      for (const key of ['description', 'endAt'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    } else {
      if (patch.audience) { doc.set('audience', patch.audience); doc.audienceLabel = await audienceService.describe(societyId, patch.audience); }
      if (patch.candidates && doc.type === 'ELECTION') doc.set('options', this.optionsFor('ELECTION', patch.candidates));
      for (const key of ['title', 'description', 'seats', 'oneVotePerUnit', 'anonymous', 'passThresholdPercent', 'quorumPercent', 'endAt'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    }
    await doc.save();
    auditService.record({ action: 'voting.updated', resource: 'Voting', resourceId: doc._id, societyId, newValue: Object.keys(patch), req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  private async eligibleFor(doc: VotingDoc): Promise<{ userIds: string[]; eligible: number }> {
    const societyId = String(doc.societyId);
    const userIds = await audienceService.resolveUserIds(societyId, doc.audience as any);
    if (!doc.oneVotePerUnit) return { userIds, eligible: userIds.length };
    const units = await Resident.distinct('unitId', { societyId, userId: { $in: userIds }, status: 'ACTIVE', deletedAt: null });
    return { userIds, eligible: units.length };
  }

  private async openDoc(doc: VotingDoc, byUserId: string, req?: any): Promise<void> {
    const societyId = String(doc.societyId);
    if (doc.type === 'ELECTION' && doc.options.length < 2) throw Errors.validation({ candidates: ['Add at least two candidates before opening'] });
    const { userIds, eligible } = await this.eligibleFor(doc);
    doc.status = 'OPEN';
    doc.startAt = new Date();
    doc.eligibleCount = eligible;
    await doc.save();
    auditService.record({ action: 'voting.opened', resource: 'Voting', resourceId: doc._id, societyId, newValue: { eligible, endAt: doc.endAt }, req });
    domainEvents.emit('voting.opened', { votingId: String(doc._id), title: doc.title, endAt: doc.endAt, userIds }, { societyId, actorId: byUserId });
  }

  async open(societyId: string, id: string, input: { endAt?: Date | null }, byUserId: string, req?: any) {
    const doc = await Voting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Voting');
    if (doc.status !== 'DRAFT') throw Errors.invalidTransition(doc.status, 'OPEN', 'Voting');
    if (input.endAt !== undefined) doc.endAt = input.endAt;
    await this.openDoc(doc, byUserId, req);
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  private computeResults(doc: VotingDoc) {
    const total = doc.voteCount;
    const turnout = doc.eligibleCount ? Math.round((total / doc.eligibleCount) * 100) : null;
    const quorumMet = doc.quorumPercent ? (turnout ?? 0) >= doc.quorumPercent : true;
    if (doc.type === 'RESOLUTION') {
      const votes = Object.fromEntries(doc.options.map((o) => [o.key, o.votes]));
      const decisive = (votes.FOR ?? 0) + (votes.AGAINST ?? 0);
      const forPct = decisive ? ((votes.FOR ?? 0) / decisive) * 100 : 0;
      const outcome = !quorumMet ? 'NO_QUORUM' : decisive === 0 ? 'INCONCLUSIVE' : forPct > doc.passThresholdPercent ? 'PASSED' : 'FAILED';
      return { outcome, turnoutPercent: turnout, quorumMet, winners: [] as string[], computedAt: new Date() };
    }
    const ranked = [...doc.options].sort((a, b) => b.votes - a.votes);
    const winners = ranked.slice(0, doc.seats).filter((o) => o.votes > 0).map((o) => o.key);
    return { outcome: !quorumMet ? 'NO_QUORUM' : winners.length ? 'ELECTED' : 'INCONCLUSIVE', turnoutPercent: turnout, quorumMet, winners, computedAt: new Date() };
  }

  private async closeDoc(doc: VotingDoc, byUserId: string | null, req?: any): Promise<void> {
    const societyId = String(doc.societyId);
    doc.status = 'CLOSED';
    doc.closedAt = new Date();
    doc.set('results', this.computeResults(doc));
    await doc.save();
    auditService.record({ action: 'voting.closed', resource: 'Voting', resourceId: doc._id, societyId, actor: byUserId ? { id: byUserId } : undefined, newValue: { votes: doc.voteCount, outcome: doc.results?.outcome } });
    const counts = Object.fromEntries(doc.options.map((o) => [o.key, o.votes]));
    domainEvents.emit('voting.closed', { votingId: String(doc._id), title: doc.title, type: doc.type, outcome: doc.results?.outcome, winners: doc.results?.winners ?? [], counts, voteCount: doc.voteCount, meetingId: doc.meetingId ? String(doc.meetingId) : null, resolutionKey: doc.resolutionKey ?? null, userIds: await audienceService.resolveUserIds(societyId, doc.audience as any) }, { societyId, actorId: byUserId });
    void req;
  }

  async close(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await Voting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Voting');
    if (doc.status !== 'OPEN') throw Errors.invalidTransition(doc.status, 'CLOSED', 'Voting');
    await this.closeDoc(doc, byUserId, req);
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  async cancel(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await Voting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Voting');
    if (!['DRAFT', 'OPEN'].includes(doc.status)) throw Errors.invalidTransition(doc.status, 'CANCELLED', 'Voting');
    doc.status = 'CANCELLED';
    doc.cancelledAt = new Date();
    await doc.save();
    auditService.record({ action: 'voting.cancelled', resource: 'Voting', resourceId: doc._id, societyId, req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await Voting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Voting');
    if (doc.status !== 'DRAFT') throw Errors.conflict('Only drafts can be deleted; cancel or close live votes instead');
    await doc.deleteOne();
    auditService.record({ action: 'voting.deleted', resource: 'Voting', resourceId: doc._id, societyId, req });
  }

  private async recount(doc: VotingDoc): Promise<void> {
    const rows = await VotingBallot.aggregate([{ $match: { votingId: doc._id } }, { $unwind: '$choices' }, { $group: { _id: '$choices', n: { $sum: 1 } } }]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r.n]));
    doc.options.forEach((o) => { o.votes = by[o.key] ?? 0; });
    doc.markModified('options');
    doc.voteCount = await VotingBallot.countDocuments({ votingId: doc._id });
    await doc.save();
  }

  async vote(societyId: string, id: string, choices: string[], actor: Actor) {
    const doc = await Voting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Voting');
    if (doc.status !== 'OPEN' || (doc.endAt && dayjs().isAfter(dayjs(doc.endAt)))) throw Errors.conflict('This vote is closed');
    const keys = [...new Set(choices)];
    const valid = new Set(doc.options.map((o) => o.key));
    if (!keys.every((k) => valid.has(k))) throw Errors.validation({ choices: ['Unknown option'] });
    if (doc.type === 'RESOLUTION' && keys.length !== 1) throw Errors.validation({ choices: ['Choose for, against or abstain'] });
    if (doc.type === 'ELECTION' && keys.length > doc.seats) throw Errors.validation({ choices: [`Choose up to ${doc.seats} candidate${doc.seats === 1 ? '' : 's'}`] });
    if (actor.ownScope && !(await audienceService.includes(societyId, actor, doc.audience as any))) throw Errors.forbidden('You are not eligible for this vote');
    const unitId = actor.unitIds[0] ?? null;
    if (doc.oneVotePerUnit) {
      if (!unitId) throw Errors.conflict('Your login is not linked to a unit; this vote is one ballot per unit');
      const other = await VotingBallot.findOne({ votingId: doc._id, unitId, userId: { $ne: actor.userId } }).select('_id').lean();
      if (other) throw Errors.conflict('A ballot has already been cast for your unit');
    }
    await VotingBallot.updateOne({ votingId: doc._id, userId: actor.userId }, { $set: { choices: keys, unitId }, $setOnInsert: { societyId, votingId: doc._id, userId: actor.userId } }, { upsert: true });
    await this.recount(doc);
    auditService.record({ action: 'voting.ballot_cast', resource: 'Voting', resourceId: doc._id, societyId, actor: { id: actor.userId }, metadata: doc.anonymous ? undefined : { choices: keys } });
    domainEvents.emit('governance.changed', { votingId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  async results(societyId: string, id: string, actor: Actor) {
    const doc: any = await Voting.findOne({ _id: id, societyId }).lean();
    if (!doc) throw Errors.notFound('Voting');
    if (!this.canSeeCounts(doc, actor)) throw Errors.forbidden('Results are published when the vote closes');
    const total = doc.voteCount;
    const results = doc.status === 'CLOSED' ? doc.results : this.computeResults(doc as any);
    const ballots = !doc.anonymous && actor.canSeeResults ? (await VotingBallot.find({ votingId: doc._id }).populate('userId', 'name').populate('unitId', 'code').lean()).map((b: any) => ({ name: b.userId?.name ?? '—', unitCode: b.unitId?.code ?? null, choices: b.choices, at: b.updatedAt })) : undefined;
    return { id: String(doc._id), title: doc.title, type: doc.type, status: doc.status, anonymous: doc.anonymous, total, eligible: doc.eligibleCount, seats: doc.seats, passThresholdPercent: doc.passThresholdPercent, quorumPercent: doc.quorumPercent, ...results, options: doc.options.map((o: any) => ({ key: o.key, label: o.label, unitCode: o.unitCode, votes: o.votes, percent: total ? Math.round((o.votes / total) * 100) : 0, winner: (results?.winners ?? []).includes(o.key) })), ballots };
  }

  /** Sweep: closes votes whose end time passed (results are computed and announced). */
  async closeEnded(now = new Date()): Promise<number> {
    const due = await Voting.find({ status: 'OPEN', endAt: { $ne: null, $lte: now } });
    for (const doc of due) await this.closeDoc(doc, null);
    return due.length;
  }
}

export const votingService = new VotingService();
