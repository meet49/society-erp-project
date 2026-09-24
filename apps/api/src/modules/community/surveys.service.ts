import dayjs from 'dayjs';
import { Survey, SurveyResponse, type SurveyDoc } from '../../models/survey.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { audienceService, type Audience, type AudienceMember } from '../../core/audience/audience.service';
import { domainEvents } from '../../core/events/event-bus';

export interface Actor extends AudienceMember { ownScope: boolean; canSeeResults: boolean }
const ALL: Audience = { type: 'ALL', buildingIds: [], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] };

class SurveyService {
  private normaliseQuestions(questions: any[]) {
    return questions.map((q, i) => ({ key: q.key || `q${i + 1}`, type: q.type, label: q.label, help: q.help, options: q.type === 'YES_NO' ? ['Yes', 'No'] : q.options ?? [], required: q.required !== false, max: q.type === 'RATING' ? q.max ?? 5 : 5 }));
  }

  private async decorate(actor: Actor, items: any[]) {
    if (!items.length) return items;
    const mine = await SurveyResponse.find({ userId: actor.userId, surveyId: { $in: items.map((s) => s._id) } }).select('surveyId answers submittedAt').lean();
    const byId = new Map(mine.map((r) => [String(r.surveyId), r]));
    return items.map((s) => ({ ...s, id: String(s._id), myResponse: byId.get(String(s._id)) ? { answers: byId.get(String(s._id))!.answers, submittedAt: byId.get(String(s._id))!.submittedAt } : null, isOpen: s.status === 'OPEN' && (!s.endAt || dayjs(s.endAt).isAfter(dayjs())) }));
  }

