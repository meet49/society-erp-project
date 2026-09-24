import dayjs from 'dayjs';
import { Meeting, type MeetingDoc } from '../../models/meeting.model';
import { Unit } from '../../models/unit.model';
import { User } from '../../models/user.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { audienceService, type Audience, type AudienceMember } from '../../core/audience/audience.service';
import { domainEvents } from '../../core/events/event-bus';
import { votingService } from './voting.service';

export interface MeetingsConfig { reminderHours: number; agmQuorumPercent: number; memberCanSeeCommitteeMinutes: boolean }
/** `ownScope` = cannot manage meetings (residents). */
export interface Actor extends AudienceMember { ownScope: boolean }

const ALL: Audience = { type: 'ALL', buildingIds: [], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] };
const COMMITTEE: Audience = { type: 'ROLE', roleKeys: ['COMMITTEE', 'SOCIETY_ADMIN'], buildingIds: [], unitIds: [], userIds: [], residentTypes: [] };
const GENERAL = ['AGM', 'SGM'];
const icsDate = (d: Date | string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

class MeetingService {
  getConfig(societyId: string): Promise<MeetingsConfig> { return configurationService.getSocietySetting<MeetingsConfig>(societyId, 'meetings.config'); }

  async updateConfig(societyId: string, patch: Partial<MeetingsConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'meetings.config', patch, byUserId);
    auditService.record({ action: 'meetings.config_updated', resource: 'SocietySetting', resourceId: 'meetings.config', societyId, newValue: patch, req });
    return merged;
  }

  private defaultAudience(type: string): Audience { return GENERAL.includes(type) ? ALL : COMMITTEE; }

  private async eligibleCount(societyId: string, doc: { type: string; audience: any }): Promise<number> {
    if (GENERAL.includes(doc.type)) return Unit.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE' });
    return audienceService.count(societyId, doc.audience);
  }

  private present(doc: any, actor: Actor) {
    const mine = (doc.attendees ?? []).find((a: any) => String(a.userId?._id ?? a.userId) === actor.userId);
    const out: any = { ...doc, id: String(doc._id), myRsvp: mine?.rsvp ?? null, myAttendance: mine ? Boolean(mine.present) : null, rsvpCounts: { yes: (doc.attendees ?? []).filter((a: any) => a.rsvp === 'YES').length, no: (doc.attendees ?? []).filter((a: any) => a.rsvp === 'NO').length, maybe: (doc.attendees ?? []).filter((a: any) => a.rsvp === 'MAYBE').length } };
    if (actor.ownScope) {
      if (!doc.minutes?.publishedAt) { out.minutes = doc.minutes?.recordedAt ? { recordedAt: doc.minutes.recordedAt, publishedAt: null } : undefined; out.resolutions = []; }
      out.attendees = undefined;
    }
    return out;
  }

  private async memberFilter(societyId: string, actor: Actor) {
    return audienceService.matchFilter(societyId, actor);
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const and: Record<string, unknown>[] = [{ societyId }];
    if (actor.ownScope) and.push(await this.memberFilter(societyId, actor));
    if (query.status) and.push({ status: query.status });
    if (query.type) and.push({ type: query.type });
    if (query.upcoming) and.push({ status: { $in: ['SCHEDULED', 'IN_PROGRESS'] }, scheduledAt: { $gte: dayjs().subtract(6, 'hour').toDate() } });
    if (query.from || query.to) and.push({ scheduledAt: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } });
    const rx = searchRegex(query.search);
    if (rx) and.push({ $or: [{ title: rx }, { meetingNumber: rx }, { venue: rx }] });
    const page = await paginate(Meeting as any, { $and: and }, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: query.upcoming ? 'scheduledAt' : '-scheduledAt', allowedSorts: ['scheduledAt', 'createdAt', 'title', 'status', 'type'], select: '-minutes.body -agenda -resolutions', populate: [{ path: 'createdBy', select: 'name' }] });
    page.items = page.items.map((m: any) => this.present(m, actor));
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const filter = actor.ownScope ? { $and: [{ _id: id, societyId }, await this.memberFilter(societyId, actor)] } : { _id: id, societyId };
    const doc: any = await Meeting.findOne(filter).populate('createdBy', 'name').populate('attendees.userId', 'name').populate('attendees.unitId', 'code').populate('minutes.recordedBy', 'name').lean();
    if (!doc) throw Errors.notFound('Meeting');
    return this.present(doc, actor);
  }

  private agendaWithKeys(agenda: any[] = [], existing: any[] = []) {
    return agenda.map((a, i) => ({ ...a, key: a.key || `a${i + 1}`, outcome: existing.find((e) => e.key === a.key)?.outcome ?? a.outcome }));
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const cfg = await this.getConfig(societyId);
    const type = input.type ?? 'COMMITTEE';
    const audience: Audience = input.audience ?? this.defaultAudience(type);
    const doc = new Meeting({
      ...input,
      meetingLink: input.meetingLink || undefined,
      societyId,
      meetingNumber: await sequenceService.next(societyId, 'meeting', { prefix: 'MTG', padding: 4, resetPolicy: 'YEARLY' }),
      type,
      audience,
      audienceLabel: await audienceService.describe(societyId, audience),
      agenda: this.agendaWithKeys(input.agenda),
      quorum: { percent: input.quorumPercent ?? (GENERAL.includes(type) ? cfg.agmQuorumPercent : 0), eligible: 0, present: 0, met: false },
      status: 'SCHEDULED',
      createdBy: byUserId,
    });
    doc.quorum!.eligible = await this.eligibleCount(societyId, doc);
    await doc.save();
    auditService.record({ action: 'meeting.scheduled', resource: 'Meeting', resourceId: doc._id, societyId, newValue: { meetingNumber: doc.meetingNumber, title: doc.title, type, scheduledAt: doc.scheduledAt }, req });
    if (input.notify !== false) domainEvents.emit('meeting.scheduled', { meetingId: String(doc._id), title: doc.title, type, scheduledAt: doc.scheduledAt, venue: doc.venue ?? '', userIds: await audienceService.resolveUserIds(societyId, audience) }, { societyId, actorId: byUserId });
    return this.get(societyId, String(doc._id), { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await Meeting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Meeting');
    if (['COMPLETED', 'CANCELLED'].includes(doc.status)) throw Errors.conflict('Completed or cancelled meetings cannot be edited');
    if (patch.audience) { doc.set('audience', patch.audience); doc.audienceLabel = await audienceService.describe(societyId, patch.audience); }
    if (patch.agenda) doc.set('agenda', this.agendaWithKeys(patch.agenda, doc.agenda as any));
    for (const key of ['title', 'type', 'description', 'scheduledAt', 'endAt', 'venue', 'mode', 'attachments'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    if (patch.meetingLink !== undefined) doc.meetingLink = patch.meetingLink || undefined;
    if (patch.quorumPercent !== undefined) doc.set('quorum.percent', patch.quorumPercent);
    if (patch.type || patch.audience) doc.set('quorum.eligible', await this.eligibleCount(societyId, doc));
    await doc.save();
    auditService.record({ action: 'meeting.updated', resource: 'Meeting', resourceId: doc._id, societyId, newValue: Object.keys(patch), req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async rsvp(societyId: string, id: string, rsvp: string, actor: Actor) {
    const doc = await Meeting.findOne({ _id: id, societyId, status: 'SCHEDULED' });
    if (!doc) throw Errors.notFound('Meeting');
    if (actor.ownScope && !(await audienceService.includes(societyId, actor, doc.audience as any))) throw Errors.forbidden('You are not invited to this meeting');
    const existing: any = doc.attendees.find((a: any) => String(a.userId) === actor.userId);
    if (existing) existing.rsvp = rsvp;
    else {
      const user = await User.findById(actor.userId).select('name').lean();
      doc.attendees.push({ userId: actor.userId, unitId: actor.unitIds[0] ?? null, name: user?.name ?? '', rsvp } as any);
    }
    doc.markModified('attendees');
    await doc.save();
    return this.get(societyId, id, actor);
  }

  async start(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await Meeting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Meeting');
    if (doc.status !== 'SCHEDULED') throw Errors.invalidTransition(doc.status, 'IN_PROGRESS', 'Meeting');
    doc.status = 'IN_PROGRESS';
    doc.startedAt = new Date();
    await doc.save();
    auditService.record({ action: 'meeting.started', resource: 'Meeting', resourceId: doc._id, societyId, req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  private recomputeQuorum(doc: MeetingDoc): void {
    const present = doc.attendees.filter((a) => a.present);
    const count = GENERAL.includes(doc.type) ? new Set(present.map((a) => (a.unitId ? String(a.unitId) : `${a.name}`))).size : present.length;
    doc.set('quorum.present', count);
    doc.set('quorum.met', doc.quorum?.percent ? (doc.quorum.eligible ? (count / doc.quorum.eligible) * 100 : 0) >= doc.quorum.percent : true);
  }

  /** Secretary marks who was present (people or units for general meetings), including proxies. */
  async markAttendance(societyId: string, id: string, rows: { userId?: string | null; unitId?: string | null; name?: string; present: boolean; proxyFor?: string }[], byUserId: string, req?: any) {
    const doc = await Meeting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Meeting');
    if (doc.status === 'CANCELLED') throw Errors.conflict('The meeting was cancelled');
    for (const row of rows) {
      const match: any = doc.attendees.find((a: any) => (row.userId && String(a.userId) === row.userId) || (row.unitId && String(a.unitId) === row.unitId && !row.userId) || (!row.userId && !row.unitId && row.name && a.name === row.name));
      if (match) { match.present = row.present; match.proxyFor = row.proxyFor; match.markedAt = new Date(); }
      else doc.attendees.push({ userId: row.userId ?? null, unitId: row.unitId ?? null, name: row.name ?? '', present: row.present, proxyFor: row.proxyFor, markedAt: new Date() } as any);
    }
    doc.markModified('attendees');
    this.recomputeQuorum(doc);
    await doc.save();
    auditService.record({ action: 'meeting.attendance_marked', resource: 'Meeting', resourceId: doc._id, societyId, newValue: { present: doc.quorum?.present, eligible: doc.quorum?.eligible, met: doc.quorum?.met }, req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async recordMinutes(societyId: string, id: string, input: Record<string, any>, byUserId: string, req?: any) {
    const doc = await Meeting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Meeting');
    if (doc.status === 'CANCELLED') throw Errors.conflict('The meeting was cancelled');
    doc.set('minutes.body', input.body);
    doc.set('minutes.recordedBy', byUserId);
    doc.set('minutes.recordedAt', new Date());
    for (const o of input.agendaOutcomes ?? []) { const item: any = doc.agenda.find((a: any) => a.key === o.key); if (item) item.outcome = o.outcome; }
    if (input.resolutions) {
      const existing = doc.resolutions as any[];
      doc.set('resolutions', input.resolutions.map((r: any, i: number) => { const prev = existing.find((e) => e.key === r.key); return { ...r, key: r.key || `r${i + 1}`, outcome: r.outcome ?? prev?.outcome ?? 'PENDING', votesFor: r.votesFor ?? prev?.votesFor ?? 0, votesAgainst: r.votesAgainst ?? prev?.votesAgainst ?? 0, abstained: r.abstained ?? prev?.abstained ?? 0, votingId: prev?.votingId ?? null }; }));
    }
    doc.markModified('agenda');
    if (input.complete !== false) {
      doc.status = 'COMPLETED';
      doc.completedAt = doc.completedAt ?? new Date();
    }
    await doc.save();
    auditService.record({ action: 'meeting.minutes_recorded', resource: 'Meeting', resourceId: doc._id, societyId, newValue: { resolutions: doc.resolutions.length, completed: doc.status === 'COMPLETED' }, req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async publishMinutes(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await Meeting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Meeting');
    if (!doc.minutes?.body) throw Errors.conflict('Record the minutes first');
    doc.set('minutes.publishedAt', new Date());
    await doc.save();
    auditService.record({ action: 'meeting.minutes_published', resource: 'Meeting', resourceId: doc._id, societyId, req });
    domainEvents.emit('meeting.minutes_published', { meetingId: String(doc._id), title: doc.title, userIds: await audienceService.resolveUserIds(societyId, doc.audience as any) }, { societyId, actorId: byUserId });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async cancel(societyId: string, id: string, reason: string | undefined, byUserId: string, req?: any) {
    const doc = await Meeting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Meeting');
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(doc.status)) throw Errors.invalidTransition(doc.status, 'CANCELLED', 'Meeting');
    doc.status = 'CANCELLED';
    doc.cancelledAt = new Date();
    doc.cancelReason = reason;
    await doc.save();
    auditService.record({ action: 'meeting.cancelled', resource: 'Meeting', resourceId: doc._id, societyId, newValue: { reason }, req });
    domainEvents.emit('meeting.cancelled', { meetingId: String(doc._id), title: doc.title, scheduledAt: doc.scheduledAt, reason: reason ?? '', userIds: await audienceService.resolveUserIds(societyId, doc.audience as any) }, { societyId, actorId: byUserId });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await Meeting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Meeting');
    if (doc.status !== 'SCHEDULED' || doc.minutes?.body) throw Errors.conflict('Only scheduled meetings without minutes can be deleted; cancel instead');
    await doc.deleteOne();
    auditService.record({ action: 'meeting.deleted', resource: 'Meeting', resourceId: doc._id, societyId, req });
  }

  /** Opens a formal e-vote for one resolution; the outcome flows back when the vote closes. */
  async openResolutionVote(societyId: string, id: string, input: { resolutionKey: string; endAt: Date; audience?: Audience }, byUserId: string, req?: any) {
    const doc = await Meeting.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Meeting');
    const resolution: any = doc.resolutions.find((r: any) => r.key === input.resolutionKey);
    if (!resolution) throw Errors.notFound('Resolution');
    if (resolution.votingId) throw Errors.conflict('A vote is already open for this resolution');
    const voting = await votingService.create(societyId, { title: resolution.title, description: resolution.description, type: 'RESOLUTION', audience: input.audience ?? doc.audience, endAt: input.endAt, openNow: true, meetingId: doc._id, resolutionKey: resolution.key }, byUserId, req);
    resolution.votingId = voting.id;
    doc.markModified('resolutions');
    await doc.save();
    return voting;
  }

  /** Called when a linked vote closes: copies counts and outcome onto the resolution. */
  async applyVotingOutcome(societyId: string, meetingId: string, resolutionKey: string, counts: Record<string, number>, outcome: string): Promise<void> {
    const doc = await Meeting.findOne({ _id: meetingId, societyId });
    if (!doc) return;
    const resolution: any = doc.resolutions.find((r: any) => r.key === resolutionKey);
    if (!resolution) return;
    resolution.votesFor = counts.FOR ?? 0;
    resolution.votesAgainst = counts.AGAINST ?? 0;
    resolution.abstained = counts.ABSTAIN ?? 0;
    resolution.outcome = outcome === 'PASSED' ? 'PASSED' : outcome === 'FAILED' ? 'FAILED' : 'DEFERRED';
    doc.markModified('resolutions');
    await doc.save();
  }

  /** iCalendar export so residents can add the meeting to their phone calendar. */
  async ics(societyId: string, id: string, actor: Actor): Promise<string> {
    const m = await this.get(societyId, id, actor);
    const end = m.endAt ?? dayjs(m.scheduledAt).add(2, 'hour').toDate();
    const esc = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Society ERP//Meetings//EN', 'BEGIN:VEVENT', `UID:${m.id}@society-erp`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(m.scheduledAt)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${esc(m.title)}`, `LOCATION:${esc(m.venue ?? (m.mode === 'ONLINE' ? m.meetingLink ?? 'Online' : ''))}`, `DESCRIPTION:${esc((m.agenda ?? []).map((a: any, i: number) => `${i + 1}. ${a.title}`).join('\n') || m.description || '')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }

  async stats(societyId: string) {
    const now = new Date();
    const [upcoming, pendingMinutes, thisYear, next] = await Promise.all([
      Meeting.countDocuments({ societyId, status: 'SCHEDULED', scheduledAt: { $gte: now } }),
      Meeting.countDocuments({ societyId, status: 'COMPLETED', 'minutes.publishedAt': null }),
      Meeting.countDocuments({ societyId, status: 'COMPLETED', scheduledAt: { $gte: dayjs().startOf('year').toDate() } }),
      Meeting.findOne({ societyId, status: 'SCHEDULED', scheduledAt: { $gte: now } }).sort({ scheduledAt: 1 }).select('title type scheduledAt venue meetingNumber').lean(),
    ]);
    return { upcoming, pendingMinutes, completedThisYear: thisYear, next: next ? { ...next, id: String(next._id) } : null };
  }

  /** Sweep: reminders `reminderHours` before the meeting, once. */
  async sendReminders(now = new Date()): Promise<number> {
    let sent = 0;
    const due = await Meeting.find({ status: 'SCHEDULED', reminderSentAt: null, scheduledAt: { $gt: now, $lte: dayjs(now).add(7, 'day').toDate() } });
    for (const doc of due) {
      const cfg = await this.getConfig(String(doc.societyId));
      if (dayjs(doc.scheduledAt).diff(dayjs(now), 'hour', true) > cfg.reminderHours) continue;
      doc.reminderSentAt = now;
      await doc.save();
      domainEvents.emit('meeting.reminder', { meetingId: String(doc._id), title: doc.title, scheduledAt: doc.scheduledAt, venue: doc.venue ?? '', userIds: await audienceService.resolveUserIds(String(doc.societyId), doc.audience as any) }, { societyId: String(doc.societyId) });
      sent += 1;
    }
    return sent;
  }
}

export const meetingService = new MeetingService();
