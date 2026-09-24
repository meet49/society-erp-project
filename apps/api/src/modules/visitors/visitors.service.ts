import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { ErrorCodes } from '@society-erp/shared';
import { Visitor, type VisitorDoc } from '../../models/visitor.model';
import { Gate } from '../../models/gate.model';
import { Unit } from '../../models/unit.model';
import { Resident } from '../../models/resident.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { randomDigits, randomToken, maskString } from '../../lib/crypto';
import { auditService } from '../../core/audit/audit.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { domainEvents } from '../../core/events/event-bus';
import { storageService } from '../../core/storage/storage.service';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { registerSocietyInitializer } from '../../core/tenancy/society.service';
import { logger } from '../../lib/logger';

export interface VisitorConfig {
  passValidityHours: number;
  passcodeLength: number;
  requirePhoto: boolean;
  requireVehicleNumber: boolean;
  dailyGuestCap: number;
  notifyOnCheckin: boolean;
  notifyOnCheckout: boolean;
  walkInApprovalTimeoutMinutes: number;
  autoCheckoutHours: number;
}

export interface Actor { userId: string; ownScope: boolean; unitIds: string[]; residentId?: string | null; isGuard: boolean }

const ACTIVE = ['PENDING', 'APPROVED', 'CHECKED_IN'];

/** Residents see phone numbers of their own visitors; guards see everything they need at the gate; other members see masked data. */
function present(doc: any, actor: Actor) {
  const out = { ...doc, id: String(doc._id), qrToken: undefined };
  if (actor.ownScope && !actor.unitIds.includes(String(doc.unitId?._id ?? doc.unitId))) out.phone = maskString(doc.phone, 2);
  return out;
}

class VisitorService {
  getConfig(societyId: string): Promise<VisitorConfig> { return configurationService.getSocietySetting<VisitorConfig>(societyId, 'visitors.config'); }

