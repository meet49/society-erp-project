import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { Incident, type IncidentDoc } from '../../models/incident.model';
import { Gate } from '../../models/gate.model';
import { Unit } from '../../models/unit.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { categoryService } from '../../core/categories/category.service';
import { storageService } from '../../core/storage/storage.service';
import { domainEvents } from '../../core/events/event-bus';

export interface SecurityConfig { notifyRoleKeysOnCritical: string[]; notifyUnitOnIncident: boolean; autoCloseResolvedAfterDays: number }
/** `canViewAll` = security:view. Reporters without it only see what they reported themselves. */
export interface Actor { userId: string; canViewAll: boolean; canUpdate: boolean; canResolve: boolean; isGuard: boolean }

const OPEN = ['OPEN', 'INVESTIGATING'];
const POPULATE = [
  { path: 'reportedBy', select: 'name' },
  { path: 'assignedTo', select: 'name' },
  { path: 'unitId', select: 'code' },
  { path: 'gateId', select: 'name code' },
  { path: 'resolution.resolvedBy', select: 'name' },
  { path: 'timeline.userId', select: 'name' },
];

class IncidentService {
  getConfig(societyId: string): Promise<SecurityConfig> { return configurationService.getSocietySetting<SecurityConfig>(societyId, 'security.config'); }

