import mongoose from 'mongoose';
import { ErrorCodes } from '@society-erp/shared';
import { Resident, type ResidentDoc } from '../../models/resident.model';
import { Unit } from '../../models/unit.model';
import { UnitOccupancy, type UnitOccupancyDoc } from '../../models/unit-occupancy.model';
import { Role } from '../../models/role.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { maskEmail, maskString } from '../../lib/crypto';
import { withTransaction } from '../../lib/mongo';
import { limitService } from '../../core/limits/limit.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { accessControlService } from '../../core/access-control/access-control.service';
import { auditService } from '../../core/audit/audit.service';
import { domainEvents } from '../../core/events/event-bus';
import { societyUserService } from '../society/users.service';

type DuesResolver = (societyId: string, unitId: string) => Promise<number>;
let duesResolver: DuesResolver = async () => 0;
/** The billing module registers the real outstanding-dues lookup. */
export function setDuesResolver(fn: DuesResolver): void {
  duesResolver = fn;
}

export interface Scope {
  unitIds?: string[];
}

function maskResident<T extends Record<string, any>>(r: T, canViewContact: boolean): T {
  if (canViewContact) return r;
  return { ...r, phone: maskString(r.phone, 2), altPhone: maskString(r.altPhone, 2), email: maskEmail(r.email), emergencyContacts: [], documents: [], notes: undefined };
}

class ResidentService {
  // ------------------------------------------------------------------ unit linking
  private async recomputeOccupancy(societyId: string, unitId: string, session?: mongoose.ClientSession): Promise<void> {
    const unit = await Unit.findOne({ _id: unitId, societyId }).session(session ?? null);
    if (!unit) return;
    const [owner, tenant] = await Promise.all([
      Resident.findOne({ societyId, unitId, type: 'OWNER', status: 'ACTIVE', deletedAt: null }).sort({ isPrimary: -1, createdAt: 1 }).session(session ?? null),
      Resident.findOne({ societyId, unitId, type: 'TENANT', status: 'ACTIVE', deletedAt: null }).sort({ isPrimary: -1, createdAt: 1 }).session(session ?? null),
    ]);
    unit.ownerResidentId = owner?._id ?? null;
    unit.tenantResidentId = tenant?._id ?? null;
    unit.occupancyStatus = tenant ? 'TENANT_OCCUPIED' : owner ? 'OWNER_OCCUPIED' : unit.occupancyStatus === 'LOCKED' ? 'LOCKED' : 'VACANT';
    await unit.save({ session });
  }

