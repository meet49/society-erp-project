import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { ErrorCodes } from '@society-erp/shared';
import { Complaint, type ComplaintDoc } from '../../models/complaint.model';
import { Unit } from '../../models/unit.model';
import { Resident } from '../../models/resident.model';
import { User } from '../../models/user.model';
import { Role } from '../../models/role.model';
import { UserRole } from '../../models/user-role.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { domainEvents } from '../../core/events/event-bus';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { logger } from '../../lib/logger';

type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
type SlaConfig = Record<Priority, { responseMinutes: number; resolutionMinutes: number }>;
interface EscalationConfig { levels: { level: number; afterMinutesPastDue: number; notifyRoleKeys: string[]; notifyUserIds: string[] }[] }
interface ComplaintsConfig { autoCloseAfterResolvedDays: number; allowReopenDays: number; memberCanRate: boolean; defaultPriority: Priority }

export interface Actor { userId: string; ownScope: boolean; unitIds: string[]; residentId?: string | null; canViewInternal: boolean }
const OPEN = ['OPEN', 'IN_PROGRESS', 'REOPENED'];

/** Allowed status transitions (configurable later per society; sensible defaults now). */
const TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'OPEN', 'CLOSED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  REOPENED: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  CLOSED: ['REOPENED'],
};

class ComplaintService {
  // ------------------------------------------------------------------ config
  getConfig(societyId: string) { return configurationService.getSocietySetting<ComplaintsConfig>(societyId, 'complaints.config'); }
  getSla(societyId: string) { return configurationService.getSocietySetting<SlaConfig>(societyId, 'complaints.sla'); }
  getEscalation(societyId: string) { return configurationService.getSocietySetting<EscalationConfig>(societyId, 'complaints.escalation'); }

  async settings(societyId: string) {
    const [config, sla, escalation] = await Promise.all([this.getConfig(societyId), this.getSla(societyId), this.getEscalation(societyId)]);
    return { config, sla, escalation };
  }

  async updateSettings(societyId: string, input: { config?: Partial<ComplaintsConfig>; sla?: SlaConfig; escalation?: EscalationConfig }, byUserId: string, req?: any) {
    if (input.config) await configurationService.setSocietySetting(societyId, 'complaints.config', input.config, byUserId);
    if (input.sla) await configurationService.setSocietySetting(societyId, 'complaints.sla', input.sla, byUserId);
    if (input.escalation) await configurationService.setSocietySetting(societyId, 'complaints.escalation', input.escalation, byUserId);
    auditService.record({ action: 'complaints.settings_updated', resource: 'SocietySetting', resourceId: 'complaints', societyId, newValue: input, req });
    return this.settings(societyId);
  }

  private async applySla(doc: ComplaintDoc, priority: Priority, from = new Date()): Promise<void> {
    const sla = await this.getSla(String(doc.societyId));
    const target = sla[priority] ?? sla.NORMAL;
    doc.sla = { ...(doc.sla ?? {}), responseMinutes: target.responseMinutes, resolutionMinutes: target.resolutionMinutes, responseDueAt: dayjs(from).add(target.responseMinutes, 'minute').toDate(), resolutionDueAt: dayjs(from).add(target.resolutionMinutes, 'minute').toDate() } as any;
  }

  private history(doc: ComplaintDoc, action: string, userId: string | null, extra: { from?: string; to?: string; note?: string } = {}) {
    doc.history.push({ at: new Date(), userId, action, ...extra } as any);
  }

  private scopeFilter(actor: Actor): Record<string, unknown> {
    if (!actor.ownScope) return {};
    return { $or: [{ raisedBy: actor.userId }, ...(actor.unitIds.length ? [{ unitId: { $in: actor.unitIds } }] : []), { isPublic: true }] };
  }

  private present(doc: any, actor: Actor) {
    const out = { ...doc, id: String(doc._id) };
    if (!actor.canViewInternal) out.comments = (doc.comments ?? []).filter((c: any) => !c.internal);
    return out;
  }

