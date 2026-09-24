import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { ErrorCodes } from '@society-erp/shared';
import { Delivery, type DeliveryDoc } from '../../models/delivery.model';
import { Unit } from '../../models/unit.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { domainEvents } from '../../core/events/event-bus';
import { storageService } from '../../core/storage/storage.service';
import { visitorService, type Actor } from './visitors.service';

interface DeliveryConfig { leaveAtGateAllowed: boolean; notifyOnArrival: boolean }

class DeliveryService {
  getConfig(societyId: string) { return configurationService.getSocietySetting<DeliveryConfig>(societyId, 'delivery.config'); }

  private timeline(doc: DeliveryDoc, action: string, userId: string | null, note?: string) {
    doc.timeline.push({ at: new Date(), action, userId, note } as any);
  }

  private async unitFor(societyId: string, actor: Actor, unitId?: string | null) {
    let id = unitId ?? null;
    if (actor.ownScope) {
      if (id && !actor.unitIds.includes(id)) throw Errors.forbidden('You can only manage deliveries for your own unit');
      id = id ?? actor.unitIds[0] ?? null;
    }
    if (!id) throw Errors.validation({ unitId: ['Unit is required'] });
    const unit = await Unit.findOne({ _id: id, societyId, deletedAt: null }).select('code').lean();
    if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
    return unit;
  }

  /** Resident announces an expected delivery (optionally allowing the guard to keep it at the gate). */
  async announce(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    const cfg = await this.getConfig(societyId);
    const unit = await this.unitFor(societyId, actor, input.unitId);
    const doc = await Delivery.create({ ...input, societyId, unitId: unit._id, hostUserId: actor.userId, leaveAtGate: Boolean(input.leaveAtGate) && cfg.leaveAtGateAllowed, status: 'EXPECTED', createdBy: actor.userId, timeline: [{ at: new Date(), action: 'announced', userId: actor.userId }] });
    auditService.record({ action: 'delivery.announced', resource: 'Delivery', resourceId: doc._id, societyId, newValue: { provider: doc.provider, unit: unit.code }, req });
    return { ...(doc.toJSON() as any), unitCode: unit.code };
  }