  // ------------------------------------------------------------------ queries
  async list(societyId: string, query: Record<string, any>, scope: Scope, opts: { canViewContact: boolean }) {
    const filter: Record<string, unknown> = { societyId, deletedAt: null };
    if (scope.unitIds) filter.unitId = { $in: scope.unitIds };
    if (query.unitId) filter.unitId = scope.unitIds ? { $in: scope.unitIds.filter((u) => u === query.unitId) } : query.unitId;
    if (query.buildingId) {
      const units = await Unit.find({ societyId, buildingId: query.buildingId, deletedAt: null }).select('_id').lean();
      filter.unitId = { $in: units.map((u) => u._id) };
    }
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    else filter.status = { $ne: 'MOVED_OUT' };
    if (query.hasLogin === 'true') filter.userId = { $ne: null };
    if (query.hasLogin === 'false') filter.userId = null;
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ name: rx }, { phone: rx }, { email: rx }];
    const page = await paginate(Resident as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: 'name', allowedSorts: ['name', 'createdAt', 'type', 'status', 'moveInDate'], populate: [{ path: 'unitId', select: 'code number floor buildingId', populate: { path: 'buildingId', select: 'name code' } }], select: '-documents' });
    page.items = page.items.map((r: any) => maskResident(r, opts.canViewContact));
    return page;
  }

  async get(societyId: string, id: string, scope: Scope, opts: { canViewContact: boolean }) {
    const resident = await Resident.findOne({ _id: id, societyId, deletedAt: null }).populate('unitId', 'code number floor buildingId').populate('userId', 'name email status lastLoginAt').lean();
    if (!resident) throw Errors.notFound('Resident');
    if (scope.unitIds && !scope.unitIds.includes(String((resident.unitId as any)?._id ?? resident.unitId))) throw Errors.notFound('Resident');
    const moves = await UnitOccupancy.find({ societyId, $or: [{ residentId: resident._id }, { previousResidentId: resident._id }] }).sort({ date: -1 }).limit(20).lean();
    return { ...maskResident(resident as any, opts.canViewContact), moves };
  }

  // ------------------------------------------------------------------ mutations
  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any, session?: mongoose.ClientSession): Promise<ResidentDoc> {
    await limitService.assertWithinLimit(societyId, 'maxResidents');
    const unit = await Unit.findOne({ _id: input.unitId, societyId, deletedAt: null }).session(session ?? null);
    if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
    const [resident] = await Resident.create([{ ...input, email: input.email || undefined, phone: input.phone || undefined, altPhone: input.altPhone || undefined, societyId, status: 'ACTIVE', moveInDate: input.moveInDate ?? new Date(), createdBy: byUserId }], { session });
    if (input.isPrimary) await Resident.updateMany({ societyId, unitId: unit._id, _id: { $ne: resident._id }, type: input.type }, { $set: { isPrimary: false } }).session(session ?? null);
    await this.recomputeOccupancy(societyId, String(unit._id), session);
    auditService.record({ action: 'resident.created', resource: 'Resident', resourceId: resident._id, societyId, newValue: { name: resident.name, type: resident.type, unit: unit.code }, req });
    domainEvents.emit('resident.created', { residentId: String(resident._id), unitId: String(unit._id), type: resident.type }, { societyId, actorId: byUserId });
    if (input.createLogin && input.email) {
      await this.inviteLogin(societyId, String(resident._id), { email: input.email }, byUserId, req);
    }
    return resident;
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any, scope: Scope = {}) {
    const resident = await Resident.findOne({ _id: id, societyId, deletedAt: null });
    if (!resident) throw Errors.notFound('Resident');
    if (scope.unitIds && !scope.unitIds.includes(String(resident.unitId))) throw Errors.notFound('Resident');
    const old = resident.toObject();
    const previousUnit = String(resident.unitId);
    if (patch.unitId && patch.unitId !== previousUnit) {
      const unit = await Unit.findOne({ _id: patch.unitId, societyId, deletedAt: null }).lean();
      if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
    }
    for (const k of ['email', 'phone', 'altPhone']) if (patch[k] === '') patch[k] = undefined;
    resident.set(patch);
    await resident.save();
    if (patch.isPrimary) await Resident.updateMany({ societyId, unitId: resident.unitId, _id: { $ne: resident._id }, type: resident.type }, { $set: { isPrimary: false } });
    await this.recomputeOccupancy(societyId, String(resident.unitId));
    if (patch.unitId && patch.unitId !== previousUnit) await this.recomputeOccupancy(societyId, previousUnit);
    if (resident.userId) await accessControlService.invalidateUser(String(resident.userId));
    auditService.record({ action: 'resident.updated', resource: 'Resident', resourceId: resident._id, societyId, oldValue: { name: old.name, type: old.type, unitId: old.unitId, status: old.status, phone: old.phone }, newValue: patch, req });
    return resident;
  }

  async remove(societyId: string, id: string, byUserId: string, req?: any): Promise<void> {
    const resident = await Resident.findOne({ _id: id, societyId, deletedAt: null });
    if (!resident) throw Errors.notFound('Resident');
    resident.deletedAt = new Date();
    resident.deletedBy = byUserId as any;
    resident.status = 'INACTIVE';
    await resident.save();
    await this.recomputeOccupancy(societyId, String(resident.unitId));
    if (resident.userId) await accessControlService.invalidateUser(String(resident.userId));
    auditService.record({ action: 'resident.deleted', resource: 'Resident', resourceId: resident._id, societyId, oldValue: { name: resident.name, type: resident.type }, req });
  }

  /** Creates (or reuses) a login for a resident with the MEMBER role and links it. */
  async inviteLogin(societyId: string, residentId: string, input: { email?: string; roleIds?: string[] }, byUserId: string, req?: any) {
    const resident = await Resident.findOne({ _id: residentId, societyId, deletedAt: null });
    if (!resident) throw Errors.notFound('Resident');
    const email = (input.email ?? resident.email ?? '').toLowerCase();
    if (!email) throw Errors.validation({ email: ['An email address is required to create a login'] });
    if (!resident.email) {
      resident.email = email;
      await resident.save();
    }
    let roleIds = input.roleIds;
    if (!roleIds?.length) {
      const member = await Role.findOne({ societyId, key: 'MEMBER' }).select('_id').lean();
      if (!member) throw Errors.notFound('Member role');
      roleIds = [String(member._id)];
    }
    return societyUserService.invite(societyId, { email, name: resident.name, phone: resident.phone ?? undefined, roleIds, residentId: String(resident._id), unitId: String(resident.unitId) }, byUserId, req);
  }

  // ------------------------------------------------------------------ move workflows
  async getOutstandingDues(societyId: string, unitId: string): Promise<number> {
    return duesResolver(societyId, unitId);
  }

  async requestMove(societyId: string, input: Record<string, any>, actor: { userId: string; canApprove: boolean }, req?: any): Promise<UnitOccupancyDoc> {
    const unit = await Unit.findOne({ _id: input.unitId, societyId, deletedAt: null }).lean();
    if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
    const cfg = await configurationService.getSocietySetting<{ moveApprovalRequired: boolean; blockMoveOutWithDues: boolean }>(societyId, 'residents.config');
    let previousResidentId: string | null = null;
    if (input.type === 'MOVE_OUT' || input.type === 'TENANT_CHANGE' || input.type === 'OWNER_CHANGE') {
      const current = input.residentId && input.type === 'MOVE_OUT' ? await Resident.findOne({ _id: input.residentId, societyId, unitId: unit._id, status: 'ACTIVE' }).lean() : await Resident.findOne({ societyId, unitId: unit._id, type: input.residentType, status: 'ACTIVE', deletedAt: null }).sort({ isPrimary: -1 }).lean();
      if (input.type === 'MOVE_OUT' && !current) throw Errors.validation({ residentId: ['No active resident found to move out'] });
      previousResidentId = current ? String(current._id) : null;
    }
    const dues = await this.getOutstandingDues(societyId, String(unit._id));
    if (input.type === 'MOVE_OUT' && cfg.blockMoveOutWithDues && dues > 0 && !actor.canApprove) {
      throw Errors.custom(409, ErrorCodes.OUTSTANDING_DUES, `Outstanding dues of ${dues} must be cleared before move-out`, { dues });
    }
    const needsApproval = cfg.moveApprovalRequired && !actor.canApprove;
    const record = await UnitOccupancy.create({
      societyId,
      unitId: unit._id,
      type: input.type,
      residentType: input.residentType,
      residentId: input.type !== 'MOVE_OUT' && input.residentId ? input.residentId : input.type === 'MOVE_OUT' ? previousResidentId : null,
      previousResidentId: input.type === 'MOVE_OUT' ? null : previousResidentId,
      date: input.date,
      notes: input.notes,
      outstandingDues: dues,
      requestedBy: actor.userId,
      approvalStatus: needsApproval ? 'PENDING' : cfg.moveApprovalRequired ? 'APPROVED' : 'NA',
      approvedBy: needsApproval ? undefined : actor.userId,
      approvedAt: needsApproval ? undefined : new Date(),
      pendingResident: input.type !== 'MOVE_OUT' && !input.residentId ? input.resident : null,
    });
    auditService.record({ action: needsApproval ? 'move.requested' : 'move.applied', resource: 'UnitOccupancy', resourceId: record._id, societyId, newValue: { type: input.type, unit: unit.code, residentType: input.residentType, dues }, req });
    if (needsApproval) {
      domainEvents.emit('move.requested', { moveId: String(record._id), type: input.type, unitCode: unit.code, residentName: input.resident?.name ?? 'Resident' }, { societyId, actorId: actor.userId });
      return record;
    }
    await this.applyMove(record, actor.userId, req);
    return record;
  }

  private async applyMove(record: UnitOccupancyDoc, byUserId: string, req?: any): Promise<void> {
    const societyId = String(record.societyId);
    const unitId = String(record.unitId);
    await withTransaction(async (session) => {
      const closePrevious = async (id: string | null) => {
        if (!id) return;
        await Resident.updateOne({ _id: id, societyId }, { $set: { status: 'MOVED_OUT', moveOutDate: record.date } }).session(session ?? null);
      };
      if (record.type === 'MOVE_OUT') {
        await closePrevious(record.residentId ? String(record.residentId) : null);
      } else {
        if (record.type === 'TENANT_CHANGE' || record.type === 'OWNER_CHANGE') await closePrevious(record.previousResidentId ? String(record.previousResidentId) : null);
        if (record.residentId) {
          await Resident.updateOne({ _id: record.residentId, societyId }, { $set: { status: 'ACTIVE', unitId: record.unitId, type: record.residentType, moveInDate: record.date, moveOutDate: null } }).session(session ?? null);
        } else if (record.pendingResident) {
          const created = await this.create(societyId, { ...(record.pendingResident as Record<string, unknown>), type: record.residentType, unitId, moveInDate: record.date, isPrimary: true }, byUserId, req, session);
          record.residentId = created._id;
          record.pendingResident = null;
        }
      }
      await this.recomputeOccupancy(societyId, unitId, session);
      await record.save({ session });
    });
    const affected = await Resident.find({ _id: { $in: [record.residentId, record.previousResidentId].filter(Boolean) }, userId: { $ne: null } }).select('userId').lean();
    for (const r of affected) await accessControlService.invalidateUser(String(r.userId));
    domainEvents.emit('move.applied', { moveId: String(record._id), type: record.type, unitId }, { societyId, actorId: byUserId });
  }

  async approveMove(societyId: string, moveId: string, byUserId: string, req?: any) {
    const record = await UnitOccupancy.findOne({ _id: moveId, societyId });
    if (!record) throw Errors.notFound('Move request');
    if (record.approvalStatus !== 'PENDING') throw Errors.invalidTransition(record.approvalStatus, 'APPROVED', 'Move request');
    record.approvalStatus = 'APPROVED';
    record.approvedBy = byUserId as any;
    record.approvedAt = new Date();
    await record.save();
    await this.applyMove(record, byUserId, req);
    auditService.record({ action: 'move.approved', resource: 'UnitOccupancy', resourceId: record._id, societyId, req });
    return record;
  }

  async rejectMove(societyId: string, moveId: string, reason: string, byUserId: string, req?: any) {
    const record = await UnitOccupancy.findOne({ _id: moveId, societyId });
    if (!record) throw Errors.notFound('Move request');
    if (record.approvalStatus !== 'PENDING') throw Errors.invalidTransition(record.approvalStatus, 'REJECTED', 'Move request');
    record.approvalStatus = 'REJECTED';
    record.rejectionReason = reason;
    record.approvedBy = byUserId as any;
    record.approvedAt = new Date();
    await record.save();
    auditService.record({ action: 'move.rejected', resource: 'UnitOccupancy', resourceId: record._id, societyId, newValue: { reason }, req });
    return record;
  }

  async listMoves(societyId: string, query: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId };
    if (query.type) filter.type = query.type;
    if (query.approvalStatus) filter.approvalStatus = query.approvalStatus;
    if (query.unitId) filter.unitId = query.unitId;
    return paginate(UnitOccupancy as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-date', allowedSorts: ['date', 'createdAt', 'type', 'approvalStatus'], populate: [{ path: 'unitId', select: 'code' }, { path: 'residentId', select: 'name type phone' }, { path: 'previousResidentId', select: 'name type' }, { path: 'requestedBy', select: 'name' }, { path: 'approvedBy', select: 'name' }] });
  }

  // ------------------------------------------------------------------ directory & household
  /** Minimal directory lookup (guards, walk-in registration). Never returns contact details. */
  async lookup(societyId: string, q: string, limit = 10) {
    const rx = searchRegex(q);
    const unitMatches = await Unit.find({ societyId, deletedAt: null, $or: [{ code: rx! }, { number: rx! }] }).select('_id').limit(50).lean();
    const residents = await Resident.find({ societyId, deletedAt: null, status: 'ACTIVE', $or: [{ name: rx! }, { unitId: { $in: unitMatches.map((u) => u._id) } }] })
      .select('name type unitId isPrimary')
      .populate('unitId', 'code buildingId')
      .limit(limit)
      .lean();
    return residents.map((r: any) => ({ id: String(r._id), name: r.name, type: r.type, isPrimary: r.isPrimary, unitId: String(r.unitId?._id ?? r.unitId), unitCode: r.unitId?.code }));
  }

  async household(societyId: string, userId: string) {
    const own = await Resident.find({ societyId, userId, deletedAt: null, status: { $ne: 'MOVED_OUT' } }).populate('unitId', 'code number floor buildingId areaSqft type occupancyStatus').lean();
    const unitIds = [...new Set(own.map((r) => String((r.unitId as any)?._id ?? r.unitId)))];
    const members = await Resident.find({ societyId, unitId: { $in: unitIds }, deletedAt: null, status: { $ne: 'MOVED_OUT' } }).populate('unitId', 'code').lean();
    const cfg = await configurationService.getSocietySetting<{ allowMemberFamilyEdit: boolean }>(societyId, 'residents.config');
    return { me: own, units: own.map((r) => r.unitId), members, canEditFamily: cfg.allowMemberFamilyEdit };
  }

  async addFamilyMember(societyId: string, userId: string, input: Record<string, any>, req?: any) {
    const cfg = await configurationService.getSocietySetting<{ allowMemberFamilyEdit: boolean }>(societyId, 'residents.config');
    if (!cfg.allowMemberFamilyEdit) throw Errors.forbidden('Your society does not allow residents to edit family members');
    const own = await Resident.find({ societyId, userId, deletedAt: null, status: 'ACTIVE' }).select('unitId').lean();
    if (!own.length) throw Errors.forbidden('You are not linked to a unit');
    const unitId = input.unitId ?? String(own[0].unitId);
    if (!own.some((r) => String(r.unitId) === unitId)) throw Errors.forbidden('You can only add members to your own unit');
    const resident = await this.create(societyId, { ...input, unitId, type: input.type ?? 'FAMILY' }, userId, req);
    return resident;
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const [byType, total, withLogin, pendingMoves] = await Promise.all([
      Resident.aggregate([{ $match: { societyId: sid, deletedAt: null, status: { $ne: 'MOVED_OUT' } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      Resident.countDocuments({ societyId, deletedAt: null, status: { $ne: 'MOVED_OUT' } }),
      Resident.countDocuments({ societyId, deletedAt: null, status: { $ne: 'MOVED_OUT' }, userId: { $ne: null } }),
      UnitOccupancy.countDocuments({ societyId, approvalStatus: 'PENDING' }),
    ]);
    return { total, withLogin, pendingMoves, byType: Object.fromEntries(byType.map((r) => [r._id, r.count])) };
  }

  async exportRows(societyId: string, canViewContact: boolean) {
    const rows = await Resident.find({ societyId, deletedAt: null }).sort({ name: 1 }).populate('unitId', 'code').lean();
    return rows.map((r: any) => ({ name: r.name, type: r.type, unit: r.unitId?.code ?? '', phone: canViewContact ? r.phone ?? '' : maskString(r.phone, 2) ?? '', email: canViewContact ? r.email ?? '' : maskEmail(r.email) ?? '', status: r.status, isPrimary: r.isPrimary ? 'yes' : 'no', moveInDate: r.moveInDate ? new Date(r.moveInDate).toISOString().slice(0, 10) : '', hasLogin: r.userId ? 'yes' : 'no' }));
  }
}

export const residentService = new ResidentService();