  // ------------------------------------------------------------------ create & read
  async create(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    const cfg = await this.getConfig(societyId);
    let unitId: any = null;
    let residentId: any = actor.residentId ?? null;
    if (actor.ownScope) {
      unitId = input.unitId && actor.unitIds.includes(input.unitId) ? input.unitId : (actor.unitIds[0] ?? null);
    } else if (input.unitId) {
      const unit = await Unit.findOne({ _id: input.unitId, societyId, deletedAt: null }).select('_id').lean();
      if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
      unitId = unit._id;
      const primary = await Resident.findOne({ societyId, unitId, status: 'ACTIVE', deletedAt: null }).sort({ isPrimary: -1 }).select('_id').lean();
      residentId = primary?._id ?? null;
    } else if (actor.unitIds.length) {
      // a resident who also holds helpdesk permissions raises it against their own unit by default
      unitId = actor.unitIds[0];
    }
    const priority: Priority = (input.priority as Priority) ?? cfg.defaultPriority ?? 'NORMAL';
    const doc = new Complaint({ ...input, societyId, ticketNumber: await sequenceService.next(societyId, 'complaint', { prefix: 'TKT', padding: 5, resetPolicy: 'YEARLY' }), categoryKey: String(input.categoryKey).toUpperCase(), priority, unitId, residentId, raisedBy: actor.userId, onBehalf: !actor.ownScope && Boolean(input.unitId) && !actor.unitIds.includes(String(unitId)), status: 'OPEN' });
    await this.applySla(doc, priority);
    this.history(doc, 'created', actor.userId);
    await doc.save();
    auditService.record({ action: 'complaint.created', resource: 'Complaint', resourceId: doc._id, societyId, newValue: { ticketNumber: doc.ticketNumber, category: doc.categoryKey, priority }, req });
    const unit = unitId ? await Unit.findById(unitId).select('code').lean() : null;
    domainEvents.emit('complaint.created', { complaintId: String(doc._id), ticketNumber: doc.ticketNumber, title: doc.title, priority, categoryKey: doc.categoryKey, unitId: unitId ? String(unitId) : null, unitCode: unit?.code, raisedBy: actor.userId }, { societyId, actorId: actor.userId });
    return doc.toJSON();
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const filter: Record<string, unknown> = { societyId, ...this.scopeFilter(actor) };
    if (query.status) filter.status = query.status;
    if (query.openOnly) filter.status = { $in: OPEN };
    if (query.priority) filter.priority = query.priority;
    if (query.categoryKey) filter.categoryKey = String(query.categoryKey).toUpperCase();
    if (query.unitId) filter.unitId = query.unitId;
    if (query.assignedTo === 'me') filter.assignedTo = actor.userId;
    else if (query.assignedTo === 'unassigned') filter.assignedTo = null;
    else if (query.assignedTo) filter.assignedTo = query.assignedTo;
    if (query.breachedOnly) filter.$and = [{ status: { $in: OPEN } }, { $or: [{ 'sla.resolutionBreached': true }, { 'sla.responseBreached': true }] }];
    if (query.from || query.to) filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    const rx = searchRegex(query.search);
    if (rx) filter.$and = [...((filter.$and as any[]) ?? []), { $or: [{ ticketNumber: rx }, { title: rx }, { location: rx }] }];
    const page = await paginate(Complaint as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'priority', 'status', 'sla.resolutionDueAt', 'updatedAt'], select: '-comments -history', populate: [{ path: 'unitId', select: 'code' }, { path: 'assignedTo', select: 'name' }, { path: 'raisedBy', select: 'name' }] });
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const doc = await Complaint.findOne({ _id: id, societyId, ...this.scopeFilter(actor) }).populate('unitId', 'code buildingId').populate('assignedTo', 'name email phone').populate('raisedBy', 'name').populate('resolvedBy', 'name').populate('comments.userId', 'name').populate('history.userId', 'name').populate('assignedVendorId', 'name phone').lean();
    if (!doc) throw Errors.notFound('Complaint');
    return this.present(doc, actor);
  }

  // ------------------------------------------------------------------ updates
  async update(societyId: string, id: string, patch: Record<string, any>, actor: Actor, req?: any) {
    const doc = await Complaint.findOne({ _id: id, societyId, ...this.scopeFilter(actor) });
    if (!doc) throw Errors.notFound('Complaint');
    if (actor.ownScope) {
      if (String(doc.raisedBy) !== actor.userId) throw Errors.forbidden('Only the person who raised the complaint can edit it');
      if (!OPEN.includes(doc.status)) throw Errors.conflict('Resolved complaints cannot be edited');
      patch = { title: patch.title, description: patch.description, location: patch.location, categoryKey: patch.categoryKey, isPublic: patch.isPublic };
    }
    const prevPriority = doc.priority;
    if (patch.categoryKey) patch.categoryKey = String(patch.categoryKey).toUpperCase();
    doc.set(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    if (patch.priority && patch.priority !== prevPriority) {
      await this.applySla(doc, patch.priority, doc.createdAt ?? new Date());
      this.history(doc, 'priority_changed', actor.userId, { from: prevPriority, to: patch.priority });
    }
    await doc.save();
    auditService.record({ action: 'complaint.updated', resource: 'Complaint', resourceId: doc._id, societyId, newValue: patch, req });
    return doc.toJSON();
  }

  async assign(societyId: string, id: string, input: { assignedTo?: string | null; assignedStaffId?: string | null; assignedVendorId?: string | null; note?: string }, byUserId: string, req?: any) {
    const doc = await Complaint.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Complaint');
    if (input.assignedTo) {
      const user = await User.findById(input.assignedTo).select('name').lean();
      if (!user) throw Errors.validation({ assignedTo: ['Unknown user'] });
    }
    const previous = doc.assignedTo ? String(doc.assignedTo) : null;
    if (input.assignedTo !== undefined) doc.assignedTo = (input.assignedTo || null) as any;
    if (input.assignedStaffId !== undefined) doc.assignedStaffId = (input.assignedStaffId || null) as any;
    if (input.assignedVendorId !== undefined) doc.assignedVendorId = (input.assignedVendorId || null) as any;
    doc.assignedAt = new Date();
    if (doc.status === 'OPEN' && (doc.assignedTo || doc.assignedStaffId || doc.assignedVendorId)) {
      doc.status = 'IN_PROGRESS';
      this.history(doc, 'status_changed', byUserId, { from: 'OPEN', to: 'IN_PROGRESS' });
    }
    if (!doc.sla?.firstResponseAt) this.markFirstResponse(doc);
    this.history(doc, 'assigned', byUserId, { from: previous ?? undefined, to: doc.assignedTo ? String(doc.assignedTo) : undefined, note: input.note });
    await doc.save();
    auditService.record({ action: 'complaint.assigned', resource: 'Complaint', resourceId: doc._id, societyId, newValue: { assignedTo: input.assignedTo, staff: input.assignedStaffId, vendor: input.assignedVendorId }, req });
    if (doc.assignedTo) {
      const assignee = await User.findById(doc.assignedTo).select('name').lean();
      domainEvents.emit('complaint.assigned', { complaintId: String(doc._id), ticketNumber: doc.ticketNumber, title: doc.title, assignedTo: String(doc.assignedTo), assigneeName: assignee?.name, raisedBy: String(doc.raisedBy), unitId: doc.unitId ? String(doc.unitId) : null }, { societyId, actorId: byUserId });
    }
    return doc.toJSON();
  }

  private markFirstResponse(doc: ComplaintDoc) {
    const now = new Date();
    doc.sla = { ...(doc.sla as any), firstResponseAt: now, responseBreached: doc.sla?.responseDueAt ? now > doc.sla.responseDueAt : false } as any;
  }

  async changeStatus(societyId: string, id: string, input: { status: string; note?: string }, actor: Actor, req?: any) {
    const doc = await Complaint.findOne({ _id: id, societyId, ...this.scopeFilter(actor) });
    if (!doc) throw Errors.notFound('Complaint');
    const cfg = await this.getConfig(societyId);
    const from = doc.status;
    const to = input.status;
    if (actor.ownScope) {
      // residents may close their own resolved tickets or reopen within the window
      if (String(doc.raisedBy) !== actor.userId) throw Errors.forbidden('Only the person who raised the complaint can do that');
      if (!(to === 'CLOSED' && from === 'RESOLVED') && !(to === 'REOPENED' && ['RESOLVED', 'CLOSED'].includes(from))) throw Errors.forbidden('Residents can close a resolved complaint or reopen it');
    }
    if (!TRANSITIONS[from]?.includes(to)) throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `A ${from.toLowerCase().replace('_', ' ')} complaint cannot move to ${to.toLowerCase().replace('_', ' ')}`);
    if (to === 'REOPENED') {
      const since = doc.closedAt ?? doc.resolvedAt ?? new Date();
      if (cfg.allowReopenDays > 0 && dayjs().diff(dayjs(since), 'day') > cfg.allowReopenDays) throw Errors.conflict(`Complaints can only be reopened within ${cfg.allowReopenDays} days`);
      doc.reopenedCount += 1;
      doc.resolvedAt = undefined;
      doc.closedAt = undefined;
      doc.sla = { ...(doc.sla as any), resolutionBreached: false } as any;
      await this.applySla(doc, doc.priority as Priority);
    }
    if (to === 'RESOLVED') {
      doc.resolvedAt = new Date();
      doc.resolvedBy = actor.userId as any;
      doc.resolutionNote = input.note;
      doc.sla = { ...(doc.sla as any), resolutionBreached: doc.sla?.resolutionDueAt ? new Date() > doc.sla.resolutionDueAt : false } as any;
      if (!doc.sla?.firstResponseAt) this.markFirstResponse(doc);
    }
    if (to === 'CLOSED') {
      doc.closedAt = new Date();
      doc.closedBy = actor.userId as any;
      if (!doc.resolvedAt) doc.resolvedAt = new Date();
    }
    if (to === 'IN_PROGRESS' && !doc.sla?.firstResponseAt) this.markFirstResponse(doc);
    doc.status = to as any;
    this.history(doc, 'status_changed', actor.userId, { from, to, note: input.note });
    await doc.save();
    auditService.record({ action: `complaint.${to.toLowerCase()}`, resource: 'Complaint', resourceId: doc._id, societyId, newValue: { from, to, note: input.note }, req });
    domainEvents.emit('complaint.updated', { complaintId: String(doc._id), ticketNumber: doc.ticketNumber, title: doc.title, status: to, from, note: input.note, raisedBy: String(doc.raisedBy), assignedTo: doc.assignedTo ? String(doc.assignedTo) : null, unitId: doc.unitId ? String(doc.unitId) : null }, { societyId, actorId: actor.userId });
    return doc.toJSON();
  }

  async comment(societyId: string, id: string, input: { body: string; internal?: boolean; attachments?: any[] }, actor: Actor, _req?: any) {
    const doc = await Complaint.findOne({ _id: id, societyId, ...this.scopeFilter(actor) });
    if (!doc) throw Errors.notFound('Complaint');
    const internal = Boolean(input.internal) && actor.canViewInternal;
    doc.comments.push({ userId: actor.userId, body: input.body, internal, attachments: input.attachments ?? [], at: new Date() } as any);
    const staffReply = !actor.ownScope && String(doc.raisedBy) !== actor.userId;
    if (staffReply && !internal && !doc.sla?.firstResponseAt) this.markFirstResponse(doc);
    await doc.save();
    if (!internal) domainEvents.emit('complaint.commented', { complaintId: String(doc._id), ticketNumber: doc.ticketNumber, title: doc.title, excerpt: input.body.slice(0, 140), byUserId: actor.userId, raisedBy: String(doc.raisedBy), assignedTo: doc.assignedTo ? String(doc.assignedTo) : null, staffReply }, { societyId, actorId: actor.userId });
    const fresh = await this.get(societyId, id, actor);
    return fresh;
  }

  async rate(societyId: string, id: string, input: { score: number; comment?: string }, actor: Actor, req?: any) {
    const cfg = await this.getConfig(societyId);
    if (!cfg.memberCanRate) throw Errors.forbidden('Ratings are disabled for this society');
    const doc = await Complaint.findOne({ _id: id, societyId, raisedBy: actor.userId });
    if (!doc) throw Errors.notFound('Complaint');
    if (!['RESOLVED', 'CLOSED'].includes(doc.status)) throw Errors.conflict('Only resolved complaints can be rated');
    doc.set('rating', { score: input.score, comment: input.comment, at: new Date() });
    this.history(doc, 'rated', actor.userId, { note: `${input.score}/5` });
    await doc.save();
    auditService.record({ action: 'complaint.rated', resource: 'Complaint', resourceId: doc._id, societyId, newValue: input, req });
    return doc.toJSON();
  }

  // ------------------------------------------------------------------ stats & export
  async stats(societyId: string, actor?: Actor) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const scope = actor?.ownScope ? { $or: [{ raisedBy: new mongoose.Types.ObjectId(actor.userId) }, ...(actor.unitIds.length ? [{ unitId: { $in: actor.unitIds.map((u) => new mongoose.Types.ObjectId(u)) } }] : [])] } : {};
    const now = new Date();
    const [byStatus, byCategory, breached, resolvedRecently, ratings, unassigned, aging] = await Promise.all([
      Complaint.aggregate([{ $match: { societyId: sid, ...scope } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Complaint.aggregate([{ $match: { societyId: sid, ...scope, status: { $in: OPEN } } }, { $group: { _id: '$categoryKey', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
      Complaint.countDocuments({ societyId, ...scope, status: { $in: OPEN }, $or: [{ 'sla.resolutionDueAt': { $lt: now } }, { 'sla.responseBreached': true }] }),
      Complaint.aggregate([{ $match: { societyId: sid, ...scope, resolvedAt: { $gte: dayjs().subtract(30, 'day').toDate() } } }, { $project: { hours: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3_600_000] }, breached: '$sla.resolutionBreached' } }, { $group: { _id: null, avgHours: { $avg: '$hours' }, count: { $sum: 1 }, breached: { $sum: { $cond: ['$breached', 1, 0] } } } }]),
      Complaint.aggregate([{ $match: { societyId: sid, ...scope, 'rating.score': { $gte: 1 } } }, { $group: { _id: null, avg: { $avg: '$rating.score' }, count: { $sum: 1 } } }]),
      Complaint.countDocuments({ societyId, ...scope, status: { $in: OPEN }, assignedTo: null }),
      Complaint.aggregate([{ $match: { societyId: sid, ...scope, status: { $in: OPEN } } }, { $project: { days: { $divide: [{ $subtract: [now, '$createdAt'] }, 86_400_000] } } }, { $bucket: { groupBy: '$days', boundaries: [0, 1, 3, 7, 30, 10000], default: 'other', output: { count: { $sum: 1 } } } }]),
    ]);
    const status = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    const open = OPEN.reduce((s, k) => s + (status[k] ?? 0), 0);
    return { open, byStatus: status, byCategory: byCategory.map((c) => ({ category: c._id, count: c.count })), breached, unassigned, resolved30d: resolvedRecently[0]?.count ?? 0, avgResolutionHours: resolvedRecently[0]?.avgHours != null ? Math.round(resolvedRecently[0].avgHours * 10) / 10 : null, slaCompliance: resolvedRecently[0]?.count ? Math.round(((resolvedRecently[0].count - resolvedRecently[0].breached) / resolvedRecently[0].count) * 100) : null, rating: ratings[0] ? { avg: Math.round(ratings[0].avg * 10) / 10, count: ratings[0].count } : null, aging: aging.map((b) => ({ bucket: b._id, count: b.count })) };
  }

  async exportRows(societyId: string, query: Record<string, any>, actor: Actor) {
    const rows: any[] = [];
    let page = 1;
    while (rows.length < 5000) {
      const res = await this.list(societyId, { ...query, page, limit: 200 }, actor);
      rows.push(...res.items.map((c: any) => ({ ticket: c.ticketNumber, title: c.title, category: c.categoryKey, priority: c.priority, status: c.status, unit: c.unitId?.code ?? '', raisedBy: c.raisedBy?.name ?? '', assignedTo: c.assignedTo?.name ?? '', created: dayjs(c.createdAt).format('YYYY-MM-DD HH:mm'), resolutionDue: c.sla?.resolutionDueAt ? dayjs(c.sla.resolutionDueAt).format('YYYY-MM-DD HH:mm') : '', resolved: c.resolvedAt ? dayjs(c.resolvedAt).format('YYYY-MM-DD HH:mm') : '', slaBreached: c.sla?.resolutionBreached ? 'yes' : 'no', escalationLevel: c.escalationLevel, rating: c.rating?.score ?? '' })));
      if (page >= res.pages) break;
      page += 1;
    }
    return rows;
  }

  // ------------------------------------------------------------------ jobs
  /** SLA sweep: flags breaches and escalates open tickets through the configured levels (idempotent per level). */
  async escalateOverdue(now = new Date()): Promise<{ breached: number; escalated: number }> {
    const result = { breached: 0, escalated: 0 };
    const societies = await Complaint.distinct('societyId', { status: { $in: OPEN } });
    for (const sid of societies) {
      const societyId = String(sid);
      const escalation = await this.getEscalation(societyId);
      const levels = [...(escalation.levels ?? [])].sort((a, b) => a.level - b.level);
      const open = await Complaint.find({ societyId, status: { $in: OPEN } });
      for (const doc of open) {
        let changed = false;
        if (!doc.sla?.firstResponseAt && doc.sla?.responseDueAt && now > doc.sla.responseDueAt && !doc.sla.responseBreached) {
          doc.sla.responseBreached = true;
          changed = true;
        }
        if (doc.sla?.resolutionDueAt && now > doc.sla.resolutionDueAt && !doc.sla.resolutionBreached) {
          doc.sla.resolutionBreached = true;
          result.breached += 1;
          changed = true;
        }
        if (doc.sla?.resolutionDueAt) {
          const minutesPastDue = dayjs(now).diff(dayjs(doc.sla.resolutionDueAt), 'minute');
          for (const level of levels) {
            if (level.level <= doc.escalationLevel || minutesPastDue < level.afterMinutesPastDue) continue;
            const notified = await this.notifyEscalation(societyId, doc, level);
            doc.escalationLevel = level.level;
            doc.escalations.push({ level: level.level, at: now, reason: `Resolution overdue by ${minutesPastDue} minutes`, notifiedUserIds: notified } as any);
            this.history(doc, 'escalated', null, { to: String(level.level) });
            result.escalated += 1;
            changed = true;
          }
        }
        if (changed) await doc.save();
      }
    }
    return result;
  }

  private async notifyEscalation(societyId: string, doc: ComplaintDoc, level: { level: number; notifyRoleKeys: string[]; notifyUserIds: string[] }): Promise<string[]> {
    const userIds = new Set<string>((level.notifyUserIds ?? []).map(String));
    if (level.notifyRoleKeys?.length) {
      const roles = await Role.find({ societyId, key: { $in: level.notifyRoleKeys.map((k) => k.toUpperCase()) } }).select('_id').lean();
      const links = await UserRole.find({ societyId, roleId: { $in: roles.map((r) => r._id) } }).select('userId').lean();
      for (const l of links) userIds.add(String(l.userId));
    }
    if (doc.assignedTo) userIds.add(String(doc.assignedTo));
    domainEvents.emit('complaint.escalated', { complaintId: String(doc._id), ticketNumber: doc.ticketNumber, title: doc.title, level: level.level, userIds: [...userIds], priority: doc.priority }, { societyId });
    return [...userIds];
  }

  /** Closes resolved tickets the resident did not reopen within the configured window. */
  async autoClose(now = new Date()): Promise<number> {
    let closed = 0;
    const societies = await Complaint.distinct('societyId', { status: 'RESOLVED' });
    for (const sid of societies) {
      const societyId = String(sid);
      const cfg = await this.getConfig(societyId);
      if (!cfg.autoCloseAfterResolvedDays) continue;
      const cutoff = dayjs(now).subtract(cfg.autoCloseAfterResolvedDays, 'day').toDate();
      const docs = await Complaint.find({ societyId, status: 'RESOLVED', resolvedAt: { $lte: cutoff } });
      for (const doc of docs) {
        doc.status = 'CLOSED';
        doc.closedAt = now;
        this.history(doc, 'status_changed', null, { from: 'RESOLVED', to: 'CLOSED', note: 'Auto-closed' });
        await doc.save();
        closed += 1;
        domainEvents.emit('complaint.updated', { complaintId: String(doc._id), ticketNumber: doc.ticketNumber, title: doc.title, status: 'CLOSED', from: 'RESOLVED', raisedBy: String(doc.raisedBy), assignedTo: doc.assignedTo ? String(doc.assignedTo) : null, unitId: doc.unitId ? String(doc.unitId) : null, auto: true }, { societyId });
      }
    }
    return closed;
  }
}

export const complaintService = new ComplaintService();

registerJobHandlers(() => {
  jobQueue.register(JobNames.SLA_ESCALATE, async () => {
    const r = await complaintService.escalateOverdue();
    if (r.breached || r.escalated) logger.info(r, 'Complaint SLA sweep');
  });
  jobQueue.register(JobNames.COMPLAINT_AUTOCLOSE, async () => {
    const n = await complaintService.autoClose();
    if (n) logger.info({ closed: n }, 'Complaints auto-closed');
  });
});