  /** Guard logs a delivery at the gate; matched to an announced one when possible. */
  async arrive(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    if (input.clientRef) {
      const existing = await Delivery.findOne({ societyId, clientRef: input.clientRef }).lean();
      if (existing) return { ...existing, id: String(existing._id), replayed: true };
    }
    const cfg = await this.getConfig(societyId);
    const unit = await this.unitFor(societyId, { ...actor, ownScope: false }, input.unitId);
    const photoKey = input.photo ? (await storageService.storeDataUrl({ societyId, scope: 'deliveries', dataUrl: input.photo, name: 'delivery.jpg' })).storageKey : undefined;
    let doc = await Delivery.findOne({ societyId, unitId: unit._id, status: 'EXPECTED', ...(input.trackingRef ? { trackingRef: input.trackingRef } : { provider: input.provider ? new RegExp(`^${String(input.provider).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') : { $exists: true } }) }).sort({ expectedAt: 1 });
    if (!doc) doc = new Delivery({ societyId, unitId: unit._id, hostUserId: (await visitorService.hostUserIds(societyId, unit._id))[0] ?? null, provider: input.provider, kind: input.kind, trackingRef: input.trackingRef, description: input.description, createdBy: actor.userId });
    doc.set({ deliveryPersonName: input.deliveryPersonName, deliveryPersonPhone: input.deliveryPersonPhone || undefined, vehicleNumber: input.vehicleNumber, gateId: input.gateId ?? null, photoKey, clientRef: input.clientRef, arrivedAt: new Date(), receivedBy: actor.userId });
    const leave = (doc.leaveAtGate || Boolean(input.leaveAtGate)) && cfg.leaveAtGateAllowed;
    doc.status = leave ? 'RECEIVED_AT_GATE' : 'ARRIVED';
    doc.leaveAtGate = leave;
    this.timeline(doc, leave ? 'received_at_gate' : 'arrived', actor.userId);
    await doc.save();
    auditService.record({ action: 'delivery.arrived', resource: 'Delivery', resourceId: doc._id, societyId, newValue: { provider: doc.provider, unit: unit.code, leaveAtGate: leave }, req });
    const hosts = await visitorService.hostUserIds(societyId, unit._id);
    if (cfg.notifyOnArrival) domainEvents.emit('delivery.arrived', { deliveryId: String(doc._id), provider: doc.provider ?? 'A delivery', kind: doc.kind, unitId: String(unit._id), unitCode: unit.code, hostUserIds: hosts, leaveAtGate: leave }, { societyId, actorId: actor.userId });
    return { ...(doc.toJSON() as any), unitCode: unit.code };
  }

  async setStatus(societyId: string, id: string, input: { status: string; collectedByName?: string; note?: string; clientRef?: string }, actor: Actor, req?: any) {
    const doc = await Delivery.findOne({ _id: id, societyId, ...(actor.ownScope ? { unitId: { $in: actor.unitIds } } : {}) }).populate('unitId', 'code');
    if (!doc) throw Errors.notFound('Delivery');
    if (input.clientRef && doc.timeline.some((t) => t.note === `ref:${input.clientRef}`)) return { ...(doc.toJSON() as any), replayed: true };
    const allowed: Record<string, string[]> = { EXPECTED: ['ARRIVED', 'RECEIVED_AT_GATE', 'COLLECTED'], ARRIVED: ['RECEIVED_AT_GATE', 'COLLECTED', 'RETURNED', 'NOTIFIED'], NOTIFIED: ['RECEIVED_AT_GATE', 'COLLECTED', 'RETURNED'], RECEIVED_AT_GATE: ['COLLECTED', 'RETURNED'], COLLECTED: [], RETURNED: [] };
    if (!allowed[doc.status]?.includes(input.status)) throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `A ${doc.status.toLowerCase().replace(/_/g, ' ')} delivery cannot be marked ${input.status.toLowerCase().replace(/_/g, ' ')}`);
    if (actor.ownScope && input.status !== 'COLLECTED') throw Errors.forbidden('Residents can only confirm collection');
    doc.status = input.status as any;
    if (input.status === 'COLLECTED') {
      doc.collectedAt = new Date();
      doc.collectedByName = input.collectedByName;
    }
    if (input.status === 'RETURNED') doc.returnedAt = new Date();
    this.timeline(doc, input.status.toLowerCase(), actor.userId, input.clientRef ? `ref:${input.clientRef}` : input.note);
    await doc.save();
    auditService.record({ action: `delivery.${input.status.toLowerCase()}`, resource: 'Delivery', resourceId: doc._id, societyId, newValue: { collectedByName: input.collectedByName, note: input.note }, req });
    domainEvents.emit('delivery.updated', { deliveryId: String(doc._id), status: doc.status, unitId: String((doc.unitId as any)._id), unitCode: (doc.unitId as any).code, hostUserIds: await visitorService.hostUserIds(societyId, (doc.unitId as any)._id), provider: doc.provider }, { societyId, actorId: actor.userId });
    return doc.toJSON();
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const filter: Record<string, unknown> = { societyId };
    if (actor.ownScope) filter.unitId = { $in: actor.unitIds };
    if (query.status) filter.status = query.status;
    if (query.pendingOnly) filter.status = { $in: ['ARRIVED', 'NOTIFIED', 'RECEIVED_AT_GATE'] };
    if (query.unitId) filter.unitId = actor.ownScope ? { $in: actor.unitIds.filter((u) => u === query.unitId) } : query.unitId;
    if (query.from || query.to) filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ provider: rx }, { trackingRef: rx }, { deliveryPersonName: rx }, { description: rx }];
    return paginate(Delivery as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'arrivedAt', 'status'], populate: [{ path: 'unitId', select: 'code' }, { path: 'gateId', select: 'name' }, { path: 'receivedBy', select: 'name' }] });
  }

  async get(societyId: string, id: string, actor: Actor) {
    const doc = await Delivery.findOne({ _id: id, societyId, ...(actor.ownScope ? { unitId: { $in: actor.unitIds } } : {}) }).populate('unitId', 'code').populate('gateId', 'name').populate('receivedBy', 'name').populate('timeline.userId', 'name').lean();
    if (!doc) throw Errors.notFound('Delivery');
    return { ...doc, id: String(doc._id), photoUrl: doc.photoKey ? await storageService.signedUrl(doc.photoKey) : null };
  }

  /** Items currently held at the gate (for the guard screen and the resident's "at the gate" card). */
  async atGate(societyId: string, actor?: Actor) {
    const filter: Record<string, unknown> = { societyId, status: { $in: ['ARRIVED', 'NOTIFIED', 'RECEIVED_AT_GATE'] } };
    if (actor?.ownScope) filter.unitId = { $in: actor.unitIds };
    const docs = await Delivery.find(filter).sort({ arrivedAt: -1 }).limit(200).populate('unitId', 'code').lean();
    return docs.map((d) => ({ ...d, id: String(d._id) }));
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const start = dayjs().startOf('day').toDate();
    const [today, held, byProvider] = await Promise.all([
      Delivery.countDocuments({ societyId, arrivedAt: { $gte: start } }),
      Delivery.countDocuments({ societyId, status: { $in: ['ARRIVED', 'NOTIFIED', 'RECEIVED_AT_GATE'] } }),
      Delivery.aggregate([{ $match: { societyId: sid, arrivedAt: { $gte: dayjs().subtract(30, 'day').toDate() } } }, { $group: { _id: { $ifNull: ['$provider', 'Other'] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
    ]);
    return { today, held, byProvider: byProvider.map((p) => ({ provider: p._id, count: p.count })) };
  }
}

export const deliveryService = new DeliveryService();
