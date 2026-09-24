import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { EmergencyAlert, EmergencyContact } from '../../models/emergency.model';
import { Unit } from '../../models/unit.model';
import { User } from '../../models/user.model';
import { Errors } from '../../lib/errors';
import { paginate } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { audienceService, type Audience, type AudienceMember } from '../../core/audience/audience.service';
import { registerSocietyInitializer } from '../../core/tenancy/society.service';
import { domainEvents } from '../../core/events/event-bus';

export interface EmergencyConfig { sosNotifyRoleKeys: string[]; escalateUnacknowledgedMinutes: number; escalationRoleKeys: string[]; broadcastActiveHours: number; showContactsToMembers: boolean; memberCanRaiseSos: boolean }
export interface Actor extends AudienceMember { canRespond: boolean; canManage: boolean; canBroadcast: boolean; isGuard: boolean }
export interface DefaultContact { name: string; phone: string; category: string; notes?: string; order?: number }

const LIVE = ['ACTIVE', 'ACKNOWLEDGED'];
const POPULATE = [
  { path: 'raisedBy', select: 'name phone' },
  { path: 'unitId', select: 'code' },
  { path: 'acknowledgedBy', select: 'name' },
  { path: 'resolvedBy', select: 'name' },
  { path: 'responders.userId', select: 'name' },
  { path: 'timeline.userId', select: 'name' },
];

class EmergencyService {
  getConfig(societyId: string): Promise<EmergencyConfig> { return configurationService.getSocietySetting<EmergencyConfig>(societyId, 'emergency.config'); }

