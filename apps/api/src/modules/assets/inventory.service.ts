import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { InventoryItem, StockTransaction, type InventoryItemDoc } from '../../models/inventory.model';
import { Vendor } from '../../models/vendor.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { categoryService } from '../../core/categories/category.service';
import { domainEvents } from '../../core/events/event-bus';

export interface InventoryConfig { lowStockAlertRoleKeys: string[]; realertAfterDays: number; allowNegativeStock: boolean }
export interface StockInput { type: 'IN' | 'OUT' | 'ADJUST'; quantity: number; unitCost?: number; reference?: { type?: string; id?: string | null; label?: string }; issuedTo?: string; note?: string; at?: Date; clientRef?: string }

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

class InventoryService {
  getConfig(societyId: string): Promise<InventoryConfig> { return configurationService.getSocietySetting<InventoryConfig>(societyId, 'inventory.config'); }

  async updateConfig(societyId: string, patch: Partial<InventoryConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'inventory.config', patch, byUserId);
    auditService.record({ action: 'inventory.config_updated', resource: 'SocietySetting', resourceId: 'inventory.config', societyId, newValue: patch, req });
    return merged;
  }

  async categories(societyId: string) {
    await categoryService.ensureDefaults(societyId, undefined, ['INVENTORY_CATEGORY']);
    return categoryService.list(societyId, 'INVENTORY_CATEGORY');
  }

  private present(doc: any) {
    return { ...doc, id: String(doc._id), isLow: (doc.currentStock ?? 0) <= (doc.minimumLevel ?? 0), stockValue: round2((doc.currentStock ?? 0) * (doc.unitCost ?? 0)) };
  }

  private async load(societyId: string, id: string): Promise<InventoryItemDoc> {
    const doc = await InventoryItem.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Inventory item');
    return doc;
  }

  // ------------------------------------------------------------------ items
  async list(societyId: string, query: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId, deletedAt: null };
    if (query.status) filter.status = query.status;
    if (query.categoryKey) filter.categoryKey = String(query.categoryKey).toUpperCase();
    if (query.lowStockOnly) filter.$expr = { $lte: ['$currentStock', '$minimumLevel'] };
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ name: rx }, { sku: rx }, { location: rx }];
    const page = await paginate(InventoryItem as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: 'name', allowedSorts: ['name', 'sku', 'categoryKey', 'currentStock', 'unitCost', 'updatedAt'], populate: [{ path: 'vendorId', select: 'name' }] });
    return { ...page, items: page.items.map((i: any) => this.present(i)) };
  }

  async get(societyId: string, id: string) {
    const doc = await InventoryItem.findOne({ _id: id, societyId, deletedAt: null }).populate('vendorId', 'name').lean();
    if (!doc) throw Errors.notFound('Inventory item');
    const recent = await StockTransaction.find({ societyId, itemId: doc._id }).sort({ at: -1, createdAt: -1 }).limit(20).populate('byUserId', 'name').lean();
    const monthAgo = dayjs().subtract(30, 'day').toDate();
    const usage = await StockTransaction.aggregate([{ $match: { societyId: new mongoose.Types.ObjectId(societyId), itemId: doc._id, type: 'OUT', at: { $gte: monthAgo } } }, { $group: { _id: null, qty: { $sum: { $abs: '$quantity' } } } }]);
    return { ...this.present(doc), recentTransactions: recent.map((t) => ({ ...t, id: String(t._id) })), consumed30d: usage[0]?.qty ?? 0 };
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const categories = await this.categories(societyId);
    const categoryKey = String(input.categoryKey).toUpperCase();
    if (!categories.some((c: any) => c.key === categoryKey)) throw Errors.validation({ categoryKey: ['Unknown inventory category'] });
    if (input.vendorId && !(await Vendor.exists({ _id: input.vendorId, societyId, deletedAt: null }))) throw Errors.validation({ vendorId: ['Vendor not found'] });
    const sku = input.sku ? String(input.sku).toUpperCase() : await sequenceService.next(societyId, 'inventory_item', { prefix: 'INV', padding: 4 });
    if (await InventoryItem.exists({ societyId, sku, deletedAt: null })) throw Errors.conflict('An item with this SKU already exists');
    const doc = await InventoryItem.create({ ...input, sku, societyId, categoryKey, currentStock: 0, createdBy: byUserId });
    auditService.record({ action: 'inventory.item_created', resource: 'InventoryItem', resourceId: doc._id, societyId, newValue: { sku, name: doc.name, categoryKey, minimumLevel: doc.minimumLevel }, req });
    if (input.openingStock > 0) await this.transact(societyId, String(doc._id), { type: 'IN', quantity: input.openingStock, unitCost: input.unitCost ?? 0, note: 'Opening stock', reference: { type: 'MANUAL', label: 'Opening stock' } }, byUserId, req);
    domainEvents.emit('inventory.changed', { itemId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, String(doc._id));
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    if (patch.categoryKey) {
      patch.categoryKey = String(patch.categoryKey).toUpperCase();
      const categories = await this.categories(societyId);
      if (!categories.some((c: any) => c.key === patch.categoryKey)) throw Errors.validation({ categoryKey: ['Unknown inventory category'] });
    }
    if (patch.sku) { patch.sku = String(patch.sku).toUpperCase(); if (patch.sku !== doc.sku && (await InventoryItem.exists({ societyId, sku: patch.sku, deletedAt: null }))) throw Errors.conflict('An item with this SKU already exists'); }
    if (patch.vendorId && !(await Vendor.exists({ _id: patch.vendorId, societyId, deletedAt: null }))) throw Errors.validation({ vendorId: ['Vendor not found'] });
    doc.set(patch);
    await doc.save();
    auditService.record({ action: 'inventory.item_updated', resource: 'InventoryItem', resourceId: doc._id, societyId, newValue: patch, req });
    domainEvents.emit('inventory.changed', { itemId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, id);
  }

  async remove(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    doc.deletedAt = new Date();
    doc.deletedBy = byUserId as any;
    doc.status = 'INACTIVE';
    await doc.save();
    auditService.record({ action: 'inventory.item_deleted', resource: 'InventoryItem', resourceId: doc._id, societyId, oldValue: { sku: doc.sku, name: doc.name, currentStock: doc.currentStock }, req });
    domainEvents.emit('inventory.changed', { itemId: String(doc._id) }, { societyId, actorId: byUserId });
  }

  // ------------------------------------------------------------------ stock movements
  /**
   * Atomic stock movement. OUT is guarded against going negative (unless the society allows it),
   * IN re-averages the unit cost, ADJUST sets the counted quantity. Replays with the same clientRef are ignored.
   */
  async transact(societyId: string, id: string, input: StockInput, byUserId: string | null, req?: any) {
    if (input.clientRef) {
      const dup = await StockTransaction.findOne({ societyId, clientRef: input.clientRef }).lean();
      if (dup) return { ...dup, id: String(dup._id), replayed: true };
    }
    const item = await this.load(societyId, id);
    if (item.status !== 'ACTIVE' && input.type !== 'ADJUST') throw Errors.conflict('Item is inactive');
    const cfg = await this.getConfig(societyId);
    const qty = round3(input.quantity);
    let updated: any = null;
    let delta = 0;
    for (let attempt = 0; attempt < 3 && !updated; attempt += 1) {
      const current = attempt === 0 ? item : await this.load(societyId, id);
      const stock = current.currentStock ?? 0;
      // clearing the low-stock flag rides on the same atomic write, so a reader can never see the new stock with a stale alert
      const clearAlert = (next: number) => (next > (current.minimumLevel ?? 0) && current.lowStockAlertedAt ? { lowStockAlertedAt: null } : {});
      if (input.type === 'IN') {
        if (qty <= 0) throw Errors.validation({ quantity: ['Quantity must be positive'] });
        delta = qty;
        const cost = input.unitCost ?? current.unitCost ?? 0;
        const avg = stock + qty > 0 && stock >= 0 ? round2((Math.max(stock, 0) * (current.unitCost ?? 0) + qty * cost) / (Math.max(stock, 0) + qty)) : cost;
        updated = await InventoryItem.findOneAndUpdate({ _id: id, societyId, currentStock: stock }, { $inc: { currentStock: qty }, $set: { unitCost: avg, ...clearAlert(stock + qty) } }, { new: true });
      } else if (input.type === 'OUT') {
        if (qty <= 0) throw Errors.validation({ quantity: ['Quantity must be positive'] });
        if (stock < qty && !cfg.allowNegativeStock) throw Errors.conflict(`Only ${stock} ${current.unit} in stock`, { available: stock });
        delta = -qty;
        updated = await InventoryItem.findOneAndUpdate({ _id: id, societyId, currentStock: stock }, { $inc: { currentStock: -qty } }, { new: true });
      } else {
        delta = round3(qty - stock);
        updated = await InventoryItem.findOneAndUpdate({ _id: id, societyId, currentStock: stock }, { $set: { currentStock: qty, ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}), ...clearAlert(qty) } }, { new: true });
      }
    }
    if (!updated) throw Errors.conflict('Stock changed concurrently, please retry');
    const tx = await StockTransaction.create({ societyId, itemId: updated._id, type: input.type, quantity: delta, unitCost: input.type === 'IN' ? (input.unitCost ?? updated.unitCost) : updated.unitCost, balanceAfter: updated.currentStock, reference: { type: input.reference?.type ?? 'MANUAL', id: input.reference?.id ?? null, label: input.reference?.label }, issuedTo: input.issuedTo, note: input.note, byUserId, at: input.at ?? new Date(), clientRef: input.clientRef ?? null });
    auditService.record({ action: `inventory.stock_${input.type.toLowerCase()}`, resource: 'InventoryItem', resourceId: updated._id, societyId, newValue: { quantity: delta, balanceAfter: updated.currentStock, reference: input.reference, issuedTo: input.issuedTo }, actor: byUserId ? { id: byUserId } : { type: 'SYSTEM' }, req });
    domainEvents.emit('inventory.changed', { itemId: String(updated._id), transactionId: String(tx._id) }, { societyId, actorId: byUserId ?? undefined });
    return { ...tx.toJSON(), replayed: false, item: this.present(updated.toObject()) };
  }

  async transactions(societyId: string, query: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId };
    if (query.itemId) filter.itemId = query.itemId;
    if (query.type) filter.type = query.type;
    if (query.from || query.to) filter.at = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    return paginate(StockTransaction as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-at,-createdAt', allowedSorts: ['at', 'type', 'quantity'], populate: [{ path: 'itemId', select: 'name sku unit' }, { path: 'byUserId', select: 'name' }] });
  }

  // ------------------------------------------------------------------ reporting & jobs
  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const monthStart = dayjs().startOf('month').toDate();
    const [items, low, value, moves] = await Promise.all([
      InventoryItem.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE' }),
      InventoryItem.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE', $expr: { $lte: ['$currentStock', '$minimumLevel'] } }),
      InventoryItem.aggregate([{ $match: { societyId: sid, deletedAt: null } }, { $group: { _id: null, total: { $sum: { $multiply: ['$currentStock', '$unitCost'] } } } }]),
      StockTransaction.aggregate([{ $match: { societyId: sid, at: { $gte: monthStart } } }, { $group: { _id: '$type', count: { $sum: 1 }, qty: { $sum: { $abs: '$quantity' } }, value: { $sum: { $multiply: [{ $abs: '$quantity' }, '$unitCost'] } } } }]),
    ]);
    const byType = Object.fromEntries(moves.map((m) => [m._id, { count: m.count, qty: m.qty, value: round2(m.value) }]));
    return { items, lowStock: low, stockValue: round2(value[0]?.total ?? 0), monthIn: byType.IN ?? { count: 0, qty: 0, value: 0 }, monthOut: byType.OUT ?? { count: 0, qty: 0, value: 0 } };
  }

  async exportRows(societyId: string, query: Record<string, any>) {
    const rows: Record<string, unknown>[] = [];
    let page = 1;
    while (rows.length < 5000) {
      const res = await this.list(societyId, { ...query, page, limit: 200 });
      rows.push(...res.items.map((i: any) => ({ sku: i.sku, name: i.name, category: i.categoryKey, unit: i.unit, currentStock: i.currentStock, minimumLevel: i.minimumLevel, reorderQuantity: i.reorderQuantity, unitCost: i.unitCost, stockValue: i.stockValue, location: i.location ?? '', vendor: i.vendorId?.name ?? '', status: i.status, low: i.isLow ? 'yes' : 'no' })));
      if (page >= res.pages) break;
      page += 1;
    }
    return rows;
  }

  /** Low-stock sweep: alerts once per item, again after `realertAfterDays` while it stays low. */
  async sweep(now = new Date()) {
    let alerts = 0;
    const societies = await InventoryItem.distinct('societyId', { deletedAt: null, status: 'ACTIVE' });
    for (const societyId of societies) {
      const cfg = await this.getConfig(String(societyId));
      const cutoff = dayjs(now).subtract(cfg.realertAfterDays ?? 7, 'day').toDate();
      const low = await InventoryItem.find({ societyId, deletedAt: null, status: 'ACTIVE', $expr: { $lte: ['$currentStock', '$minimumLevel'] }, $or: [{ lowStockAlertedAt: null }, { lowStockAlertedAt: { $lte: cutoff } }] }).select('sku name currentStock minimumLevel reorderQuantity unit').lean();
      for (const item of low) {
        await InventoryItem.updateOne({ _id: item._id }, { $set: { lowStockAlertedAt: now } });
        alerts += 1;
        domainEvents.emit('inventory.low_stock', { itemId: String(item._id), sku: item.sku, itemName: item.name, currentStock: item.currentStock, minimumLevel: item.minimumLevel, reorderQuantity: item.reorderQuantity, unit: item.unit, roleKeys: cfg.lowStockAlertRoleKeys ?? [] }, { societyId: String(societyId) });
      }
    }
    return { alerts };
  }
}

export const inventoryService = new InventoryService();