  private async memberFilter(societyId: string, actor: Actor) {
    return { $and: [{ status: { $in: ['OPEN', 'CLOSED'] } }, await audienceService.matchFilter(societyId, actor)] };
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const and: Record<string, unknown>[] = [{ societyId }];
    if (actor.ownScope) and.push(await this.memberFilter(societyId, actor));
    else if (query.status) and.push({ status: query.status });
    const rx = searchRegex(query.search);
    if (rx) and.push({ title: rx });
    const page = await paginate(Survey as any, { $and: and }, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'endAt', 'status', 'responseCount'], select: '-questions', populate: [{ path: 'createdBy', select: 'name' }] });
    page.items = await this.decorate(actor, page.items);
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const filter = actor.ownScope ? { _id: id, societyId, ...(await this.memberFilter(societyId, actor)) } : { _id: id, societyId };
    const doc: any = await Survey.findOne(filter).populate('createdBy', 'name').lean();
    if (!doc) throw Errors.notFound('Survey');
    const [out] = await this.decorate(actor, [doc]);
    return out;
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const audience: Audience = input.audience ?? ALL;
    const doc = new Survey({ title: input.title, description: input.description, questions: this.normaliseQuestions(input.questions), audience, audienceLabel: await audienceService.describe(societyId, audience), anonymous: input.anonymous, endAt: input.endAt ?? null, societyId, status: 'DRAFT', createdBy: byUserId });
    await doc.save();
    auditService.record({ action: 'survey.created', resource: 'Survey', resourceId: doc._id, societyId, newValue: { title: doc.title, questions: doc.questions.length }, req });
    if (input.openNow) await this.openDoc(doc, byUserId, req);
    return this.get(societyId, String(doc._id), { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await Survey.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Survey');
    if (doc.status !== 'DRAFT') {
      for (const key of ['description', 'endAt'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    } else {
      if (patch.audience) { doc.set('audience', patch.audience); doc.audienceLabel = await audienceService.describe(societyId, patch.audience); }
      if (patch.questions) doc.set('questions', this.normaliseQuestions(patch.questions));
      for (const key of ['title', 'description', 'anonymous', 'endAt'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    }
    await doc.save();
    auditService.record({ action: 'survey.updated', resource: 'Survey', resourceId: doc._id, societyId, newValue: Object.keys(patch), req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  private async openDoc(doc: SurveyDoc, byUserId: string, req?: any): Promise<void> {
    const societyId = String(doc.societyId);
    doc.status = 'OPEN';
    doc.startAt = new Date();
    doc.eligibleCount = await audienceService.count(societyId, doc.audience as any);
    await doc.save();
    auditService.record({ action: 'survey.opened', resource: 'Survey', resourceId: doc._id, societyId, newValue: { eligible: doc.eligibleCount }, req });
    domainEvents.emit('survey.opened', { surveyId: String(doc._id), title: doc.title, endAt: doc.endAt, userIds: await audienceService.resolveUserIds(societyId, doc.audience as any) }, { societyId, actorId: byUserId });
  }

  async open(societyId: string, id: string, input: { endAt?: Date | null }, byUserId: string, req?: any) {
    const doc = await Survey.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Survey');
    if (doc.status !== 'DRAFT') throw Errors.invalidTransition(doc.status, 'OPEN', 'Survey');
    if (!doc.questions.length) throw Errors.validation({ questions: ['Add at least one question'] });
    if (input.endAt !== undefined) doc.endAt = input.endAt;
    await this.openDoc(doc, byUserId, req);
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  async close(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await Survey.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Survey');
    if (doc.status !== 'OPEN') throw Errors.invalidTransition(doc.status, 'CLOSED', 'Survey');
    doc.status = 'CLOSED';
    doc.closedAt = new Date();
    await doc.save();
    auditService.record({ action: 'survey.closed', resource: 'Survey', resourceId: doc._id, societyId, newValue: { responses: doc.responseCount }, req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false, canSeeResults: true });
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await Survey.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Survey');
    if (doc.status !== 'DRAFT') throw Errors.conflict('Only draft surveys can be deleted; close live surveys instead');
    await doc.deleteOne();
    auditService.record({ action: 'survey.deleted', resource: 'Survey', resourceId: doc._id, societyId, req });
  }

  private validateAnswers(doc: SurveyDoc, answers: { questionKey: string; value: unknown }[]) {
    const fields: Record<string, string[]> = {};
    const byKey = new Map(answers.map((a) => [a.questionKey, a.value]));
    const clean: { questionKey: string; value: unknown }[] = [];
    for (const q of doc.questions) {
      const v = byKey.get(q.key);
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
      if (empty) {
        if (q.required) fields[q.key] = ['This question needs an answer'];
        continue;
      }
      switch (q.type) {
        case 'SINGLE':
        case 'YES_NO':
          if (typeof v !== 'string' || !q.options.includes(v)) fields[q.key] = ['Choose one of the options'];
          break;
        case 'MULTIPLE':
          if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && q.options.includes(x))) fields[q.key] = ['Choose from the options'];
          break;
        case 'RATING': {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 1 || n > (q.max ?? 5)) fields[q.key] = [`Rate between 1 and ${q.max ?? 5}`];
          break;
        }
        case 'TEXT':
          if (typeof v !== 'string' || v.length > 2000) fields[q.key] = ['Keep the answer under 2000 characters'];
          break;
        default:
          break;
      }
      if (!fields[q.key]) clean.push({ questionKey: q.key, value: q.type === 'RATING' ? Number(v) : v });
    }
    if (Object.keys(fields).length) throw Errors.validation(fields);
    return clean;
  }

  async respond(societyId: string, id: string, answers: { questionKey: string; value: unknown }[], actor: Actor) {
    const doc = await Survey.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Survey');
    if (doc.status !== 'OPEN' || (doc.endAt && dayjs().isAfter(dayjs(doc.endAt)))) throw Errors.conflict('This survey is closed');
    if (actor.ownScope && !(await audienceService.includes(societyId, actor, doc.audience as any))) throw Errors.forbidden('This survey is not open to you');
    const clean = this.validateAnswers(doc, answers);
    const res = await SurveyResponse.updateOne({ surveyId: doc._id, userId: actor.userId }, { $set: { answers: clean, submittedAt: new Date(), unitId: actor.unitIds[0] ?? null }, $setOnInsert: { societyId, surveyId: doc._id, userId: actor.userId } }, { upsert: true });
    if (res.upsertedCount) await Survey.updateOne({ _id: doc._id }, { $inc: { responseCount: 1 } });
    domainEvents.emit('community.changed', { surveyId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  async results(societyId: string, id: string, actor: Actor) {
    const doc: any = await Survey.findOne({ _id: id, societyId }).lean();
    if (!doc) throw Errors.notFound('Survey');
    if (!actor.canSeeResults) throw Errors.permissionDenied('surveys:results');
    const responses: any[] = await SurveyResponse.find({ surveyId: doc._id }).populate('userId', 'name').populate('unitId', 'code').lean();
    const showIdentity = !doc.anonymous;
    const questions = doc.questions.map((q: any) => {
      const values = responses.map((r) => ({ v: r.answers.find((a: any) => a.questionKey === q.key)?.value, who: showIdentity ? { name: r.userId?.name ?? '—', unitCode: r.unitId?.code ?? null } : null })).filter((x) => x.v !== undefined && x.v !== null && x.v !== '');
      const base = { key: q.key, type: q.type, label: q.label, answered: values.length };
      if (q.type === 'RATING') {
        const nums = values.map((x) => Number(x.v));
        const distribution = Array.from({ length: q.max ?? 5 }, (_, i) => ({ value: i + 1, count: nums.filter((n) => n === i + 1).length }));
        return { ...base, average: nums.length ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10 : null, distribution };
      }
      if (q.type === 'TEXT') return { ...base, answers: values.map((x) => ({ text: String(x.v), who: x.who })) };
      const counts = (q.options as string[]).map((opt) => ({ option: opt, count: values.filter((x) => (Array.isArray(x.v) ? x.v.includes(opt) : x.v === opt)).length }));
      return { ...base, options: counts.map((c) => ({ ...c, percent: values.length ? Math.round((c.count / values.length) * 100) : 0 })) };
    });
    return { id: String(doc._id), title: doc.title, status: doc.status, anonymous: doc.anonymous, responseCount: responses.length, eligible: doc.eligibleCount, turnout: doc.eligibleCount ? Math.round((responses.length / doc.eligibleCount) * 100) : null, questions };
  }

  async exportRows(societyId: string, id: string, actor: Actor) {
    const doc: any = await Survey.findOne({ _id: id, societyId }).lean();
    if (!doc) throw Errors.notFound('Survey');
    if (!actor.canSeeResults) throw Errors.permissionDenied('surveys:results');
    const responses: any[] = await SurveyResponse.find({ surveyId: doc._id }).populate('userId', 'name').populate('unitId', 'code').lean();
    return responses.map((r) => {
      const row: Record<string, unknown> = doc.anonymous ? { submittedAt: dayjs(r.submittedAt).format('YYYY-MM-DD HH:mm') } : { respondent: r.userId?.name ?? '', unit: r.unitId?.code ?? '', submittedAt: dayjs(r.submittedAt).format('YYYY-MM-DD HH:mm') };
      for (const q of doc.questions) {
        const v = r.answers.find((a: any) => a.questionKey === q.key)?.value;
        row[q.label] = Array.isArray(v) ? v.join('; ') : v ?? '';
      }
      return row;
    });
  }

  /** Sweep: closes surveys whose end time passed. */
  async closeEnded(now = new Date()): Promise<number> {
    const res = await Survey.updateMany({ status: 'OPEN', endAt: { $ne: null, $lte: now } }, { $set: { status: 'CLOSED', closedAt: now } });
    return res.modifiedCount;
  }
}

export const surveyService = new SurveyService();