  async updateConfig(societyId: string, patch: Partial<EmergencyConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'emergency.config', patch, byUserId);
    auditService.record({ action: 'emergency.config_updated', resource: 'SocietySetting', resourceId: 'emergency.config', societyId, newValue: patch, req });
    return merged;
  }

  // ------------------------------------------------------------------ contacts
  /** New societies start with the platform's default helpline list (editable per society, configurable by the platform). */
  async ensureDefaultContacts(societyId: string, session?: mongoose.ClientSession) {
    if (await EmergencyContact.exists({ societyId })) return;
    const defaults = await configurationService.getPlatformSetting<DefaultContact[]>('emergency.defaultContacts', []);
    if (!defaults?.length) return;
    await EmergencyContact.insertMany(defaults.map((d, i) => ({ societyId, name: d.name, phone: d.phone, category: d.category, notes: d.notes, order: d.order ?? (i + 1) * 10, isActive: true })), { session });
  }

  async contacts(societyId: string, actor: Actor) {
    await this.ensureDefaultContacts(societyId);
    const all = actor.canManage;
    if (!all && !(await this.getConfig(societyId)).showContactsToMembers && !actor.isGuard && !actor.canRespond) return [];
    return EmergencyContact.find({ societyId, ...(all ? {} : { isActive: true }) }).sort({ order: 1, name: 1 }).lean().then((rows) => rows.map((r) => ({ ...r, id: String(r._id) })));
  }

  async createContact(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const last = await EmergencyContact.findOne({ societyId }).sort({ order: -1 }).select('order').lean();
    const doc = await EmergencyContact.create({ ...input, societyId, order: input.order ?? (last?.order ?? 0) + 10, createdBy: byUserId });
    auditService.record({ action: 'emergency.contact_created', resource: 'EmergencyContact', resourceId: doc._id, societyId, newValue: { name: doc.name, phone: doc.phone, category: doc.category }, req });
    domainEvents.emit('emergency.changed', { contacts: true }, { societyId, actorId: byUserId });
    return doc.toJSON();
  }

  async updateContact(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await EmergencyContact.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Emergency contact');
    doc.set(patch);
    await doc.save();
    auditService.record({ action: 'emergency.contact_updated', resource: 'EmergencyContact', resourceId: doc._id, societyId, newValue: patch, req });
    domainEvents.emit('emergency.changed', { contacts: true }, { societyId, actorId: byUserId });
    return doc.toJSON();
  }

  async removeContact(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await EmergencyContact.findOneAndDelete({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Emergency contact');
    auditService.record({ action: 'emergency.contact_deleted', resource: 'EmergencyContact', resourceId: doc._id, societyId, oldValue: { name: doc.name, phone: doc.phone }, req });
    domainEvents.emit('emergency.changed', { contacts: true }, { societyId, actorId: byUserId });
  }

  async reorderContacts(societyId: string, ids: string[], byUserId: string) {
    await Promise.all(ids.map((id, i) => EmergencyContact.updateOne({ _id: id, societyId }, { $set: { order: (i + 1) * 10 } })));
    domainEvents.emit('emergency.changed', { contacts: true }, { societyId, actorId: byUserId });
    return this.contacts(societyId, { userId: byUserId, unitIds: [], roleKeys: [], canRespond: true, canManage: true, canBroadcast: true, isGuard: false });
  }

  // ------------------------------------------------------------------ helpers
  private present(doc: any) {
    return { ...doc, id: String(doc._id), isLive: LIVE.includes(doc.status) && (!doc.expiresAt || doc.expiresAt > new Date()) };
  }

  private async load(societyId: string, id: string) {
    const doc = await EmergencyAlert.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Alert');
    return doc;
  }

  private async canSee(societyId: string, doc: any, actor: Actor): Promise<boolean> {
    if (actor.canRespond || actor.canManage || actor.canBroadcast || actor.isGuard) return true;
    if (String(doc.raisedBy?._id ?? doc.raisedBy) === actor.userId) return true;
    if (doc.kind === 'BROADCAST') return audienceService.includes(societyId, actor, (doc.audience ?? { type: 'ALL' }) as Audience);
    return false;
  }

  // ------------------------------------------------------------------ SOS
  async raiseSos(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    const cfg = await this.getConfig(societyId);
    if (!cfg.memberCanRaiseSos && !actor.isGuard && !actor.canRespond && !actor.canManage) throw Errors.forbidden('SOS is disabled for residents in this society. Call the emergency contacts instead.');
    if (input.clientRef) {
      const dup = await EmergencyAlert.findOne({ societyId, clientRef: input.clientRef }).populate(POPULATE).lean();
      if (dup) return { ...this.present(dup), replayed: true };
    }
    // one live SOS per person: repeated taps return the existing alert instead of spamming responders
    const live = await EmergencyAlert.findOne({ societyId, kind: 'SOS', raisedBy: actor.userId, status: { $in: LIVE } }).populate(POPULATE).lean();
    if (live) return { ...this.present(live), replayed: true };
    let unitId: string | null = input.unitId ?? actor.unitIds[0] ?? null;
    if (unitId && !actor.unitIds.includes(unitId) && !actor.canManage && !actor.isGuard) unitId = actor.unitIds[0] ?? null;
    if (unitId && !(await Unit.exists({ _id: unitId, societyId }))) unitId = null;
    const alertNumber = await sequenceService.next(societyId, 'sos', { prefix: 'SOS', padding: 4 });
    const doc = await EmergencyAlert.create({ societyId, alertNumber, kind: 'SOS', category: input.category ?? 'OTHER', raisedBy: actor.userId, unitId, location: input.location, coordinates: input.coordinates, message: input.message, clientRef: input.clientRef ?? null, timeline: [{ at: new Date(), action: 'RAISED', userId: actor.userId, note: input.message }] });
    auditService.record({ action: 'emergency.sos_raised', resource: 'EmergencyAlert', resourceId: doc._id, societyId, newValue: { alertNumber, category: doc.category, unitId, location: doc.location }, req });
    const [user, unit] = await Promise.all([User.findById(actor.userId).select('name phone').lean(), unitId ? Unit.findById(unitId).select('code').lean() : null]);
    domainEvents.emit('emergency.sos', { alertId: String(doc._id), alertNumber, category: doc.category, raisedBy: actor.userId, raisedByName: user?.name ?? 'A resident', raisedByPhone: user?.phone ?? null, unitId, unitCode: unit?.code ?? null, location: doc.location ?? unit?.code ?? 'the society', message: doc.message ?? null }, { societyId, actorId: actor.userId });
    return this.get(societyId, String(doc._id), actor);
  }

  async acknowledge(societyId: string, id: string, note: string | undefined, actor: Actor, req?: any) {
    const doc = await this.load(societyId, id);
    if (doc.kind !== 'SOS' || !LIVE.includes(doc.status)) throw Errors.invalidTransition(doc.status, 'ACKNOWLEDGED', 'Alert');
    const first = doc.status === 'ACTIVE';
    if (first) { doc.status = 'ACKNOWLEDGED'; doc.acknowledgedAt = new Date(); doc.acknowledgedBy = actor.userId as any; }
    if (!doc.responders.some((r: any) => String(r.userId) === actor.userId)) doc.responders.push({ userId: actor.userId as any, at: new Date(), note });
    doc.timeline.push({ at: new Date(), action: 'ACKNOWLEDGED', userId: actor.userId as any, note });
    await doc.save();
    auditService.record({ action: 'emergency.acknowledged', resource: 'EmergencyAlert', resourceId: doc._id, societyId, newValue: { note, first }, req });
    const user = await User.findById(actor.userId).select('name').lean();
    domainEvents.emit('emergency.acknowledged', { alertId: String(doc._id), alertNumber: doc.alertNumber, raisedBy: String(doc.raisedBy), responder: actor.userId, responderName: user?.name ?? 'A responder', first, note: note ?? null }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  /** Responders resolve or mark false alarm; the person who raised an SOS may cancel their own (false alarm) while it is live. */
  async resolve(societyId: string, id: string, input: { note?: string; falseAlarm?: boolean }, actor: Actor, req?: any) {
    const doc = await this.load(societyId, id);
    if (!LIVE.includes(doc.status)) throw Errors.invalidTransition(doc.status, 'RESOLVED', 'Alert');
    const own = String(doc.raisedBy) === actor.userId;
    if (doc.kind === 'SOS' && !actor.canRespond && !own) throw Errors.forbidden('Only responders can resolve an SOS');
    if (doc.kind === 'BROADCAST' && !actor.canBroadcast && !actor.canRespond) throw Errors.forbidden('Only the office can send the all-clear');
    const outcome = doc.kind === 'SOS' && (input.falseAlarm || (own && !actor.canRespond)) ? 'FALSE_ALARM' : 'RESOLVED';
    doc.status = outcome;
    doc.resolvedAt = new Date();
    doc.resolvedBy = actor.userId as any;
    doc.resolutionNote = input.note;
    doc.timeline.push({ at: new Date(), action: outcome, userId: actor.userId as any, note: input.note });
    await doc.save();
    auditService.record({ action: 'emergency.resolved', resource: 'EmergencyAlert', resourceId: doc._id, societyId, newValue: { outcome, note: input.note }, req });
    const user = await User.findById(actor.userId).select('name').lean();
    if (doc.kind === 'SOS') domainEvents.emit('emergency.resolved', { alertId: String(doc._id), alertNumber: doc.alertNumber, raisedBy: String(doc.raisedBy), responders: doc.responders.map((r: any) => String(r.userId)), outcome, resolvedByName: user?.name ?? '', note: input.note ?? null }, { societyId, actorId: actor.userId });
    else domainEvents.emit('emergency.all_clear', { alertId: String(doc._id), alertNumber: doc.alertNumber, title: doc.title, audience: doc.audience ?? { type: 'ALL' }, note: input.note ?? null }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  // ------------------------------------------------------------------ broadcast
  async broadcast(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    const cfg = await this.getConfig(societyId);
    const audience = (input.audience ?? { type: 'ALL', buildingIds: [], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] }) as Audience;
    const [summary, count] = await Promise.all([audienceService.describe(societyId, audience), audienceService.count(societyId, audience)]);
    const alertNumber = await sequenceService.next(societyId, 'emergency_broadcast', { prefix: 'EMG', padding: 4 });
    const doc = await EmergencyAlert.create({ societyId, alertNumber, kind: 'BROADCAST', category: input.category ?? 'OTHER', raisedBy: actor.userId, title: input.title, message: input.message, audience, audienceSummary: summary, expiresAt: dayjs().add(input.expiresInHours ?? cfg.broadcastActiveHours, 'hour').toDate(), notifiedCount: count, timeline: [{ at: new Date(), action: 'BROADCAST', userId: actor.userId, note: input.title }] });
    auditService.record({ action: 'emergency.broadcast', resource: 'EmergencyAlert', resourceId: doc._id, societyId, newValue: { alertNumber, title: doc.title, audience: summary, recipients: count }, req });
    domainEvents.emit('emergency.broadcast', { alertId: String(doc._id), alertNumber, title: doc.title, message: doc.message, category: doc.category, audience, audienceSummary: summary, expiresAt: doc.expiresAt }, { societyId, actorId: actor.userId });
    return this.get(societyId, String(doc._id), actor);
  }

  // ------------------------------------------------------------------ queries
  /** What matters right now for this caller: live SOS (all for responders/guards, own for members) and live broadcasts addressed to them. */
  async active(societyId: string, actor: Actor) {
    const now = new Date();
    const seeAll = actor.canRespond || actor.canManage || actor.isGuard;
    const [sos, broadcasts] = await Promise.all([
      EmergencyAlert.find({ societyId, kind: 'SOS', status: { $in: LIVE }, ...(seeAll ? {} : { raisedBy: actor.userId }) }).sort({ createdAt: -1 }).populate(POPULATE).lean(),
      EmergencyAlert.find({ societyId, kind: 'BROADCAST', status: 'ACTIVE', $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }], ...(seeAll || actor.canBroadcast ? {} : await audienceService.matchFilter(societyId, actor, 'audience')) }).sort({ createdAt: -1 }).populate(POPULATE).lean(),
    ]);
    return { sos: sos.map((d) => this.present(d)), broadcasts: broadcasts.map((d) => this.present(d)) };
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const filter: Record<string, unknown> = { societyId };
    if (!(actor.canRespond || actor.canManage || actor.canBroadcast)) filter.raisedBy = actor.userId;
    if (query.kind) filter.kind = query.kind;
    if (query.status) filter.status = query.status;
    else if (query.activeOnly) filter.status = { $in: LIVE };
    if (query.from || query.to) filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    const page = await paginate(EmergencyAlert as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'status', 'kind'], populate: POPULATE.slice(0, 4) });
    return { ...page, items: page.items.map((d: any) => ({ ...this.present(d), timeline: undefined })) };
  }

  async get(societyId: string, id: string, actor: Actor) {
    const doc = await EmergencyAlert.findOne({ _id: id, societyId }).populate(POPULATE).lean();
    if (!doc || !(await this.canSee(societyId, doc, actor))) throw Errors.notFound('Alert');
    return this.present(doc);
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const since = dayjs().subtract(30, 'day').toDate();
    const [activeSos, sos30, ack, falseAlarms, broadcasts30] = await Promise.all([
      EmergencyAlert.countDocuments({ societyId, kind: 'SOS', status: { $in: LIVE } }),
      EmergencyAlert.countDocuments({ societyId, kind: 'SOS', createdAt: { $gte: since } }),
      EmergencyAlert.aggregate([{ $match: { societyId: sid, kind: 'SOS', acknowledgedAt: { $ne: null }, createdAt: { $gte: since } } }, { $project: { minutes: { $divide: [{ $subtract: ['$acknowledgedAt', '$createdAt'] }, 60_000] } } }, { $group: { _id: null, avg: { $avg: '$minutes' } } }]),
      EmergencyAlert.countDocuments({ societyId, kind: 'SOS', status: 'FALSE_ALARM', createdAt: { $gte: since } }),
      EmergencyAlert.countDocuments({ societyId, kind: 'BROADCAST', createdAt: { $gte: since } }),
    ]);
    return { activeSos, sos30d: sos30, avgAckMinutes: ack[0]?.avg != null ? Math.round(ack[0].avg * 10) / 10 : null, falseAlarms30d: falseAlarms, broadcasts30d: broadcasts30 };
  }

  /** Every couple of minutes: escalate SOS nobody acknowledged, expire stale broadcasts. */
  async sweep(now = new Date()) {
    let escalated = 0;
    const expired = await EmergencyAlert.updateMany({ kind: 'BROADCAST', status: 'ACTIVE', expiresAt: { $lte: now } }, { $set: { status: 'EXPIRED' } });
    const societies = await EmergencyAlert.distinct('societyId', { kind: 'SOS', status: 'ACTIVE', escalatedAt: null });
    for (const societyId of societies) {
      const cfg = await this.getConfig(String(societyId));
      if (!cfg.escalateUnacknowledgedMinutes || !cfg.escalationRoleKeys?.length) continue;
      const cutoff = dayjs(now).subtract(cfg.escalateUnacknowledgedMinutes, 'minute').toDate();
      const stale = await EmergencyAlert.find({ societyId, kind: 'SOS', status: 'ACTIVE', escalatedAt: null, createdAt: { $lte: cutoff } }).populate('raisedBy', 'name').populate('unitId', 'code').lean();
      for (const alert of stale) {
        const res = await EmergencyAlert.updateOne({ _id: alert._id, escalatedAt: null }, { $set: { escalatedAt: now }, $push: { timeline: { at: now, action: 'ESCALATED', note: `No response for ${cfg.escalateUnacknowledgedMinutes} minutes` } } });
        if (!res.modifiedCount) continue;
        escalated += 1;
        domainEvents.emit('emergency.escalated', { alertId: String(alert._id), alertNumber: alert.alertNumber, raisedByName: (alert.raisedBy as any)?.name ?? 'A resident', unitCode: (alert.unitId as any)?.code ?? null, location: alert.location ?? null, minutes: cfg.escalateUnacknowledgedMinutes, roleKeys: cfg.escalationRoleKeys }, { societyId: String(societyId) });
      }
    }
    return { escalated, expired: expired.modifiedCount };
  }
}

export const emergencyService = new EmergencyService();
registerSocietyInitializer('emergency-contacts', async ({ societyId, session }) => emergencyService.ensureDefaultContacts(societyId, session));