  async updateConfig(societyId: string, patch: Partial<VisitorConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'visitors.config', patch, byUserId);
    auditService.record({ action: 'visitors.config_updated', resource: 'SocietySetting', resourceId: 'visitors.config', societyId, newValue: patch, req });
    return merged;
  }

  /** Unit picker for the gate: code / number search with the primary resident's name. Guards never see resident contact details here. */
  async unitLookup(societyId: string, q: string | undefined, limit = 30) {
    const rx = searchRegex(q);
    const filter: Record<string, unknown> = { societyId, deletedAt: null, status: 'ACTIVE' };
    if (rx) filter.$or = [{ code: rx }, { number: rx }];
    const units = await Unit.find(filter).select('code buildingId').populate('buildingId', 'name').sort({ code: 1 }).limit(limit).lean();
    const residents = await Resident.find({ societyId, unitId: { $in: units.map((u) => u._id) }, status: 'ACTIVE', deletedAt: null }).sort({ isPrimary: -1 }).select('name unitId').lean();
    return units.map((u: any) => ({ id: String(u._id), code: u.code, building: u.buildingId?.name ?? null, resident: residents.find((r) => String(r.unitId) === String(u._id))?.name ?? null }));
  }

  // ------------------------------------------------------------------ gates
  async ensureDefaultGate(societyId: string, session?: mongoose.ClientSession): Promise<void> {
    await Gate.updateOne({ societyId, code: 'MAIN' }, { $setOnInsert: { societyId, name: 'Main gate', code: 'MAIN', isDefault: true, isActive: true } }, { upsert: true, session });
  }

  async listGates(societyId: string) {
    if (!(await Gate.exists({ societyId }))) await this.ensureDefaultGate(societyId);
    return Gate.find({ societyId }).sort({ isDefault: -1, name: 1 }).lean();
  }

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
    if (patch.isDefault) await Gate.updateMany({ societyId, _id: { $ne: gate._id } }, { $set: { isDefault: false } });
    if (patch.code) patch.code = String(patch.code).toUpperCase();
    gate.set(patch);
    await gate.save();
    auditService.record({ action: 'gate.updated', resource: 'Gate', resourceId: gate._id, societyId, newValue: patch, req });
    return gate.toJSON();
  }

  private async resolveGate(societyId: string, gateId?: string | null) {
    if (gateId) {
      const g = await Gate.findOne({ _id: gateId, societyId, isActive: true }).lean();
      if (!g) throw Errors.validation({ gateId: ['Unknown gate'] });
      return g;
    }
    if (!(await Gate.exists({ societyId }))) await this.ensureDefaultGate(societyId);
    return (await Gate.findOne({ societyId, isActive: true, isDefault: true }).lean()) ?? (await Gate.findOne({ societyId, isActive: true }).lean());
  }

  // ------------------------------------------------------------------ helpers
  private async resolveUnit(societyId: string, actor: Actor, unitId?: string | null) {
    let id = unitId ?? null;
    if (actor.ownScope) {
      if (id && !actor.unitIds.includes(id)) throw Errors.forbidden('You can only manage visitors for your own unit');
      id = id ?? actor.unitIds[0] ?? null;
      if (!id) throw Errors.validation({ unitId: ['Your login is not linked to a unit yet'] });
    }
    if (!id) throw Errors.validation({ unitId: ['Unit is required'] });
    const unit = await Unit.findOne({ _id: id, societyId, deletedAt: null }).select('code buildingId').lean();
    if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
    return unit;
  }

  /** Users with a login on the unit (owner/tenant/family) receive approval requests and gate alerts. */
  async hostUserIds(societyId: string, unitId: any): Promise<string[]> {
    const residents = await Resident.find({ societyId, unitId, userId: { $ne: null }, status: 'ACTIVE', deletedAt: null }).select('userId').lean();
    return [...new Set(residents.map((r) => String(r.userId)))];
  }

  private async uniquePasscode(societyId: string, length: number): Promise<string> {
    for (let i = 0; i < 20; i += 1) {
      const code = randomDigits(length);
      if (!(await Visitor.exists({ societyId, passcode: code, status: { $in: ACTIVE } }))) return code;
    }
    throw Errors.internal('Could not allocate a passcode');
  }

  private async enforceDailyCap(societyId: string, unitId: any, guestCount: number, cfg: VisitorConfig): Promise<void> {
    if (!cfg.dailyGuestCap) return;
    const start = dayjs().startOf('day').toDate();
    const agg = await Visitor.aggregate([{ $match: { societyId: new mongoose.Types.ObjectId(societyId), unitId: new mongoose.Types.ObjectId(String(unitId)), createdAt: { $gte: start }, status: { $nin: ['DENIED', 'CANCELLED', 'EXPIRED'] } } }, { $group: { _id: null, guests: { $sum: '$guestCount' } } }]);
    if ((agg[0]?.guests ?? 0) + guestCount > cfg.dailyGuestCap) throw Errors.conflict(`Daily guest limit of ${cfg.dailyGuestCap} reached for this unit`);
  }

  private timeline(doc: VisitorDoc, action: string, userId: string | null, extra: { gateId?: any; note?: string } = {}) {
    doc.timeline.push({ at: new Date(), action, userId, gateId: extra.gateId ?? null, note: extra.note } as any);
  }

  // ------------------------------------------------------------------ pre-approval (resident)
  async preApprove(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    const cfg = await this.getConfig(societyId);
    const unit = await this.resolveUnit(societyId, actor, input.unitId);
    await this.enforceDailyCap(societyId, unit._id, input.guestCount ?? 1, cfg);
    const validFrom = input.validFrom ?? input.expectedAt ?? new Date();
    const validUntil = input.recurring?.until ? dayjs(input.recurring.until).endOf('day').toDate() : dayjs(validFrom).add(input.validHours ?? cfg.passValidityHours, 'hour').toDate();
    const doc = new Visitor({ ...input, phone: input.phone || undefined, societyId, entryType: 'PRE_APPROVED', categoryKey: String(input.categoryKey ?? 'GUEST').toUpperCase(), unitId: unit._id, hostUserId: actor.userId, residentId: actor.residentId ?? null, passcode: await this.uniquePasscode(societyId, cfg.passcodeLength), qrToken: randomToken(24), validFrom, validUntil, expectedAt: input.expectedAt ?? validFrom, status: 'APPROVED', approvedBy: actor.userId, approvedAt: new Date(), createdBy: actor.userId });
    this.timeline(doc, 'pre_approved', actor.userId);
    await doc.save();
    auditService.record({ action: 'visitor.pre_approved', resource: 'Visitor', resourceId: doc._id, societyId, newValue: { name: doc.name, category: doc.categoryKey, unit: unit.code, validUntil }, req });
    domainEvents.emit('visitor.pass_created', { visitorId: String(doc._id), visitorName: doc.name, phone: doc.phone, email: doc.email, passcode: doc.passcode, validUntil, unitCode: unit.code, hostUserId: actor.userId }, { societyId, actorId: actor.userId });
    return this.passFor(doc, unit.code);
  }

  /** What the resident shares with the visitor (QR payload + passcode). */
  private passFor(doc: VisitorDoc, unitCode?: string) {
    const json = doc.toJSON() as any;
    return { ...json, unitCode, qrPayload: `SERP:V:${doc.qrToken}`, shareText: `${doc.name}, you are expected at ${unitCode ? `unit ${unitCode}` : 'the society'}. Show this passcode at the gate: ${doc.passcode} (valid till ${dayjs(doc.validUntil).format('DD MMM, h:mm A')}).` };
  }

  async myPass(societyId: string, id: string, actor: Actor) {
    const doc = await Visitor.findOne({ _id: id, societyId, ...(actor.ownScope ? { unitId: { $in: actor.unitIds } } : {}) }).populate('unitId', 'code');
    if (!doc) throw Errors.notFound('Visitor pass');
    return this.passFor(doc, (doc.unitId as any)?.code);
  }

  async cancel(societyId: string, id: string, actor: Actor, req?: any) {
    const doc = await Visitor.findOne({ _id: id, societyId, ...(actor.ownScope ? { unitId: { $in: actor.unitIds } } : {}) });
    if (!doc) throw Errors.notFound('Visitor');
    if (!['PENDING', 'APPROVED'].includes(doc.status)) throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `A ${doc.status.toLowerCase().replace('_', ' ')} visit cannot be cancelled`);
    doc.status = 'CANCELLED';
    this.timeline(doc, 'cancelled', actor.userId);
    await doc.save();
    auditService.record({ action: 'visitor.cancelled', resource: 'Visitor', resourceId: doc._id, societyId, req });
    domainEvents.emit('visitor.cancelled', { visitorId: String(doc._id), visitorName: doc.name, unitId: String(doc.unitId) }, { societyId, actorId: actor.userId });
    return doc.toJSON();
  }

  // ------------------------------------------------------------------ walk-in (guard)
  async walkIn(societyId: string, input: Record<string, any>, actor: Actor, opts: { canApprove: boolean }, req?: any) {
    if (input.clientRef) {
      const existing = await Visitor.findOne({ societyId, clientRef: input.clientRef }).lean();
      if (existing) return { ...existing, id: String(existing._id), replayed: true };
    }
    const cfg = await this.getConfig(societyId);
    const unit = await this.resolveUnit(societyId, { ...actor, ownScope: false }, input.unitId);
    if (cfg.requireVehicleNumber && !input.vehicleNumber) throw Errors.validation({ vehicleNumber: ['Vehicle number is required'] });
    if (cfg.requirePhoto && !input.photo) throw Errors.validation({ photo: ['A photo of the visitor is required'] });
    await this.enforceDailyCap(societyId, unit._id, input.guestCount ?? 1, cfg);
    const gate = await this.resolveGate(societyId, input.gateId);
    const photoKey = input.photo ? (await storageService.storeDataUrl({ societyId, scope: 'visitors', dataUrl: input.photo, name: `${input.name}.jpg` })).storageKey : undefined;
    const hosts = await this.hostUserIds(societyId, unit._id);
    const direct = input.approvedByPhone && opts.canApprove;
    const doc = new Visitor({ ...input, phone: input.phone || undefined, photo: undefined, photoKey, societyId, entryType: 'WALK_IN', categoryKey: String(input.categoryKey ?? 'GUEST').toUpperCase(), unitId: unit._id, hostUserId: hosts[0] ?? null, validFrom: new Date(), validUntil: dayjs().add(cfg.autoCheckoutHours, 'hour').toDate(), status: direct ? 'CHECKED_IN' : 'PENDING', approvalRequestedAt: direct ? undefined : new Date(), approvedBy: direct ? actor.userId : null, approvedAt: direct ? new Date() : undefined, checkInAt: direct ? new Date() : undefined, checkInGateId: direct ? gate?._id : null, checkedInBy: direct ? actor.userId : null, createdBy: actor.userId, clientRef: input.clientRef });
    this.timeline(doc, direct ? 'checked_in' : 'walk_in_registered', actor.userId, { gateId: gate?._id, note: direct ? 'Approved by phone at the gate' : undefined });
    await doc.save();
    auditService.record({ action: direct ? 'visitor.checked_in' : 'visitor.walk_in', resource: 'Visitor', resourceId: doc._id, societyId, newValue: { name: doc.name, unit: unit.code, gate: gate?.code, direct }, req });
    if (direct) domainEvents.emit('visitor.checked_in', { visitorId: String(doc._id), visitorName: doc.name, unitId: String(unit._id), unitCode: unit.code, hostUserIds: hosts, gateName: gate?.name, time: dayjs().format('h:mm A'), categoryKey: doc.categoryKey }, { societyId, actorId: actor.userId });
    else domainEvents.emit('visitor.pending', { visitorId: String(doc._id), visitorName: doc.name, categoryKey: doc.categoryKey, unitId: String(unit._id), unitCode: unit.code, hostUserIds: hosts, gateName: gate?.name, guestCount: doc.guestCount, purpose: doc.purpose, photoKey, timeoutMinutes: cfg.walkInApprovalTimeoutMinutes }, { societyId, actorId: actor.userId });
    return { ...(doc.toJSON() as any), unitCode: unit.code, hostCount: hosts.length };
  }

  async decide(societyId: string, id: string, decision: 'APPROVED' | 'DENIED', actor: Actor, reason?: string, req?: any) {
    const doc = await Visitor.findOne({ _id: id, societyId, ...(actor.ownScope ? { unitId: { $in: actor.unitIds } } : {}) }).populate('unitId', 'code');
    if (!doc) throw Errors.notFound('Visitor');
    if (doc.status !== 'PENDING') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `This visit is already ${doc.status.toLowerCase().replace('_', ' ')}`);
    doc.status = decision;
    doc.approvedBy = actor.userId as any;
    doc.approvedAt = new Date();
    if (decision === 'DENIED') doc.deniedReason = reason;
    this.timeline(doc, decision === 'APPROVED' ? 'approved' : 'denied', actor.userId, { note: reason });
    await doc.save();
    auditService.record({ action: decision === 'APPROVED' ? 'visitor.approved' : 'visitor.denied', resource: 'Visitor', resourceId: doc._id, societyId, newValue: { reason }, req });
    domainEvents.emit(decision === 'APPROVED' ? 'visitor.approved' : 'visitor.denied', { visitorId: String(doc._id), visitorName: doc.name, unitId: String((doc.unitId as any)._id), unitCode: (doc.unitId as any).code, reason, decidedBy: actor.userId, createdBy: doc.createdBy ? String(doc.createdBy) : null }, { societyId, actorId: actor.userId });
    return doc.toJSON();
  }

  // ------------------------------------------------------------------ gate operations
  /** Passcode or QR token lookup. Returns the pass with its current validity so the guard sees why it may be rejected. */
  async lookup(societyId: string, code: string) {
    const raw = code.trim();
    const token = raw.startsWith('SERP:V:') ? raw.slice(7) : raw;
    const filter: Record<string, unknown> = /^\d{4,8}$/.test(token) ? { societyId, passcode: token, status: { $in: ACTIVE } } : { societyId, qrToken: token };
    const doc = await Visitor.findOne(filter).sort({ createdAt: -1 }).populate('unitId', 'code buildingId').populate('hostUserId', 'name phone').lean();
    if (!doc) throw Errors.notFound('Visitor pass');
    const now = new Date();
    const valid = doc.status === 'APPROVED' && now >= doc.validFrom && now <= doc.validUntil && this.recurringDayOk(doc);
    const reason = doc.status === 'CHECKED_IN' ? 'Already checked in' : doc.status !== 'APPROVED' ? `Pass is ${doc.status.toLowerCase().replace('_', ' ')}` : now < doc.validFrom ? `Valid from ${dayjs(doc.validFrom).format('DD MMM h:mm A')}` : now > doc.validUntil ? 'Pass has expired' : !this.recurringDayOk(doc) ? 'Not valid today' : null;
    return { ...doc, id: String(doc._id), qrToken: undefined, valid, reason, photoUrl: doc.photoKey ? await storageService.signedUrl(doc.photoKey) : null };
  }

  private recurringDayOk(doc: any): boolean {
    const days: number[] = doc.recurring?.days ?? [];
    return !days.length || days.includes(dayjs().day());
  }

  async checkIn(societyId: string, id: string, input: Record<string, any>, actor: Actor, req?: any) {
    const doc = await Visitor.findOne({ _id: id, societyId }).populate('unitId', 'code');
    if (!doc) throw Errors.notFound('Visitor');
    if (input.clientRef && doc.timeline.some((t) => t.note === `ref:${input.clientRef}`)) return { ...(doc.toJSON() as any), replayed: true };
    if (doc.status === 'CHECKED_IN') throw Errors.conflict('Visitor is already inside');
    if (doc.status !== 'APPROVED') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `Pass is ${doc.status.toLowerCase().replace('_', ' ')}; it must be approved first`);
    const now = new Date();
    if (now < doc.validFrom || now > doc.validUntil || !this.recurringDayOk(doc)) throw Errors.conflict('Pass is not valid at this time');
    const cfg = await this.getConfig(societyId);
    if (cfg.requirePhoto && !doc.photoKey && !input.photo) throw Errors.validation({ photo: ['A photo is required at check-in'] });
    const gate = await this.resolveGate(societyId, input.gateId);
    if (input.photo) doc.photoKey = (await storageService.storeDataUrl({ societyId, scope: 'visitors', dataUrl: input.photo, name: `${doc.name}.jpg` })).storageKey;
    if (input.vehicleNumber) doc.vehicleNumber = input.vehicleNumber;
    if (input.guestCount) doc.guestCount = input.guestCount;
    doc.status = 'CHECKED_IN';
    doc.checkInAt = now;
    doc.checkInGateId = gate?._id ?? null;
    doc.checkedInBy = actor.userId as any;
    this.timeline(doc, 'checked_in', actor.userId, { gateId: gate?._id, note: input.clientRef ? `ref:${input.clientRef}` : input.note });
    await doc.save();
    auditService.record({ action: 'visitor.checked_in', resource: 'Visitor', resourceId: doc._id, societyId, newValue: { gate: gate?.code }, req });
    const hosts = await this.hostUserIds(societyId, (doc.unitId as any)._id);
    if (cfg.notifyOnCheckin) domainEvents.emit('visitor.checked_in', { visitorId: String(doc._id), visitorName: doc.name, unitId: String((doc.unitId as any)._id), unitCode: (doc.unitId as any).code, hostUserIds: hosts, gateName: gate?.name, time: dayjs(now).format('h:mm A'), categoryKey: doc.categoryKey }, { societyId, actorId: actor.userId });
    return doc.toJSON();
  }

  async checkOut(societyId: string, id: string, input: Record<string, any>, actor: Actor, req?: any) {
    const doc = await Visitor.findOne({ _id: id, societyId }).populate('unitId', 'code');
    if (!doc) throw Errors.notFound('Visitor');
    if (doc.status === 'CHECKED_OUT') return { ...(doc.toJSON() as any), replayed: true };
    if (doc.status !== 'CHECKED_IN') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, 'Visitor is not inside');
    const gate = await this.resolveGate(societyId, input.gateId);
    doc.status = 'CHECKED_OUT';
    doc.checkOutAt = new Date();
    doc.checkOutGateId = gate?._id ?? null;
    doc.checkedOutBy = actor.userId as any;
    this.timeline(doc, 'checked_out', actor.userId, { gateId: gate?._id, note: input.note });
    await doc.save();
    auditService.record({ action: 'visitor.checked_out', resource: 'Visitor', resourceId: doc._id, societyId, req });
    const cfg = await this.getConfig(societyId);
    if (cfg.notifyOnCheckout) domainEvents.emit('visitor.checked_out', { visitorId: String(doc._id), visitorName: doc.name, unitId: String((doc.unitId as any)._id), unitCode: (doc.unitId as any).code, hostUserIds: await this.hostUserIds(societyId, (doc.unitId as any)._id), time: dayjs().format('h:mm A') }, { societyId, actorId: actor.userId });
    return doc.toJSON();
  }

  // ------------------------------------------------------------------ queries
  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const filter: Record<string, unknown> = { societyId };
    if (actor.ownScope) filter.unitId = { $in: actor.unitIds };
    if (query.status) filter.status = query.status;
    if (query.insideOnly) filter.status = 'CHECKED_IN';
    if (query.entryType) filter.entryType = query.entryType;
    if (query.categoryKey) filter.categoryKey = String(query.categoryKey).toUpperCase();
    if (query.unitId) filter.unitId = actor.ownScope ? { $in: actor.unitIds.filter((u) => u === query.unitId) } : query.unitId;
    if (query.gateId) filter.$or = [{ checkInGateId: query.gateId }, { checkOutGateId: query.gateId }];
    if (query.from || query.to) filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    const rx = searchRegex(query.search);
    if (rx) filter.$and = [{ $or: [{ name: rx }, { phone: rx }, { vehicleNumber: rx }, { companyName: rx }] }];
    const page = await paginate(Visitor as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'expectedAt', 'checkInAt', 'status', 'name'], select: '-qrToken -timeline', populate: [{ path: 'unitId', select: 'code' }, { path: 'hostUserId', select: 'name' }, { path: 'checkInGateId', select: 'name' }] });
    return { ...page, items: page.items.map((v: any) => present(v, actor)) };
  }

  async get(societyId: string, id: string, actor: Actor) {
    const doc = await Visitor.findOne({ _id: id, societyId, ...(actor.ownScope ? { unitId: { $in: actor.unitIds } } : {}) }).populate('unitId', 'code buildingId').populate('hostUserId', 'name').populate('approvedBy', 'name').populate('checkedInBy', 'name').populate('checkedOutBy', 'name').populate('checkInGateId', 'name').populate('checkOutGateId', 'name').populate('timeline.userId', 'name').lean();
    if (!doc) throw Errors.notFound('Visitor');
    return { ...present(doc, actor), photoUrl: doc.photoKey ? await storageService.signedUrl(doc.photoKey) : null };
  }

  /** Guard board: pending approvals, expected today, currently inside. */
  async gateBoard(societyId: string) {
    const now = new Date();
    const todayEnd = dayjs().endOf('day').toDate();
    const base = { societyId };
    const [pending, expected, inside, gates, cfg] = await Promise.all([
      Visitor.find({ ...base, status: 'PENDING' }).sort({ approvalRequestedAt: 1 }).populate('unitId', 'code').populate('hostUserId', 'name phone').limit(50).lean(),
      Visitor.find({ ...base, status: 'APPROVED', validFrom: { $lte: todayEnd }, validUntil: { $gte: now } }).sort({ expectedAt: 1 }).populate('unitId', 'code').populate('hostUserId', 'name').limit(100).lean(),
      Visitor.find({ ...base, status: 'CHECKED_IN' }).sort({ checkInAt: -1 }).populate('unitId', 'code').populate('checkInGateId', 'name').limit(200).lean(),
      this.listGates(societyId),
      this.getConfig(societyId),
    ]);
    const strip = (v: any) => ({ ...v, id: String(v._id), qrToken: undefined, timeline: undefined });
    return { pending: pending.map(strip), expected: expected.map(strip), inside: inside.map(strip), gates: gates.map((g) => ({ ...g, id: String(g._id) })), config: { requirePhoto: cfg.requirePhoto, requireVehicleNumber: cfg.requireVehicleNumber, walkInApprovalTimeoutMinutes: cfg.walkInApprovalTimeoutMinutes }, at: now };
  }

  async timelineToday(societyId: string, limit = 100) {
    const start = dayjs().startOf('day').toDate();
    const docs = await Visitor.find({ societyId, $or: [{ checkInAt: { $gte: start } }, { checkOutAt: { $gte: start } }, { createdAt: { $gte: start } }] }).sort({ updatedAt: -1 }).limit(limit).select('-qrToken').populate('unitId', 'code').populate('checkInGateId', 'name').lean();
    return docs.map((d) => ({ ...d, id: String(d._id) }));
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const start = dayjs().startOf('day').toDate();
    const [today, byCategory, inside, pending, week] = await Promise.all([
      Visitor.countDocuments({ societyId, checkInAt: { $gte: start } }),
      Visitor.aggregate([{ $match: { societyId: sid, checkInAt: { $gte: dayjs().subtract(30, 'day').toDate() } } }, { $group: { _id: '$categoryKey', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Visitor.countDocuments({ societyId, status: 'CHECKED_IN' }),
      Visitor.countDocuments({ societyId, status: 'PENDING' }),
      Visitor.aggregate([{ $match: { societyId: sid, checkInAt: { $gte: dayjs().subtract(6, 'day').startOf('day').toDate() } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkInAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    ]);
    return { today, inside, pending, byCategory: byCategory.map((c) => ({ category: c._id, count: c.count })), week: week.map((w) => ({ day: w._id, count: w.count })) };
  }

  async exportRows(societyId: string, query: Record<string, any>, actor: Actor) {
    const rows: any[] = [];
    let page = 1;
    while (rows.length < 5000) {
      const res = await this.list(societyId, { ...query, page, limit: 200 }, actor);
      rows.push(...res.items.map((v: any) => ({ name: v.name, phone: v.phone ?? '', category: v.categoryKey, type: v.entryType, unit: v.unitId?.code ?? '', host: v.hostUserId?.name ?? '', vehicle: v.vehicleNumber ?? '', guests: v.guestCount, status: v.status, expected: v.expectedAt ? dayjs(v.expectedAt).format('YYYY-MM-DD HH:mm') : '', checkIn: v.checkInAt ? dayjs(v.checkInAt).format('YYYY-MM-DD HH:mm') : '', checkOut: v.checkOutAt ? dayjs(v.checkOutAt).format('YYYY-MM-DD HH:mm') : '', gate: v.checkInGateId?.name ?? '' })));
      if (page >= res.pages) break;
      page += 1;
    }
    return rows;
  }

  // ------------------------------------------------------------------ jobs
  /** Expires stale passes, times out unanswered walk-ins and auto-checks-out visitors who never left through the gate. */
  async sweep(now = new Date()): Promise<{ expired: number; timedOut: number; autoCheckedOut: number }> {
    const expired = await Visitor.updateMany({ status: 'APPROVED', validUntil: { $lt: now } }, { $set: { status: 'EXPIRED' }, $push: { timeline: { at: now, action: 'expired', note: 'Pass validity ended' } } });
    let timedOut = 0;
    let autoCheckedOut = 0;
    const societies = await Visitor.distinct('societyId', { status: { $in: ['PENDING', 'CHECKED_IN'] } });
    for (const sid of societies) {
      const societyId = String(sid);
      const cfg = await this.getConfig(societyId);
      const stale = await Visitor.find({ societyId, status: 'PENDING', approvalRequestedAt: { $lt: dayjs(now).subtract(cfg.walkInApprovalTimeoutMinutes, 'minute').toDate() } });
      for (const v of stale) {
        v.status = 'EXPIRED';
        v.deniedReason = 'No response from the resident';
        this.timeline(v, 'timed_out', null, { note: `No approval within ${cfg.walkInApprovalTimeoutMinutes} minutes` });
        await v.save();
        timedOut += 1;
        domainEvents.emit('visitor.timed_out', { visitorId: String(v._id), visitorName: v.name, unitId: String(v.unitId), createdBy: v.createdBy ? String(v.createdBy) : null }, { societyId });
      }
      const overstay = await Visitor.find({ societyId, status: 'CHECKED_IN', checkInAt: { $lt: dayjs(now).subtract(cfg.autoCheckoutHours, 'hour').toDate() } });
      for (const v of overstay) {
        v.status = 'CHECKED_OUT';
        v.checkOutAt = now;
        this.timeline(v, 'auto_checked_out', null, { note: `No check-out recorded within ${cfg.autoCheckoutHours} hours` });
        await v.save();
        autoCheckedOut += 1;
      }
    }
    return { expired: expired.modifiedCount, timedOut, autoCheckedOut };
  }
}

export const visitorService = new VisitorService();

registerSocietyInitializer('gates', async ({ societyId, session }) => visitorService.ensureDefaultGate(societyId, session));

registerJobHandlers(() => {
  jobQueue.register(JobNames.VISITOR_EXPIRE, async () => {
    const r = await visitorService.sweep();
    if (r.expired || r.timedOut || r.autoCheckedOut) logger.info(r, 'Visitor sweep');
  });
});
