import mongoose from 'mongoose';
import { Building } from '../../models/building.model';
import { Unit } from '../../models/unit.model';
import '../../models/resident.model'; // registers the Resident model for populate()
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { limitService } from '../../core/limits/limit.service';
import { auditService } from '../../core/audit/audit.service';
import { domainEvents } from '../../core/events/event-bus';

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class UnitService {
  // ------------------------------------------------------------------ buildings
  async listBuildings(societyId: string) {
    const [buildings, counts] = await Promise.all([
      Building.find({ societyId, deletedAt: null }).sort({ sortOrder: 1, name: 1 }).lean(),
      Unit.aggregate([{ $match: { societyId: new mongoose.Types.ObjectId(societyId), deletedAt: null } }, { $group: { _id: '$buildingId', units: { $sum: 1 }, occupied: { $sum: { $cond: [{ $in: ['$occupancyStatus', ['OWNER_OCCUPIED', 'TENANT_OCCUPIED']] }, 1, 0] } } } }]),
    ]);
    const map = new Map(counts.map((c) => [String(c._id), c]));
    return buildings.map((b) => ({ ...b, id: String(b._id), unitCount: map.get(String(b._id))?.units ?? 0, occupiedCount: map.get(String(b._id))?.occupied ?? 0 }));
  }

  async getBuilding(societyId: string, id: string) {
    const b = await Building.findOne({ _id: id, societyId, deletedAt: null });
    if (!b) throw Errors.notFound('Building');
    return b;
  }

  async createBuilding(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const code = String(input.code).toUpperCase();
    if (await Building.exists({ societyId, code, deletedAt: null })) throw Errors.conflict(`Building code ${code} already exists`);
    if (input.parentId) await this.getBuilding(societyId, input.parentId);
    const count = await Building.countDocuments({ societyId, deletedAt: null });
    const b = await Building.create({ ...input, code, societyId, sortOrder: input.sortOrder ?? count, createdBy: byUserId });
    auditService.record({ action: 'building.created', resource: 'Building', resourceId: b._id, societyId, newValue: { name: b.name, code: b.code, type: b.type }, req });
    return b.toJSON();
  }

  async updateBuilding(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const b = await this.getBuilding(societyId, id);
    const old = b.toObject();
    if (patch.code && String(patch.code).toUpperCase() !== b.code && (await Building.exists({ societyId, code: String(patch.code).toUpperCase(), deletedAt: null, _id: { $ne: b._id } }))) throw Errors.conflict('Building code already exists');
    if (patch.parentId && String(patch.parentId) === String(b._id)) throw Errors.badRequest('A building cannot be its own parent');
    b.set({ ...patch, ...(patch.code ? { code: String(patch.code).toUpperCase() } : {}) });
    await b.save();
    auditService.record({ action: 'building.updated', resource: 'Building', resourceId: b._id, societyId, oldValue: { name: old.name, code: old.code, floors: old.floors }, newValue: patch, req });
    return b.toJSON();
  }

  async deleteBuilding(societyId: string, id: string, byUserId: string, req?: any): Promise<void> {
    const b = await this.getBuilding(societyId, id);
    const units = await Unit.countDocuments({ societyId, buildingId: b._id, deletedAt: null });
    if (units > 0) throw Errors.conflict(`Building has ${units} unit(s). Move or delete them first.`);
    b.deletedAt = new Date();
    b.deletedBy = byUserId as any;
    await b.save();
    auditService.record({ action: 'building.deleted', resource: 'Building', resourceId: b._id, societyId, oldValue: { name: b.name, code: b.code }, req });
  }

  // ------------------------------------------------------------------ units
  private async buildCode(societyId: string, input: { code?: string; buildingId?: string | null; number: string }): Promise<string> {
    if (input.code) return input.code.toUpperCase();
    if (input.buildingId) {
      const b = await Building.findOne({ _id: input.buildingId, societyId }).select('code').lean();
      if (b) return `${b.code}-${input.number}`.toUpperCase();
    }
    return input.number.toUpperCase();
  }

  async list(societyId: string, query: Record<string, any>, scope: { unitIds?: string[] } = {}) {
    const filter: Record<string, unknown> = { societyId, deletedAt: null };
    if (scope.unitIds) filter._id = { $in: scope.unitIds };
    if (query.buildingId) filter.buildingId = query.buildingId;
    if (query.floor !== undefined) filter.floor = query.floor;
    if (query.type) filter.type = String(query.type).toUpperCase();
    if (query.occupancyStatus) filter.occupancyStatus = query.occupancyStatus;
    if (query.vacantOnly) filter.occupancyStatus = 'VACANT';
    if (query.status) filter.status = query.status;
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ code: rx }, { number: rx }];
    return paginate(Unit as any, filter, {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      defaultSort: 'code',
      allowedSorts: ['code', 'floor', 'areaSqft', 'createdAt', 'occupancyStatus'],
      populate: [{ path: 'buildingId', select: 'name code type' }, { path: 'ownerResidentId', select: 'name phone email type' }, { path: 'tenantResidentId', select: 'name phone email type' }],
    });
  }

  async get(societyId: string, id: string, scope: { unitIds?: string[] } = {}) {
    const filter: Record<string, unknown> = { _id: id, societyId, deletedAt: null };
    if (scope.unitIds && !scope.unitIds.includes(id)) throw Errors.notFound('Unit');
    const unit = await Unit.findOne(filter).populate('buildingId', 'name code type').populate('ownerResidentId', 'name phone email type status').populate('tenantResidentId', 'name phone email type status').lean();
    if (!unit) throw Errors.notFound('Unit');
    return { ...unit, id: String(unit._id) };
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    await limitService.assertWithinLimit(societyId, 'maxUnits');
    if (input.buildingId) await this.getBuilding(societyId, input.buildingId);
    const code = await this.buildCode(societyId, input as { code?: string; buildingId?: string | null; number: string });
    if (await Unit.exists({ societyId, code, deletedAt: null })) throw Errors.conflict(`Unit ${code} already exists`);
    const unit = await Unit.create({ ...input, code, type: String(input.type ?? 'FLAT').toUpperCase(), societyId, createdBy: byUserId });
    auditService.record({ action: 'unit.created', resource: 'Unit', resourceId: unit._id, societyId, newValue: { code, type: unit.type, buildingId: input.buildingId }, req });
    domainEvents.emit('unit.created', { unitId: String(unit._id), code }, { societyId, actorId: byUserId });
    return unit.toJSON();
  }

  async bulkCreate(societyId: string, input: { buildingId: string; floorFrom: number; floorTo: number; unitsPerFloor: number; numberPattern: string; type: string; areaSqft?: number }, byUserId: string, req?: any) {
    const building = await this.getBuilding(societyId, input.buildingId);
    const from = Math.min(input.floorFrom, input.floorTo);
    const to = Math.max(input.floorFrom, input.floorTo);
    const total = (to - from + 1) * input.unitsPerFloor;
    await limitService.assertWithinLimit(societyId, 'maxUnits', total);
    const existing = new Set((await Unit.find({ societyId, deletedAt: null }).select('code').lean()).map((u) => u.code));
    const docs: Record<string, unknown>[] = [];
    const skipped: string[] = [];
    for (let floor = from; floor <= to; floor += 1) {
      for (let seq = 1; seq <= input.unitsPerFloor; seq += 1) {
        const number = input.numberPattern
          .replace('{building}', building.code)
          .replace('{floor}', String(floor))
          .replace('{seq2}', String(seq).padStart(2, '0'))
          .replace('{seq}', String(seq));
        const code = `${building.code}-${number}`.toUpperCase();
        if (existing.has(code)) {
          skipped.push(code);
          continue;
        }
        existing.add(code);
        docs.push({ societyId, buildingId: building._id, floor, number, code, type: input.type.toUpperCase(), areaSqft: input.areaSqft ?? 0, createdBy: byUserId });
      }
    }
    const created = docs.length ? await Unit.insertMany(docs) : [];
    if (building.floors < to) {
      building.floors = to;
      await building.save();
    }
    auditService.record({ action: 'unit.bulk_created', resource: 'Unit', societyId, newValue: { building: building.code, created: created.length, skipped: skipped.length }, req });
    return { created: created.length, skipped };
  }

  async update(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const unit = await Unit.findOne({ _id: id, societyId, deletedAt: null });
    if (!unit) throw Errors.notFound('Unit');
    const old = unit.toObject();
    if (patch.buildingId) await this.getBuilding(societyId, patch.buildingId);
    if (patch.code || patch.number) {
      const code = patch.code ? String(patch.code).toUpperCase() : unit.code;
      if (code !== unit.code && (await Unit.exists({ societyId, code, deletedAt: null, _id: { $ne: unit._id } }))) throw Errors.conflict(`Unit ${code} already exists`);
      patch.code = code;
    }
    if (patch.type) patch.type = String(patch.type).toUpperCase();
    unit.set(patch);
    await unit.save();
    auditService.record({ action: 'unit.updated', resource: 'Unit', resourceId: unit._id, societyId, oldValue: { code: old.code, type: old.type, areaSqft: old.areaSqft, occupancyStatus: old.occupancyStatus, status: old.status }, newValue: patch, req });
    return this.get(societyId, id);
  }

  async remove(societyId: string, id: string, byUserId: string, req?: any): Promise<void> {
    const unit = await Unit.findOne({ _id: id, societyId, deletedAt: null });
    if (!unit) throw Errors.notFound('Unit');
    if (unit.ownerResidentId || unit.tenantResidentId) throw Errors.conflict('Unit has linked residents. Move them out before deleting.');
    unit.deletedAt = new Date();
    unit.deletedBy = byUserId as any;
    unit.status = 'INACTIVE';
    await unit.save();
    auditService.record({ action: 'unit.deleted', resource: 'Unit', resourceId: unit._id, societyId, oldValue: { code: unit.code }, req });
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const [byOccupancy, byType, total] = await Promise.all([
      Unit.aggregate([{ $match: { societyId: sid, deletedAt: null } }, { $group: { _id: '$occupancyStatus', count: { $sum: 1 } } }]),
      Unit.aggregate([{ $match: { societyId: sid, deletedAt: null } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      Unit.countDocuments({ societyId, deletedAt: null }),
    ]);
    return { total, byOccupancy: Object.fromEntries(byOccupancy.map((r) => [r._id, r.count])), byType: Object.fromEntries(byType.map((r) => [r._id, r.count])) };
  }

  async exportRows(societyId: string) {
    const units = await Unit.find({ societyId, deletedAt: null }).sort({ code: 1 }).populate('buildingId', 'name code').populate('ownerResidentId', 'name phone').populate('tenantResidentId', 'name phone').lean();
    return units.map((u: any) => ({ code: u.code, building: u.buildingId?.name ?? '', floor: u.floor, number: u.number, type: u.type, areaSqft: u.areaSqft, occupancy: u.occupancyStatus, owner: u.ownerResidentId?.name ?? '', ownerPhone: u.ownerResidentId?.phone ?? '', tenant: u.tenantResidentId?.name ?? '', status: u.status }));
  }

  /** Used by other modules to validate a unit belongs to the society. */
  async assertUnit(societyId: string, unitId: string) {
    const unit = await Unit.findOne({ _id: unitId, societyId, deletedAt: null }).lean();
    if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
    return unit;
  }

  escape = escapeRx;
}

export const unitService = new UnitService();
