import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { Asset, type AssetDoc } from '../../models/asset.model';
import { Vendor } from '../../models/vendor.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { categoryService } from '../../core/categories/category.service';
import { storageService } from '../../core/storage/storage.service';
import { domainEvents } from '../../core/events/event-bus';
import { expenseService } from '../expenses/expenses.service';

export interface AssetsConfig { maintenanceReminderDays: number; warrantyReminderDays: number; defaultLifeYears: number }

const POPULATE = [
  { path: 'vendorId', select: 'name' },
  { path: 'buildingId', select: 'name code' },
  { path: 'contractId', select: 'contractNumber title endDate status vendorName' },
  { path: 'maintenanceLog.byUserId', select: 'name' },
  { path: 'maintenanceLog.expenseId', select: 'expenseNumber total approvalStatus paymentStatus' },
];

/** Straight-line book value: cost less (cost - salvage) spread over the expected life, floored at salvage. */
export function bookValue(a: { purchaseCost?: number; purchaseDate?: Date | null; expectedLifeYears?: number; salvageValue?: number }, now = new Date()): number {
  const cost = a.purchaseCost ?? 0;
  if (!cost || !a.purchaseDate || !a.expectedLifeYears) return cost;
  const ageYears = Math.max(0, (now.getTime() - new Date(a.purchaseDate).getTime()) / (365.25 * 86_400_000));
  const salvage = Math.min(a.salvageValue ?? 0, cost);
  const value = cost - ((cost - salvage) * Math.min(1, ageYears / a.expectedLifeYears));
  return Math.round(value * 100) / 100;
}

class AssetService {
  getConfig(societyId: string): Promise<AssetsConfig> { return configurationService.getSocietySetting<AssetsConfig>(societyId, 'assets.config'); }

