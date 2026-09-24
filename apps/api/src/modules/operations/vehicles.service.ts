import mongoose from 'mongoose';
import { Vehicle, ParkingSlot } from '../../models/vehicle.model';
import { Unit } from '../../models/unit.model';
import { Resident } from '../../models/resident.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { limitService } from '../../core/limits/limit.service';
import { domainEvents } from '../../core/events/event-bus';

export interface Actor { userId: string; ownScope: boolean; unitIds: string[]; isGuard: boolean }
export const normalizePlate = (n: string) => String(n).toUpperCase().replace(/[^A-Z0-9]/g, '');

class VehicleService {
  private scope(actor: Actor): Record<string, unknown> { return actor.ownScope ? { unitId: { $in: actor.unitIds } } : {}; }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const filter: Record<string, unknown> = { societyId, deletedAt: null, ...this.scope(actor) };
    if (query.unitId) filter.unitId = query.unitId;
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.unparkedOnly) filter.parkingSlotId = null;
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ number: rx }, { stickerNumber: rx }, { make: rx }, { model: rx }];
    return paginate(Vehicle as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: 'number', allowedSorts: ['number', 'type', 'createdAt', 'stickerNumber'], populate: [{ path: 'unitId', select: 'code' }, { path: 'parkingSlotId', select: 'code zone level' }, { path: 'residentId', select: 'name' }] });
  }

  async get(societyId: string, id: string, actor: Actor) {
    const doc: any = await Vehicle.findOne({ _id: id, societyId, deletedAt: null, ...this.scope(actor) }).populate('unitId', 'code').populate('parkingSlotId', 'code zone level').populate('residentId', 'name phone').lean();
    if (!doc) throw Errors.notFound('Vehicle');
    return { ...doc, id: String(doc._id) };
  }

  async create(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    const unitId = actor.ownScope ? (input.unitId && actor.unitIds.includes(input.unitId) ? input.unitId : actor.unitIds[0]) : input.unitId;
    if (!unitId) throw Errors.validation({ unitId: [actor.ownScope ? 'Your login is not linked to a unit' : 'Unit is required'] });
    if (!(await Unit.exists({ _id: unitId, societyId, deletedAt: null }))) throw Errors.validation({ unitId: ['Unknown unit'] });
    const number = normalizePlate(input.number);
    if (await Vehicle.exists({ societyId, number, deletedAt: null })) throw Errors.conflict(`${number} is already registered in this society`);
    await limitService.assertWithinLimit(societyId, 'maxVehicles');
    const resident = await Resident.findOne({ societyId, unitId, ...(actor.ownScope ? { userId: actor.userId } : {}), deletedAt: null, status: 'ACTIVE' }).sort({ isPrimary: -1 }).select('_id').lean();
    const doc = await Vehicle.create({ ...input, number, unitId, residentId: resident?._id ?? null, societyId, createdBy: actor.userId });
    auditService.record({ action: 'vehicle.registered', resource: 'Vehicle', resourceId: doc._id, societyId, newValue: { number, type: doc.type, unitId }, req });
    domainEvents.emit('operations.changed', { vehicleId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, String(doc._id), actor);
  }

  async update(societyId: string, id: string, patch: Record<string, any>, actor: Actor, req?: any) {
    const doc = await Vehicle.findOne({ _id: id, societyId, deletedAt: null, ...this.scope(actor) });
    if (!doc) throw Errors.notFound('Vehicle');
    if (patch.number) {
      const number = normalizePlate(patch.number);
      if (number !== doc.number && (await Vehicle.exists({ societyId, number, deletedAt: null }))) throw Errors.conflict(`${number} is already registered`);
      doc.number = number;
    }
    for (const key of ['type', 'make', 'model', 'color', 'notes'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    if (!actor.ownScope) for (const key of ['stickerNumber', 'status'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    await doc.save();
    auditService.record({ action: 'vehicle.updated', resource: 'Vehicle', resourceId: doc._id, societyId, newValue: Object.keys(patch), req });
    return this.get(societyId, id, actor);
  }

  async remove(societyId: string, id: string, actor: Actor, req?: any): Promise<void> {
    const doc = await Vehicle.findOne({ _id: id, societyId, deletedAt: null, ...this.scope(actor) });
    if (!doc) throw Errors.notFound('Vehicle');
    doc.deletedAt = new Date();
    doc.deletedBy = actor.userId as any;
    doc.status = 'INACTIVE';
    await doc.save();
    if (doc.parkingSlotId) await parkingService.release(societyId, String(doc.parkingSlotId), actor.userId, req).catch(() => undefined);
    auditService.record({ action: 'vehicle.removed', resource: 'Vehicle', resourceId: doc._id, societyId, newValue: { number: doc.number }, req });
    domainEvents.emit('operations.changed', { vehicleId: String(doc._id) }, { societyId, actorId: actor.userId });
  }

  /** Gate lookup by (partial) number plate; owner details follow the privacy setting. */
  async lookup(societyId: string, q: string, actor: Actor) {
    const privacy = await configurationService.getSocietySetting<{ showVehicleOwnerToGuards: boolean }>(societyId, 'privacy.config');
    const needle = normalizePlate(q);
    const sticker = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rows: any[] = await Vehicle.find({ societyId, deletedAt: null, status: 'ACTIVE', $or: [...(needle ? [{ number: { $regex: needle } }] : []), { stickerNumber: { $regex: sticker, $options: 'i' } }] }).limit(10).populate('unitId', 'code').populate('parkingSlotId', 'code').populate('residentId', 'name').lean();
    const showOwner = !actor.isGuard || privacy.showVehicleOwnerToGuards;
    return rows.map((v) => ({ id: String(v._id), number: v.number, type: v.type, make: v.make, model: v.model, color: v.color, stickerNumber: v.stickerNumber, unitCode: v.unitId?.code ?? null, parkingSlot: v.parkingSlotId?.code ?? null, owner: showOwner ? v.residentId?.name ?? null : undefined }));
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const [total, byType, unparked, stickers] = await Promise.all([
      Vehicle.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE' }),
      Vehicle.aggregate([{ $match: { societyId: sid, deletedAt: null, status: 'ACTIVE' } }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
      Vehicle.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE', parkingSlotId: null, type: { $in: ['CAR', 'EV'] } }),
      Vehicle.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE', stickerNumber: { $nin: [null, ''] } }),
    ]);
    return { total, byType: byType.map((t) => ({ type: t._id, count: t.n })), unparkedCars: unparked, withSticker: stickers };
  }
}

class ParkingService {
  async list(societyId: string, query: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId };
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.zone) filter.zone = query.zone;
    if (query.unitId) filter['allocation.unitId'] = query.unitId;
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ code: rx }, { zone: rx }, { level: rx }];
    return paginate(ParkingSlot as any, filter, { page: query.page, limit: query.limit ?? 100, sort: query.sort, defaultSort: 'code', allowedSorts: ['code', 'zone', 'status', 'type'], populate: [{ path: 'allocation.unitId', select: 'code' }, { path: 'allocation.vehicleId', select: 'number type' }] });
  }

  async create(societyId: string, input: Record<string, any>, req?: any) {
    const code = String(input.code).toUpperCase();
    if (await ParkingSlot.exists({ societyId, code })) throw Errors.conflict(`Slot ${code} already exists`);
    const doc = await ParkingSlot.create({ ...input, code, societyId });
    auditService.record({ action: 'parking.slot_created', resource: 'ParkingSlot', resourceId: doc._id, societyId, newValue: { code }, req });
    return doc.toJSON();
  }

  async bulkCreate(societyId: string, input: { prefix: string; from: number; to: number; zone?: string; level?: string; type: string; monthlyCharge?: number }, req?: any) {
    const codes = Array.from({ length: input.to - input.from + 1 }, (_, i) => `${input.prefix}${input.from + i}`.toUpperCase());
    const existing = new Set((await ParkingSlot.find({ societyId, code: { $in: codes } }).select('code').lean()).map((s) => s.code));
    const docs = codes.filter((c) => !existing.has(c)).map((code) => ({ societyId, code, zone: input.zone, level: input.level, type: input.type, monthlyCharge: input.monthlyCharge ?? 0 }));
    if (docs.length) await ParkingSlot.insertMany(docs);
    auditService.record({ action: 'parking.slots_bulk_created', resource: 'ParkingSlot', societyId, newValue: { created: docs.length, skipped: existing.size }, req });
    return { created: docs.length, skipped: existing.size };
  }

  async update(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const doc = await ParkingSlot.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Parking slot');
    if (patch.code) {
      const code = String(patch.code).toUpperCase();
      if (code !== doc.code && (await ParkingSlot.exists({ societyId, code }))) throw Errors.conflict(`Slot ${code} already exists`);
      doc.code = code;
    }
    if (patch.status && doc.status === 'ALLOCATED' && patch.status !== 'ALLOCATED') throw Errors.conflict('Release the slot before changing its status');
    for (const key of ['zone', 'level', 'type', 'status', 'monthlyCharge', 'notes'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    await doc.save();
    auditService.record({ action: 'parking.slot_updated', resource: 'ParkingSlot', resourceId: doc._id, societyId, newValue: patch, req });
    return doc.toJSON();
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await ParkingSlot.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Parking slot');
    if (doc.status === 'ALLOCATED') throw Errors.conflict('Release the slot before deleting it');
    await doc.deleteOne();
    auditService.record({ action: 'parking.slot_deleted', resource: 'ParkingSlot', resourceId: doc._id, societyId, req });
  }

  async allocate(societyId: string, id: string, input: { unitId: string; vehicleId?: string | null }, byUserId: string, req?: any) {
    const doc = await ParkingSlot.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Parking slot');
    if (doc.status === 'ALLOCATED') throw Errors.conflict(`Slot ${doc.code} is already allocated`);
    if (doc.status === 'BLOCKED') throw Errors.conflict(`Slot ${doc.code} is blocked`);
    if (!(await Unit.exists({ _id: input.unitId, societyId, deletedAt: null }))) throw Errors.validation({ unitId: ['Unknown unit'] });
    let vehicle = null;
    if (input.vehicleId) {
      vehicle = await Vehicle.findOne({ _id: input.vehicleId, societyId, deletedAt: null });
      if (!vehicle) throw Errors.validation({ vehicleId: ['Unknown vehicle'] });
      if (String(vehicle.unitId) !== input.unitId) throw Errors.validation({ vehicleId: ['That vehicle belongs to another unit'] });
      if (vehicle.parkingSlotId && String(vehicle.parkingSlotId) !== id) throw Errors.conflict('That vehicle already has a slot; release it first');
    }
    doc.status = 'ALLOCATED';
    doc.set('allocation', { unitId: input.unitId, vehicleId: vehicle?._id ?? null, allocatedAt: new Date(), allocatedBy: byUserId });
    await doc.save();
    await Unit.updateOne({ _id: input.unitId }, { $addToSet: { parkingSlotIds: doc._id } });
    if (vehicle) { vehicle.parkingSlotId = doc._id as any; await vehicle.save(); }
    auditService.record({ action: 'parking.allocated', resource: 'ParkingSlot', resourceId: doc._id, societyId, newValue: { code: doc.code, unitId: input.unitId, vehicleId: input.vehicleId }, req });
    domainEvents.emit('operations.changed', { slotId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.getOne(societyId, id);
  }

  async release(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await ParkingSlot.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Parking slot');
    if (doc.status !== 'ALLOCATED') return this.getOne(societyId, id);
    const unitId = doc.allocation?.unitId;
    if (unitId) await Unit.updateOne({ _id: unitId }, { $pull: { parkingSlotIds: doc._id } });
    await Vehicle.updateMany({ parkingSlotId: doc._id }, { $set: { parkingSlotId: null } });
    doc.status = 'AVAILABLE';
    doc.set('allocation', { unitId: null, vehicleId: null, allocatedAt: null, allocatedBy: null });
    await doc.save();
    auditService.record({ action: 'parking.released', resource: 'ParkingSlot', resourceId: doc._id, societyId, newValue: { code: doc.code, unitId: unitId ? String(unitId) : null }, req });
    domainEvents.emit('operations.changed', { slotId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.getOne(societyId, id);
  }

  private async getOne(societyId: string, id: string) {
    const doc: any = await ParkingSlot.findOne({ _id: id, societyId }).populate('allocation.unitId', 'code').populate('allocation.vehicleId', 'number type').lean();
    return doc ? { ...doc, id: String(doc._id) } : null;
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const rows = await ParkingSlot.aggregate([{ $match: { societyId: sid } }, { $group: { _id: { status: '$status', type: '$type' }, n: { $sum: 1 } } }]);
    const total = rows.reduce((s, r) => s + r.n, 0);
    const allocated = rows.filter((r) => r._id.status === 'ALLOCATED').reduce((s, r) => s + r.n, 0);
    const available = rows.filter((r) => r._id.status === 'AVAILABLE').reduce((s, r) => s + r.n, 0);
    const byType: Record<string, { total: number; allocated: number }> = {};
    for (const r of rows) { byType[r._id.type] = byType[r._id.type] ?? { total: 0, allocated: 0 }; byType[r._id.type].total += r.n; if (r._id.status === 'ALLOCATED') byType[r._id.type].allocated += r.n; }
    return { total, allocated, available, blocked: total - allocated - available, occupancyPercent: total ? Math.round((allocated / total) * 100) : 0, byType: Object.entries(byType).map(([type, v]) => ({ type, ...v })) };
  }
}

export const vehicleService = new VehicleService();
export const parkingService = new ParkingService();