  async updateConfig(societyId: string, patch: Partial<SecurityConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'security.config', patch, byUserId);
    auditService.record({ action: 'security.config_updated', resource: 'SocietySetting', resourceId: 'security.config', societyId, newValue: patch, req });
    return merged;
  }

  async types(societyId: string) {
    await categoryService.ensureDefaults(societyId, undefined, ['INCIDENT_TYPE']);
    return categoryService.list(societyId, 'INCIDENT_TYPE');
  }

  // ------------------------------------------------------------------ gates (shared with the visitors module)
  listGates(societyId: string) { return Gate.find({ societyId }).sort({ isDefault: -1, name: 1 }).lean(); }

  async createGate(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const code = String(input.code).toUpperCase();
    if (await Gate.exists({ societyId, code })) throw Errors.conflict('Gate code already exists');
    if (input.isDefault) await Gate.updateMany({ societyId }, { $set: { isDefault: false } });
    const gate = await Gate.create({ ...input, code, societyId, createdBy: byUserId });
    auditService.record({ action: 'gate.created', resource: 'Gate', resourceId: gate._id, societyId, newValue: { name: gate.name, code }, req });
    return gate.toJSON();
  }

  async updateGate(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const gate = await Gate.findOne({ _id: id, societyId });
    if (!gate) throw Errors.notFound('Gate');
    if (patch.code && String(patch.code).toUpperCase() !== gate.code && (await Gate.exists({ societyId, code: String(patch.code).toUpperCase() }))) throw Errors.conflict('Gate code already exists');
    if (patch.isDefault) await Gate.updateMany({ societyId, _id: { $ne: gate._id } }, { $set: { isDefault: false } });
    if (patch.code) patch.code = String(patch.code).toUpperCase();
    gate.set(patch);
    await gate.save();
    auditService.record({ action: 'gate.updated', resource: 'Gate', resourceId: gate._id, societyId, newValue: patch, req });
    return gate.toJSON();
  }

  // ------------------------------------------------------------------ helpers
  private async scope(_societyId: string, actor: Actor): Promise<Record<string, unknown>> {
    return actor.canViewAll ? {} : { reportedBy: actor.userId };
  }

  private async storePhotos(societyId: string, photos: string[] | undefined, byUserId: string, label: string) {
    const out: any[] = [];
    for (const [i, dataUrl] of (photos ?? []).entries()) {
      const stored = await storageService.storeDataUrl({ societyId, scope: 'incidents', dataUrl, name: `${label}-${i + 1}.jpg` });
      out.push({ name: stored.name, storageKey: stored.storageKey, mimeType: stored.mimeType, size: stored.size, uploadedBy: byUserId, uploadedAt: new Date() });
    }
    return out;
  }

  private async present(doc: any) {
    const out: any = { ...doc, id: String(doc._id) };
    out.photos = await Promise.all((doc.photos ?? []).map(async (p: any) => ({ ...p, id: String(p._id ?? ''), url: await storageService.signedUrl(p.storageKey, { expiresInSeconds: 900 }).catch(() => null) })));
    return out;
  }

  private async load(societyId: string, id: string): Promise<IncidentDoc> {
    const doc = await Incident.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Incident');
    return doc;
  }

  private async assertVisible(societyId: string, doc: any, actor: Actor) {
    const scope = await this.scope(societyId, actor);
    if (scope.reportedBy && String(doc.reportedBy?._id ?? doc.reportedBy) !== actor.userId) throw Errors.notFound('Incident');
  }

  // ------------------------------------------------------------------ reporting
  async create(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    if (input.clientRef) {
      const dup = await Incident.findOne({ societyId, clientRef: input.clientRef }).lean();
      if (dup) return { ...(await this.present(dup)), replayed: true };
    }
    const types = await this.types(societyId);
    const typeKey = String(input.typeKey).toUpperCase();
    if (!types.some((t: any) => t.key === typeKey)) throw Errors.validation({ typeKey: ['Unknown incident type'] });
    if (input.unitId && !(await Unit.exists({ _id: input.unitId, societyId, deletedAt: null }))) throw Errors.validation({ unitId: ['Unit not found'] });
    if (input.gateId && !(await Gate.exists({ _id: input.gateId, societyId }))) throw Errors.validation({ gateId: ['Gate not found'] });
    const incidentNumber = await sequenceService.next(societyId, 'incident', { prefix: 'INC', padding: 4 });
    const photos = await this.storePhotos(societyId, input.photos, actor.userId, incidentNumber.replace(/\//g, '-'));
    const doc = await Incident.create({
      societyId, incidentNumber, title: input.title, description: input.description, typeKey, severity: input.severity ?? 'MEDIUM', location: input.location, gateId: input.gateId ?? null, unitId: input.unitId ?? null,
      occurredAt: input.occurredAt ?? new Date(), reportedBy: actor.userId, reportedVia: actor.isGuard ? 'GATE' : 'OFFICE', photos, involved: input.involved ?? [], police: input.police ?? { reported: false }, clientRef: input.clientRef ?? null,
      timeline: [{ at: new Date(), action: 'REPORTED', userId: actor.userId, to: 'OPEN' }],
    });
    auditService.record({ action: 'incident.reported', resource: 'Incident', resourceId: doc._id, societyId, newValue: { incidentNumber, title: doc.title, severity: doc.severity, typeKey }, req });
    const unit = doc.unitId ? await Unit.findById(doc.unitId).select('code').lean() : null;
    domainEvents.emit('incident.reported', { incidentId: String(doc._id), incidentNumber, title: doc.title, severity: doc.severity, typeKey, location: doc.location ?? null, unitId: doc.unitId ? String(doc.unitId) : null, unitCode: unit?.code ?? null, reportedBy: actor.userId }, { societyId, actorId: actor.userId });
    domainEvents.emit('security.changed', { incidentId: String(doc._id), gate: true }, { societyId, actorId: actor.userId });
    return this.get(societyId, String(doc._id), actor);
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const filter: Record<string, unknown> = { societyId, deletedAt: null, ...(await this.scope(societyId, actor)) };
    if (query.status) filter.status = query.status;
    else if (query.openOnly) filter.status = { $in: OPEN };
    if (query.severity) filter.severity = query.severity;
    if (query.typeKey) filter.typeKey = String(query.typeKey).toUpperCase();
    if (query.assignedTo) filter.assignedTo = query.assignedTo;
    if (query.unitId) filter.unitId = query.unitId;
    if (query.mine) filter.$or = [{ reportedBy: actor.userId }, { assignedTo: actor.userId }];
    if (query.from || query.to) filter.occurredAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    const rx = searchRegex(query.search);
    if (rx) filter.$and = [{ $or: [{ title: rx }, { description: rx }, { location: rx }, { incidentNumber: rx }] }];
    const page = await paginate(Incident as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-occurredAt', allowedSorts: ['occurredAt', 'severity', 'status', 'incidentNumber', 'createdAt'], populate: POPULATE.slice(0, 4) });
    return { ...page, items: page.items.map((i: any) => ({ ...i, id: String(i._id), photos: undefined, photoCount: (i.photos ?? []).length, timeline: undefined })) };
  }

  async get(societyId: string, id: string, actor: Actor) {
    const doc = await Incident.findOne({ _id: id, societyId, deletedAt: null }).populate(POPULATE).lean();
    if (!doc) throw Errors.notFound('Incident');
    await this.assertVisible(societyId, doc, actor);
    return this.present(doc);
  }

  async update(societyId: string, id: string, patch: Record<string, any>, actor: Actor, req?: any) {
    const doc = await this.load(societyId, id);
    if (doc.status === 'CLOSED') throw Errors.invalidTransition('CLOSED', 'UPDATED', 'Incident');
    if (patch.typeKey) {
      const types = await this.types(societyId);
      patch.typeKey = String(patch.typeKey).toUpperCase();
      if (!types.some((t: any) => t.key === patch.typeKey)) throw Errors.validation({ typeKey: ['Unknown incident type'] });
    }
    if (patch.unitId && !(await Unit.exists({ _id: patch.unitId, societyId, deletedAt: null }))) throw Errors.validation({ unitId: ['Unit not found'] });
    const before = { severity: doc.severity, title: doc.title };
    doc.set(patch);
    if (before.severity !== doc.severity) doc.timeline.push({ at: new Date(), action: 'SEVERITY_CHANGED', userId: actor.userId as any, from: before.severity, to: doc.severity });
    await doc.save();
    auditService.record({ action: 'incident.updated', resource: 'Incident', resourceId: doc._id, societyId, oldValue: before, newValue: patch, req });
    domainEvents.emit('security.changed', { incidentId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  async assign(societyId: string, id: string, assignedTo: string | null, actor: Actor, req?: any) {
    const doc = await this.load(societyId, id);
    if (!OPEN.includes(doc.status)) throw Errors.invalidTransition(doc.status, 'ASSIGNED', 'Incident');
    doc.assignedTo = assignedTo as any;
    if (doc.status === 'OPEN' && assignedTo) doc.status = 'INVESTIGATING';
    doc.timeline.push({ at: new Date(), action: assignedTo ? 'ASSIGNED' : 'UNASSIGNED', userId: actor.userId as any, to: assignedTo ?? undefined });
    await doc.save();
    auditService.record({ action: 'incident.assigned', resource: 'Incident', resourceId: doc._id, societyId, newValue: { assignedTo }, req });
    if (assignedTo) domainEvents.emit('incident.assigned', { incidentId: String(doc._id), incidentNumber: doc.incidentNumber, title: doc.title, assignedTo }, { societyId, actorId: actor.userId });
    domainEvents.emit('security.changed', { incidentId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  async addNote(societyId: string, id: string, input: { note: string; photos?: string[] }, actor: Actor, req?: any) {
    const doc = await this.load(societyId, id);
    await this.assertVisible(societyId, doc, actor);
    if (!actor.canUpdate && String(doc.reportedBy) !== actor.userId) throw Errors.forbidden('Only the reporter or the security team can add notes');
    if (doc.status === 'CLOSED') throw Errors.invalidTransition('CLOSED', 'NOTE', 'Incident');
    const photos = await this.storePhotos(societyId, input.photos, actor.userId, `${doc.incidentNumber.replace(/\//g, '-')}-note`);
    doc.photos.push(...photos);
    doc.timeline.push({ at: new Date(), action: 'NOTE', userId: actor.userId as any, note: input.note });
    await doc.save();
    auditService.record({ action: 'incident.note_added', resource: 'Incident', resourceId: doc._id, societyId, newValue: { note: input.note }, req });
    domainEvents.emit('incident.updated', { incidentId: String(doc._id), incidentNumber: doc.incidentNumber, title: doc.title, status: doc.status, reportedBy: String(doc.reportedBy), assignedTo: doc.assignedTo ? String(doc.assignedTo) : null, change: 'note' }, { societyId, actorId: actor.userId });
    domainEvents.emit('security.changed', { incidentId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  async setStatus(societyId: string, id: string, status: 'INVESTIGATING' | 'OPEN', note: string | undefined, actor: Actor, req?: any) {
    const doc = await this.load(societyId, id);
    const allowed: Record<string, string[]> = { OPEN: ['INVESTIGATING'], INVESTIGATING: ['OPEN'], RESOLVED: ['OPEN'], CLOSED: ['OPEN'] };
    if (!allowed[doc.status]?.includes(status)) throw Errors.invalidTransition(doc.status, status, 'Incident');
    const from = doc.status;
    doc.status = status;
    if (status === 'OPEN') { doc.set('resolution', { note: undefined, actionTaken: undefined, resolvedAt: null, resolvedBy: null }); doc.closedAt = null; }
    doc.timeline.push({ at: new Date(), action: from === 'RESOLVED' || from === 'CLOSED' ? 'REOPENED' : 'STATUS_CHANGED', userId: actor.userId as any, from, to: status, note });
    await doc.save();
    auditService.record({ action: 'incident.status_changed', resource: 'Incident', resourceId: doc._id, societyId, oldValue: { status: from }, newValue: { status, note }, req });
    domainEvents.emit('incident.updated', { incidentId: String(doc._id), incidentNumber: doc.incidentNumber, title: doc.title, status, reportedBy: String(doc.reportedBy), assignedTo: doc.assignedTo ? String(doc.assignedTo) : null, change: 'status' }, { societyId, actorId: actor.userId });
    domainEvents.emit('security.changed', { incidentId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  async resolve(societyId: string, id: string, input: { note: string; actionTaken?: string; close?: boolean }, actor: Actor, req?: any) {
    const doc = await this.load(societyId, id);
    if (!OPEN.includes(doc.status)) throw Errors.invalidTransition(doc.status, 'RESOLVED', 'Incident');
    const from = doc.status;
    doc.status = input.close ? 'CLOSED' : 'RESOLVED';
    doc.set('resolution', { note: input.note, actionTaken: input.actionTaken, resolvedAt: new Date(), resolvedBy: actor.userId });
    if (input.close) doc.closedAt = new Date();
    doc.timeline.push({ at: new Date(), action: 'RESOLVED', userId: actor.userId as any, from, to: doc.status, note: input.note });
    await doc.save();
    auditService.record({ action: 'incident.resolved', resource: 'Incident', resourceId: doc._id, societyId, newValue: { note: input.note, actionTaken: input.actionTaken, status: doc.status }, req });
    domainEvents.emit('incident.updated', { incidentId: String(doc._id), incidentNumber: doc.incidentNumber, title: doc.title, status: doc.status, reportedBy: String(doc.reportedBy), assignedTo: doc.assignedTo ? String(doc.assignedTo) : null, change: 'resolved', unitId: doc.unitId ? String(doc.unitId) : null }, { societyId, actorId: actor.userId });
    domainEvents.emit('security.changed', { incidentId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  async close(societyId: string, id: string, note: string | undefined, actor: Actor, req?: any) {
    const doc = await this.load(societyId, id);
    if (doc.status !== 'RESOLVED') throw Errors.invalidTransition(doc.status, 'CLOSED', 'Incident');
    doc.status = 'CLOSED';
    doc.closedAt = new Date();
    doc.timeline.push({ at: new Date(), action: 'CLOSED', userId: actor.userId as any, from: 'RESOLVED', to: 'CLOSED', note });
    await doc.save();
    auditService.record({ action: 'incident.closed', resource: 'Incident', resourceId: doc._id, societyId, newValue: { note }, req });
    domainEvents.emit('security.changed', { incidentId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  async remove(societyId: string, id: string, actor: Actor, req?: any) {
    const doc = await this.load(societyId, id);
    doc.deletedAt = new Date();
    doc.deletedBy = actor.userId as any;
    await doc.save();
    auditService.record({ action: 'incident.deleted', resource: 'Incident', resourceId: doc._id, societyId, oldValue: { incidentNumber: doc.incidentNumber, title: doc.title }, req });
    domainEvents.emit('security.changed', { incidentId: String(doc._id) }, { societyId, actorId: actor.userId });
  }

  // ------------------------------------------------------------------ reporting
  async stats(societyId: string, actor: Actor) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const scope = await this.scope(societyId, actor);
    const match: Record<string, unknown> = { societyId: sid, deletedAt: null, ...(scope.reportedBy ? { reportedBy: new mongoose.Types.ObjectId(String(scope.reportedBy)) } : {}) };
    const monthStart = dayjs().startOf('month').toDate();
    const [byStatus, bySeverity, byType, thisMonth, resolved30, unassigned] = await Promise.all([
      Incident.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Incident.aggregate([{ $match: { ...match, status: { $in: OPEN } } }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
      Incident.aggregate([{ $match: { ...match, occurredAt: { $gte: dayjs().subtract(90, 'day').toDate() } } }, { $group: { _id: '$typeKey', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
      Incident.countDocuments({ ...match, occurredAt: { $gte: monthStart } }),
      Incident.aggregate([{ $match: { ...match, 'resolution.resolvedAt': { $gte: dayjs().subtract(30, 'day').toDate() } } }, { $project: { hours: { $divide: [{ $subtract: ['$resolution.resolvedAt', '$createdAt'] }, 3_600_000] } } }, { $group: { _id: null, avg: { $avg: '$hours' }, count: { $sum: 1 } } }]),
      Incident.countDocuments({ ...match, status: { $in: OPEN }, assignedTo: null }),
    ]);
    const status = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    const severity = Object.fromEntries(bySeverity.map((s) => [s._id, s.count]));
    return {
      open: OPEN.reduce((s, k) => s + (status[k] ?? 0), 0),
      byStatus: status,
      openBySeverity: severity,
      critical: (severity.CRITICAL ?? 0) + (severity.HIGH ?? 0),
      unassigned,
      thisMonth,
      resolved30d: resolved30[0]?.count ?? 0,
      avgResolutionHours: resolved30[0]?.avg ? Math.round(resolved30[0].avg * 10) / 10 : null,
      byType: byType.map((t) => ({ type: t._id, count: t.count })),
    };
  }

  async exportRows(societyId: string, query: Record<string, any>, actor: Actor) {
    const rows: Record<string, unknown>[] = [];
    let page = 1;
    while (rows.length < 5000) {
      const res = await this.list(societyId, { ...query, page, limit: 200 }, actor);
      rows.push(...res.items.map((i: any) => ({ number: i.incidentNumber, title: i.title, type: i.typeKey, severity: i.severity, status: i.status, occurredAt: dayjs(i.occurredAt).format('YYYY-MM-DD HH:mm'), location: i.location ?? '', unit: i.unitId?.code ?? '', gate: i.gateId?.name ?? '', reportedBy: i.reportedBy?.name ?? '', assignedTo: i.assignedTo?.name ?? '', policeReported: i.police?.reported ? 'yes' : 'no', firNumber: i.police?.firNumber ?? '', resolvedAt: i.resolution?.resolvedAt ? dayjs(i.resolution.resolvedAt).format('YYYY-MM-DD HH:mm') : '', resolution: i.resolution?.note ?? '' })));
      if (page >= res.pages) break;
      page += 1;
    }
    return rows;
  }

  /** Nightly: close resolved incidents nobody reopened within the configured window. */
  async sweep(now = new Date()) {
    let closed = 0;
    const societies = await Incident.distinct('societyId', { status: 'RESOLVED', deletedAt: null });
    for (const societyId of societies) {
      const cfg = await this.getConfig(String(societyId));
      if (!cfg.autoCloseResolvedAfterDays) continue;
      const cutoff = dayjs(now).subtract(cfg.autoCloseResolvedAfterDays, 'day').toDate();
      const res = await Incident.updateMany({ societyId, status: 'RESOLVED', deletedAt: null, 'resolution.resolvedAt': { $lte: cutoff } }, { $set: { status: 'CLOSED', closedAt: now }, $push: { timeline: { at: now, action: 'AUTO_CLOSED', from: 'RESOLVED', to: 'CLOSED' } } });
      closed += res.modifiedCount;
      if (res.modifiedCount) domainEvents.emit('security.changed', { autoClosed: res.modifiedCount }, { societyId: String(societyId) });
    }
    return { closed };
  }
}

export const incidentService = new IncidentService();