  async updateConfig(societyId: string, patch: Partial<AssetsConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'assets.config', patch, byUserId);
    auditService.record({ action: 'assets.config_updated', resource: 'SocietySetting', resourceId: 'assets.config', societyId, newValue: patch, req });
    return merged;
  }

  async categories(societyId: string) {
    await categoryService.ensureDefaults(societyId, undefined, ['ASSET_CATEGORY']);
    return categoryService.list(societyId, 'ASSET_CATEGORY');
  }

  // ------------------------------------------------------------------ helpers
  private async vendorName(societyId: string, vendorId?: string | null, fallback?: string) {
    if (!vendorId) return fallback;
    const vendor = await Vendor.findOne({ _id: vendorId, societyId, deletedAt: null }).select('name').lean();
    if (!vendor) throw Errors.validation({ vendorId: ['Vendor not found'] });
    return vendor.name;
  }

  private async present(doc: any, now = new Date()) {
    const out: any = { ...doc, id: String(doc._id), currentValue: bookValue(doc, now) };
    out.warrantyActive = Boolean(doc.warrantyUntil && new Date(doc.warrantyUntil) >= now);
    out.maintenanceOverdue = Boolean(doc.nextMaintenanceDue && doc.status !== 'DISPOSED' && new Date(doc.nextMaintenanceDue) < now);
    out.maintenanceCost = (doc.maintenanceLog ?? []).reduce((s: number, m: any) => s + (m.cost ?? 0), 0);
    out.photos = await Promise.all((doc.photos ?? []).map(async (p: any) => ({ ...p, id: String(p._id ?? ''), url: await storageService.signedUrl(p.storageKey, { expiresInSeconds: 900 }).catch(() => null) })));
    out.documents = await Promise.all((doc.documents ?? []).map(async (p: any) => ({ ...p, id: String(p._id ?? ''), url: await storageService.signedUrl(p.storageKey, { expiresInSeconds: 900 }).catch(() => null) })));
    out.maintenanceLog = [...(doc.maintenanceLog ?? [])].sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime()).map((m: any) => ({ ...m, id: String(m._id ?? '') }));
    return out;
  }

  private async load(societyId: string, id: string): Promise<AssetDoc> {
    const doc = await Asset.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Asset');
    return doc;
  }

  // ------------------------------------------------------------------ CRUD
  async list(societyId: string, query: Record<string, any>) {
    const now = new Date();
    const filter: Record<string, unknown> = { societyId, deletedAt: null };
    if (query.status) filter.status = query.status;
    else if (!query.includeDisposed) filter.status = { $ne: 'DISPOSED' };
    if (query.categoryKey) filter.categoryKey = String(query.categoryKey).toUpperCase();
    if (query.buildingId) filter.buildingId = query.buildingId;
    if (query.contractId) filter.contractId = query.contractId;
    if (query.maintenanceDue) filter.nextMaintenanceDue = { $ne: null, $lte: dayjs(now).add(30, 'day').toDate() };
    if (query.warrantyExpiring) filter.warrantyUntil = { $gte: now, $lte: dayjs(now).add(90, 'day').toDate() };
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ name: rx }, { assetCode: rx }, { serialNumber: rx }, { location: rx }, { make: rx }, { model: rx }];
    const page = await paginate(Asset as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: 'name', allowedSorts: ['name', 'assetCode', 'categoryKey', 'status', 'purchaseDate', 'purchaseCost', 'nextMaintenanceDue', 'warrantyUntil'], populate: POPULATE.slice(0, 3) });
    return { ...page, items: page.items.map((a: any) => ({ ...a, id: String(a._id), currentValue: bookValue(a, now), warrantyActive: Boolean(a.warrantyUntil && new Date(a.warrantyUntil) >= now), maintenanceOverdue: Boolean(a.nextMaintenanceDue && a.status !== 'DISPOSED' && new Date(a.nextMaintenanceDue) < now), maintenanceLog: undefined, maintenanceCount: (a.maintenanceLog ?? []).length, photos: undefined, documents: undefined })) };
  }

  async get(societyId: string, id: string) {
    const doc = await Asset.findOne({ _id: id, societyId, deletedAt: null }).populate(POPULATE).lean();
    if (!doc) throw Errors.notFound('Asset');
    return this.present(doc);
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const categories = await this.categories(societyId);
    const categoryKey = String(input.categoryKey).toUpperCase();
    if (!categories.some((c: any) => c.key === categoryKey)) throw Errors.validation({ categoryKey: ['Unknown asset category'] });
    const cfg = await this.getConfig(societyId);
    const vendorName = await this.vendorName(societyId, input.vendorId, input.vendorName);
    const assetCode = await sequenceService.next(societyId, 'asset', { prefix: 'AST', padding: 4 });
    const nextMaintenanceDue = input.nextMaintenanceDue ?? (input.maintenanceIntervalMonths && input.purchaseDate ? dayjs(input.purchaseDate).add(input.maintenanceIntervalMonths, 'month').toDate() : null);
    const doc = await Asset.create({ ...input, societyId, assetCode, categoryKey, vendorName, expectedLifeYears: input.expectedLifeYears ?? cfg.defaultLifeYears, nextMaintenanceDue, status: input.status ?? 'ACTIVE', createdBy: byUserId });
    auditService.record({ action: 'asset.created', resource: 'Asset', resourceId: doc._id, societyId, newValue: { assetCode, name: doc.name, categoryKey, purchaseCost: doc.purchaseCost }, req });
    domainEvents.emit('assets.changed', { assetId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, String(doc._id));
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    if (patch.categoryKey) {
      patch.categoryKey = String(patch.categoryKey).toUpperCase();
      const categories = await this.categories(societyId);
      if (!categories.some((c: any) => c.key === patch.categoryKey)) throw Errors.validation({ categoryKey: ['Unknown asset category'] });
    }
    if (patch.vendorId !== undefined) patch.vendorName = await this.vendorName(societyId, patch.vendorId, patch.vendorName ?? doc.vendorName);
    if (patch.warrantyUntil && (!doc.warrantyUntil || new Date(patch.warrantyUntil).getTime() !== doc.warrantyUntil.getTime())) doc.set('reminders.warrantySent', false);
    doc.set(patch);
    await doc.save();
    auditService.record({ action: 'asset.updated', resource: 'Asset', resourceId: doc._id, societyId, newValue: patch, req });
    domainEvents.emit('assets.changed', { assetId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, id);
  }

  async setStatus(societyId: string, id: string, input: { status: string; note?: string; disposal?: { at?: Date; reason?: string; amount?: number } }, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    if (doc.status === 'DISPOSED') throw Errors.invalidTransition('DISPOSED', input.status, 'Asset');
    const from = doc.status;
    doc.status = input.status as any;
    if (input.status === 'DISPOSED') { doc.set('disposal', { at: input.disposal?.at ?? new Date(), reason: input.disposal?.reason ?? input.note, amount: input.disposal?.amount ?? 0, byUserId }); doc.nextMaintenanceDue = null; }
    if (input.status === 'UNDER_MAINTENANCE') doc.maintenanceLog.push({ at: new Date(), type: 'BREAKDOWN', description: input.note ?? 'Taken out of service', byUserId: byUserId as any, cost: 0, attachments: [] } as any);
    await doc.save();
    auditService.record({ action: 'asset.status_changed', resource: 'Asset', resourceId: doc._id, societyId, oldValue: { status: from }, newValue: { status: input.status, note: input.note, disposal: input.disposal }, req });
    domainEvents.emit('assets.changed', { assetId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, id);
  }

  /** Appends a maintenance entry; optionally books the cost as an expense linked to the asset. */
  async logMaintenance(societyId: string, id: string, input: Record<string, any>, byUserId: string, req?: any, opts: { silent?: boolean } = {}) {
    const doc = await this.load(societyId, id);
    if (doc.status === 'DISPOSED') throw Errors.invalidTransition('DISPOSED', 'MAINTENANCE', 'Asset');
    const at = input.at ?? new Date();
    const vendorName = await this.vendorName(societyId, input.vendorId, input.vendorName);
    let expenseId: string | null = null;
    if (input.createExpense && (input.cost ?? 0) > 0) {
      const expense = await expenseService.create(societyId, { title: `${doc.name} · ${String(input.type ?? 'PREVENTIVE').replace(/_/g, ' ').toLowerCase()} maintenance`, description: input.description, vendorId: input.vendorId ?? null, vendorName: vendorName, categoryKey: input.expenseCategoryKey ?? 'REPAIRS', billDate: at, amount: input.cost, taxRate: 0, tdsAmount: 0, attachments: input.attachments ?? [], assetId: String(doc._id), contractId: input.contractId ?? null, submit: true }, byUserId, req);
      expenseId = String((expense as any).id ?? (expense as any)._id);
    }
    doc.maintenanceLog.push({ at, type: input.type ?? 'PREVENTIVE', description: input.description, cost: input.cost ?? 0, vendorId: input.vendorId ?? null, vendorName, expenseId, contractId: input.contractId ?? null, downtimeHours: input.downtimeHours ?? 0, byUserId, attachments: input.attachments ?? [] } as any);
    doc.lastMaintenanceAt = at;
    if (input.nextDue !== undefined) doc.nextMaintenanceDue = input.nextDue;
    else if (doc.maintenanceIntervalMonths) doc.nextMaintenanceDue = dayjs(at).add(doc.maintenanceIntervalMonths, 'month').toDate();
    doc.set('reminders.maintenanceFor', null);
    if (doc.status === 'UNDER_MAINTENANCE' && input.backInService !== false) doc.status = 'ACTIVE';
    await doc.save();
    auditService.record({ action: 'asset.maintenance_logged', resource: 'Asset', resourceId: doc._id, societyId, newValue: { at, type: input.type, description: input.description, cost: input.cost ?? 0, expenseId }, req });
    if (!opts.silent) domainEvents.emit('assets.changed', { assetId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, id);
  }

  async remove(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    doc.deletedAt = new Date();
    doc.deletedBy = byUserId as any;
    await doc.save();
    auditService.record({ action: 'asset.deleted', resource: 'Asset', resourceId: doc._id, societyId, oldValue: { assetCode: doc.assetCode, name: doc.name }, req });
    domainEvents.emit('assets.changed', { assetId: String(doc._id) }, { societyId, actorId: byUserId });
  }

  // ------------------------------------------------------------------ reporting & jobs
  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const now = new Date();
    const live = { societyId: sid, deletedAt: null, status: { $ne: 'DISPOSED' } };
    const [byStatus, byCategory, cost, maintenanceDue, warrantyExpiring, spend12m, all] = await Promise.all([
      Asset.aggregate([{ $match: { societyId: sid, deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Asset.aggregate([{ $match: live }, { $group: { _id: '$categoryKey', count: { $sum: 1 }, cost: { $sum: '$purchaseCost' } } }, { $sort: { count: -1 } }]),
      Asset.aggregate([{ $match: live }, { $group: { _id: null, total: { $sum: '$purchaseCost' } } }]),
      Asset.countDocuments({ societyId, deletedAt: null, status: { $ne: 'DISPOSED' }, nextMaintenanceDue: { $ne: null, $lte: dayjs(now).add(30, 'day').toDate() } }),
      Asset.countDocuments({ societyId, deletedAt: null, status: { $ne: 'DISPOSED' }, warrantyUntil: { $gte: now, $lte: dayjs(now).add(90, 'day').toDate() } }),
      Asset.aggregate([{ $match: { societyId: sid, deletedAt: null } }, { $unwind: '$maintenanceLog' }, { $match: { 'maintenanceLog.at': { $gte: dayjs(now).subtract(12, 'month').toDate() } } }, { $group: { _id: null, total: { $sum: '$maintenanceLog.cost' }, count: { $sum: 1 } } }]),
      Asset.find({ societyId, deletedAt: null, status: { $ne: 'DISPOSED' } }).select('purchaseCost purchaseDate expectedLifeYears salvageValue').lean(),
    ]);
    const status = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    return { total: all.length, byStatus: status, underMaintenance: status.UNDER_MAINTENANCE ?? 0, byCategory: byCategory.map((c) => ({ category: c._id, count: c.count, cost: c.cost })), purchaseCost: cost[0]?.total ?? 0, currentValue: Math.round(all.reduce((s, a) => s + bookValue(a, now), 0) * 100) / 100, maintenanceDue, warrantyExpiring, maintenanceSpend12m: spend12m[0]?.total ?? 0, maintenanceEvents12m: spend12m[0]?.count ?? 0 };
  }

  async exportRows(societyId: string, query: Record<string, any>) {
    const rows: Record<string, unknown>[] = [];
    let page = 1;
    while (rows.length < 5000) {
      const res = await this.list(societyId, { ...query, page, limit: 200 });
      rows.push(...res.items.map((a: any) => ({ code: a.assetCode, name: a.name, category: a.categoryKey, status: a.status, location: a.location ?? '', building: a.buildingId?.name ?? '', make: a.make ?? '', model: a.model ?? '', serialNumber: a.serialNumber ?? '', purchaseDate: a.purchaseDate ? dayjs(a.purchaseDate).format('YYYY-MM-DD') : '', purchaseCost: a.purchaseCost, currentValue: a.currentValue, warrantyUntil: a.warrantyUntil ? dayjs(a.warrantyUntil).format('YYYY-MM-DD') : '', amc: a.contractId?.contractNumber ?? '', nextMaintenanceDue: a.nextMaintenanceDue ? dayjs(a.nextMaintenanceDue).format('YYYY-MM-DD') : '', custodian: a.custodian ?? '' })));
      if (page >= res.pages) break;
      page += 1;
    }
    return rows;
  }

  /** Reminder sweep: maintenance coming due and warranties about to lapse, each announced once. */
  async sweep(now = new Date()) {
    let maintenance = 0;
    let warranty = 0;
    const societies = await Asset.distinct('societyId', { deletedAt: null, status: { $ne: 'DISPOSED' } });
    for (const societyId of societies) {
      const cfg = await this.getConfig(String(societyId));
      const due = await Asset.find({ societyId, deletedAt: null, status: { $ne: 'DISPOSED' }, nextMaintenanceDue: { $ne: null, $lte: dayjs(now).add(cfg.maintenanceReminderDays, 'day').toDate() } }).select('assetCode name nextMaintenanceDue reminders location').lean();
      for (const a of due) {
        if (a.reminders?.maintenanceFor && new Date(a.reminders.maintenanceFor).getTime() === new Date(a.nextMaintenanceDue!).getTime()) continue;
        await Asset.updateOne({ _id: a._id }, { $set: { 'reminders.maintenanceFor': a.nextMaintenanceDue } });
        maintenance += 1;
        domainEvents.emit('asset.maintenance_due', { assetId: String(a._id), assetCode: a.assetCode, name: a.name, dueDate: a.nextMaintenanceDue, location: a.location ?? null, overdue: new Date(a.nextMaintenanceDue!) < now }, { societyId: String(societyId) });
      }
      const lapsing = await Asset.find({ societyId, deletedAt: null, status: { $ne: 'DISPOSED' }, 'reminders.warrantySent': { $ne: true }, warrantyUntil: { $ne: null, $gte: now, $lte: dayjs(now).add(cfg.warrantyReminderDays, 'day').toDate() } }).select('assetCode name warrantyUntil').lean();
      for (const a of lapsing) {
        const res = await Asset.updateOne({ _id: a._id, 'reminders.warrantySent': { $ne: true } }, { $set: { 'reminders.warrantySent': true } });
        if (!res.modifiedCount) continue;
        warranty += 1;
        domainEvents.emit('asset.warranty_expiring', { assetId: String(a._id), assetCode: a.assetCode, name: a.name, warrantyUntil: a.warrantyUntil }, { societyId: String(societyId) });
      }
    }
    return { maintenance, warranty };
  }
}

export const assetService = new AssetService();
