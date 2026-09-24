import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { Contract, type ContractDoc } from '../../models/contract.model';
import { Asset } from '../../models/asset.model';
import { Vendor } from '../../models/vendor.model';
import { Expense } from '../../models/expense.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { storageService } from '../../core/storage/storage.service';
import { domainEvents } from '../../core/events/event-bus';
import { expenseService } from '../expenses/expenses.service';
import { assetService } from './assets.service';

export interface ContractsConfig { reminderDays: number[]; visitReminderDays: number; defaultNoticePeriodDays: number }

const LIVE = ['ACTIVE'];
const POPULATE = [
  { path: 'vendorId', select: 'name phone email contactName' },
  { path: 'assetIds', select: 'name assetCode categoryKey status' },
  { path: 'renewedFromId', select: 'contractNumber endDate' },
  { path: 'renewedToId', select: 'contractNumber startDate endDate' },
  { path: 'visits.byUserId', select: 'name' },
];

const daysUntil = (d: Date, now: Date) => Math.ceil((d.getTime() - now.getTime()) / 86_400_000);

class ContractService {
  getConfig(societyId: string): Promise<ContractsConfig> { return configurationService.getSocietySetting<ContractsConfig>(societyId, 'contracts.config'); }

  async updateConfig(societyId: string, patch: Partial<ContractsConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'contracts.config', patch, byUserId);
    auditService.record({ action: 'contracts.config_updated', resource: 'SocietySetting', resourceId: 'contracts.config', societyId, newValue: patch, req });
    return merged;
  }

  // ------------------------------------------------------------------ helpers
  private async vendorFor(societyId: string, vendorId: string) {
    const vendor = await Vendor.findOne({ _id: vendorId, societyId, deletedAt: null }).select('name categoryKey paymentTermsDays status').lean();
    if (!vendor) throw Errors.validation({ vendorId: ['Vendor not found'] });
    if (vendor.status === 'BLACKLISTED') throw Errors.validation({ vendorId: ['Vendor is blacklisted'] });
    return vendor;
  }

  private async assertAssets(societyId: string, assetIds: string[] | undefined) {
    if (!assetIds?.length) return;
    const count = await Asset.countDocuments({ _id: { $in: assetIds }, societyId, deletedAt: null });
    if (count !== new Set(assetIds).size) throw Errors.validation({ assetIds: ['One or more assets were not found'] });
  }

  private nextVisit(from: Date, months: number): Date | null { return months > 0 ? dayjs(from).add(months, 'month').toDate() : null; }

  private async present(doc: any, now = new Date()) {
    const out: any = { ...doc, id: String(doc._id) };
    out.daysRemaining = LIVE.includes(doc.status) ? daysUntil(new Date(doc.endDate), now) : null;
    out.visitOverdue = Boolean(doc.nextVisitDue && LIVE.includes(doc.status) && new Date(doc.nextVisitDue) < now);
    out.documents = await Promise.all((doc.documents ?? []).map(async (d: any) => ({ ...d, id: String(d._id ?? ''), url: await storageService.signedUrl(d.storageKey, { expiresInSeconds: 900 }).catch(() => null) })));
    return out;
  }

  private async load(societyId: string, id: string): Promise<ContractDoc> {
    const doc = await Contract.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Contract');
    return doc;
  }

  // ------------------------------------------------------------------ CRUD
  async list(societyId: string, query: Record<string, any>) {
    const now = new Date();
    const filter: Record<string, unknown> = { societyId, deletedAt: null };
    if (query.status) filter.status = query.status;
    else if (query.activeOnly) filter.status = { $in: LIVE };
    if (query.type) filter.type = query.type;
    if (query.vendorId) filter.vendorId = query.vendorId;
    if (query.assetId) filter.assetIds = query.assetId;
    if (query.expiringWithinDays) { filter.status = 'ACTIVE'; filter.endDate = { $lte: dayjs(now).add(query.expiringWithinDays, 'day').toDate() }; }
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ title: rx }, { vendorName: rx }, { contractNumber: rx }];
    const page = await paginate(Contract as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: 'endDate', allowedSorts: ['endDate', 'startDate', 'title', 'value', 'status', 'createdAt'], populate: POPULATE.slice(0, 2) });
    return { ...page, items: page.items.map((c: any) => ({ ...c, id: String(c._id), daysRemaining: LIVE.includes(c.status) ? daysUntil(new Date(c.endDate), now) : null, visitOverdue: Boolean(c.nextVisitDue && LIVE.includes(c.status) && new Date(c.nextVisitDue) < now), visits: undefined, visitCount: (c.visits ?? []).length, documents: undefined, documentCount: (c.documents ?? []).length })) };
  }

  async get(societyId: string, id: string) {
    const doc = await Contract.findOne({ _id: id, societyId, deletedAt: null }).populate(POPULATE).lean();
    if (!doc) throw Errors.notFound('Contract');
    const payments = await this.paymentSummary(societyId, id);
    return { ...(await this.present(doc)), payments };
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const vendor = await this.vendorFor(societyId, input.vendorId);
    await this.assertAssets(societyId, input.assetIds);
    const cfg = await this.getConfig(societyId);
    const contractNumber = await sequenceService.next(societyId, 'contract', { prefix: 'CON', padding: 4 });
    const doc = await Contract.create({
      ...input, societyId, contractNumber, vendorName: vendor.name, categoryKey: (input.categoryKey ?? vendor.categoryKey ?? undefined)?.toUpperCase(), paymentTermsDays: input.paymentTermsDays ?? vendor.paymentTermsDays ?? 30, noticePeriodDays: input.noticePeriodDays ?? cfg.defaultNoticePeriodDays,
      status: input.activate ? 'ACTIVE' : 'DRAFT', nextVisitDue: this.nextVisit(input.startDate, input.visitFrequencyMonths ?? 0), createdBy: byUserId,
    });
    if (doc.assetIds.length) await Asset.updateMany({ _id: { $in: doc.assetIds }, societyId }, { $set: { contractId: doc._id } });
    auditService.record({ action: 'contract.created', resource: 'Contract', resourceId: doc._id, societyId, newValue: { contractNumber, title: doc.title, vendor: vendor.name, endDate: doc.endDate, value: doc.value, status: doc.status }, req });
    domainEvents.emit('contracts.changed', { contractId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, String(doc._id));
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    if (['RENEWED', 'TERMINATED'].includes(doc.status)) throw Errors.invalidTransition(doc.status, 'UPDATED', 'Contract');
    if (patch.vendorId && patch.vendorId !== String(doc.vendorId)) { const vendor = await this.vendorFor(societyId, patch.vendorId); patch.vendorName = vendor.name; }
    if (patch.assetIds) {
      await this.assertAssets(societyId, patch.assetIds);
      const removed = doc.assetIds.map(String).filter((a) => !patch.assetIds.includes(a));
      if (removed.length) await Asset.updateMany({ _id: { $in: removed }, societyId, contractId: doc._id }, { $set: { contractId: null } });
      await Asset.updateMany({ _id: { $in: patch.assetIds }, societyId }, { $set: { contractId: doc._id } });
    }
    if (patch.categoryKey) patch.categoryKey = String(patch.categoryKey).toUpperCase();
    const start = patch.startDate ?? doc.startDate;
    const end = patch.endDate ?? doc.endDate;
    if (end <= start) throw Errors.validation({ endDate: ['End date must be after the start date'] });
    const before = { endDate: doc.endDate, value: doc.value, status: doc.status };
    doc.set(patch);
    if (patch.visitFrequencyMonths !== undefined || patch.startDate) {
      const last = doc.visits.length ? doc.visits[doc.visits.length - 1].at : doc.startDate;
      doc.nextVisitDue = this.nextVisit(last, doc.visitFrequencyMonths ?? 0);
    }
    if (patch.endDate && patch.endDate.getTime() !== before.endDate.getTime()) { doc.remindersSent = []; if (doc.status === 'EXPIRED' && patch.endDate > new Date()) doc.status = 'ACTIVE'; }
    await doc.save();
    auditService.record({ action: 'contract.updated', resource: 'Contract', resourceId: doc._id, societyId, oldValue: before, newValue: patch, req });
    domainEvents.emit('contracts.changed', { contractId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, id);
  }

  async activate(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    if (doc.status !== 'DRAFT') throw Errors.invalidTransition(doc.status, 'ACTIVE', 'Contract');
    doc.status = doc.endDate < new Date() ? 'EXPIRED' : 'ACTIVE';
    await doc.save();
    auditService.record({ action: 'contract.activated', resource: 'Contract', resourceId: doc._id, societyId, newValue: { status: doc.status }, req });
    domainEvents.emit('contracts.changed', { contractId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, id);
  }

  /** Creates the successor contract and closes this one as RENEWED; the chain is kept on both records. */
  async renew(societyId: string, id: string, input: Record<string, any>, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    if (!['ACTIVE', 'EXPIRED'].includes(doc.status)) throw Errors.invalidTransition(doc.status, 'RENEWED', 'Contract');
    const startDate = input.startDate ?? dayjs(doc.endDate).add(1, 'day').startOf('day').toDate();
    if (input.endDate <= startDate) throw Errors.validation({ endDate: ['End date must be after the start date'] });
    const contractNumber = await sequenceService.next(societyId, 'contract', { prefix: 'CON', padding: 4 });
    const next = await Contract.create({
      societyId, contractNumber, title: doc.title, type: doc.type, vendorId: doc.vendorId, vendorName: doc.vendorName, categoryKey: doc.categoryKey, description: doc.description, scope: doc.scope,
      startDate, endDate: input.endDate, value: input.value ?? doc.value, billingCycle: doc.billingCycle, amountPerCycle: input.amountPerCycle ?? doc.amountPerCycle, paymentTermsDays: doc.paymentTermsDays, autoRenew: doc.autoRenew, noticePeriodDays: doc.noticePeriodDays,
      status: 'ACTIVE', documents: input.documents ?? [], contact: doc.contact, assetIds: doc.assetIds, visitFrequencyMonths: doc.visitFrequencyMonths, nextVisitDue: this.nextVisit(startDate, doc.visitFrequencyMonths ?? 0), renewedFromId: doc._id, notes: input.notes, createdBy: byUserId,
    });
    doc.status = 'RENEWED';
    doc.renewedToId = next._id;
    await doc.save();
    if (doc.assetIds.length) await Asset.updateMany({ _id: { $in: doc.assetIds }, societyId }, { $set: { contractId: next._id } });
    auditService.record({ action: 'contract.renewed', resource: 'Contract', resourceId: doc._id, societyId, newValue: { renewedTo: next.contractNumber, endDate: next.endDate, value: next.value }, req });
    domainEvents.emit('contracts.changed', { contractId: String(doc._id), renewedTo: String(next._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, String(next._id));
  }

  async terminate(societyId: string, id: string, input: { reason: string; at?: Date }, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    if (!['ACTIVE', 'DRAFT', 'EXPIRED'].includes(doc.status)) throw Errors.invalidTransition(doc.status, 'TERMINATED', 'Contract');
    doc.status = 'TERMINATED';
    doc.terminatedAt = input.at ?? new Date();
    doc.terminationReason = input.reason;
    await doc.save();
    await Asset.updateMany({ _id: { $in: doc.assetIds }, societyId, contractId: doc._id }, { $set: { contractId: null } });
    auditService.record({ action: 'contract.terminated', resource: 'Contract', resourceId: doc._id, societyId, newValue: { reason: input.reason, at: doc.terminatedAt }, req });
    domainEvents.emit('contracts.changed', { contractId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, id);
  }

  async remove(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    if (doc.status !== 'DRAFT') throw Errors.conflict('Only draft contracts can be deleted; terminate active ones instead');
    doc.deletedAt = new Date();
    doc.deletedBy = byUserId as any;
    await doc.save();
    auditService.record({ action: 'contract.deleted', resource: 'Contract', resourceId: doc._id, societyId, oldValue: { contractNumber: doc.contractNumber, title: doc.title }, req });
    domainEvents.emit('contracts.changed', { contractId: String(doc._id) }, { societyId, actorId: byUserId });
  }

  // ------------------------------------------------------------------ AMC visits & payments
  /** Logs a service visit and mirrors it into the maintenance log of every covered asset. */
  async logVisit(societyId: string, id: string, input: { at?: Date; note?: string; assetIds?: string[]; attachments?: any[] }, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    if (!LIVE.includes(doc.status)) throw Errors.invalidTransition(doc.status, 'VISIT', 'Contract');
    const at = input.at ?? new Date();
    const assetIds = (input.assetIds?.length ? input.assetIds : doc.assetIds.map(String)).filter((a) => doc.assetIds.map(String).includes(a));
    doc.visits.push({ at, note: input.note, byUserId: byUserId as any, assetIds: assetIds as any, attachments: input.attachments ?? [] });
    doc.nextVisitDue = this.nextVisit(at, doc.visitFrequencyMonths ?? 0);
    doc.visitReminderSentFor = null;
    await doc.save();
    for (const assetId of assetIds) {
      await assetService.logMaintenance(societyId, assetId, { at, type: 'AMC_VISIT', description: input.note ? `AMC visit (${doc.vendorName}): ${input.note}` : `AMC visit by ${doc.vendorName}`, vendorId: String(doc.vendorId), vendorName: doc.vendorName, contractId: String(doc._id), attachments: input.attachments ?? [] }, byUserId, req, { silent: true }).catch(() => undefined);
    }
    auditService.record({ action: 'contract.visit_logged', resource: 'Contract', resourceId: doc._id, societyId, newValue: { at, note: input.note, assets: assetIds.length }, req });
    domainEvents.emit('contracts.changed', { contractId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, id);
  }

  /** Records a contract bill as an expense (goes through the normal expense approval when `submit` is set). */
  async recordPayment(societyId: string, id: string, input: Record<string, any>, byUserId: string, req?: any) {
    const doc = await this.load(societyId, id);
    if (!['ACTIVE', 'EXPIRED', 'RENEWED'].includes(doc.status)) throw Errors.invalidTransition(doc.status, 'PAYMENT', 'Contract');
    const expense = await expenseService.create(societyId, {
      title: `${doc.title} (${doc.contractNumber})`, description: input.description ?? `Contract payment · ${doc.vendorName}`, vendorId: String(doc.vendorId), categoryKey: doc.categoryKey ?? undefined, billNumber: input.billNumber, billDate: input.billDate ?? new Date(),
      amount: input.amount, taxRate: input.taxRate ?? 0, tdsAmount: 0, attachments: [], contractId: String(doc._id), submit: Boolean(input.submit),
    }, byUserId, req);
    auditService.record({ action: 'contract.payment_recorded', resource: 'Contract', resourceId: doc._id, societyId, newValue: { expenseId: String((expense as any).id ?? (expense as any)._id), amount: input.amount }, req });
    domainEvents.emit('contracts.changed', { contractId: String(doc._id) }, { societyId, actorId: byUserId });
    return expense;
  }

  async paymentSummary(societyId: string, id: string) {
    const rows = await Expense.find({ societyId, contractId: id, deletedAt: null }).sort({ billDate: -1 }).select('expenseNumber title total paidAmount approvalStatus paymentStatus billDate').limit(50).lean();
    const approved = rows.filter((r) => r.approvalStatus === 'APPROVED');
    return { items: rows.map((r) => ({ ...r, id: String(r._id) })), count: rows.length, billed: approved.reduce((s, r) => s + (r.total ?? 0), 0), paid: approved.reduce((s, r) => s + (r.paidAmount ?? 0), 0) };
  }

  // ------------------------------------------------------------------ reporting & jobs
  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const now = new Date();
    const in30 = dayjs(now).add(30, 'day').toDate();
    const in90 = dayjs(now).add(90, 'day').toDate();
    const [byStatus, byType, expiring30, expiring90, value, visitsOverdue] = await Promise.all([
      Contract.aggregate([{ $match: { societyId: sid, deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Contract.aggregate([{ $match: { societyId: sid, deletedAt: null, status: 'ACTIVE' } }, { $group: { _id: '$type', count: { $sum: 1 }, value: { $sum: '$value' } } }]),
      Contract.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE', endDate: { $lte: in30 } }),
      Contract.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE', endDate: { $lte: in90 } }),
      Contract.aggregate([{ $match: { societyId: sid, deletedAt: null, status: 'ACTIVE' } }, { $group: { _id: null, total: { $sum: '$value' } } }]),
      Contract.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE', nextVisitDue: { $lt: now } }),
    ]);
    const status = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    return { active: status.ACTIVE ?? 0, draft: status.DRAFT ?? 0, expired: status.EXPIRED ?? 0, byStatus: status, byType: byType.map((t) => ({ type: t._id, count: t.count, value: t.value })), expiring30, expiring90, activeValue: value[0]?.total ?? 0, visitsOverdue };
  }

  async exportRows(societyId: string, query: Record<string, any>) {
    const rows: Record<string, unknown>[] = [];
    let page = 1;
    while (rows.length < 5000) {
      const res = await this.list(societyId, { ...query, page, limit: 200 });
      rows.push(...res.items.map((c: any) => ({ number: c.contractNumber, title: c.title, type: c.type, vendor: c.vendorName ?? c.vendorId?.name ?? '', status: c.status, startDate: dayjs(c.startDate).format('YYYY-MM-DD'), endDate: dayjs(c.endDate).format('YYYY-MM-DD'), daysRemaining: c.daysRemaining ?? '', value: c.value, billingCycle: c.billingCycle, amountPerCycle: c.amountPerCycle ?? '', autoRenew: c.autoRenew ? 'yes' : 'no', assets: (c.assetIds ?? []).map((a: any) => a.assetCode ?? a).join(' '), nextVisitDue: c.nextVisitDue ? dayjs(c.nextVisitDue).format('YYYY-MM-DD') : '' })));
      if (page >= res.pages) break;
      page += 1;
    }
    return rows;
  }

  /** Expiry + reminder sweep: marks expired contracts, sends each configured reminder once, flags overdue AMC visits. */
  async sweep(now = new Date()) {
    let expired = 0;
    let reminders = 0;
    let visits = 0;
    const societies = await Contract.distinct('societyId', { status: 'ACTIVE', deletedAt: null });
    for (const societyId of societies) {
      const cfg = await this.getConfig(String(societyId));
      const stale = await Contract.find({ societyId, status: 'ACTIVE', deletedAt: null, endDate: { $lt: now } }).select('contractNumber title vendorName endDate autoRenew').lean();
      for (const c of stale) {
        const res = await Contract.updateOne({ _id: c._id, status: 'ACTIVE' }, { $set: { status: 'EXPIRED' } });
        if (!res.modifiedCount) continue;
        expired += 1;
        domainEvents.emit('contract.expired', { contractId: String(c._id), contractNumber: c.contractNumber, title: c.title, vendorName: c.vendorName, endDate: c.endDate, autoRenew: c.autoRenew }, { societyId: String(societyId) });
      }
      const days = [...(cfg.reminderDays ?? [])].sort((a, b) => b - a);
      if (days.length) {
        const horizon = dayjs(now).add(days[0], 'day').toDate();
        const upcoming = await Contract.find({ societyId, status: 'ACTIVE', deletedAt: null, endDate: { $gte: now, $lte: horizon } }).select('contractNumber title vendorName endDate remindersSent').lean();
        for (const c of upcoming) {
          const remaining = daysUntil(new Date(c.endDate), now);
          const due = days.find((d) => remaining <= d && !(c.remindersSent ?? []).includes(d));
          if (due === undefined) continue;
          const res = await Contract.updateOne({ _id: c._id, remindersSent: { $ne: due } }, { $addToSet: { remindersSent: due } });
          if (!res.modifiedCount) continue;
          reminders += 1;
          domainEvents.emit('contract.expiring', { contractId: String(c._id), contractNumber: c.contractNumber, title: c.title, vendorName: c.vendorName, endDate: c.endDate, daysRemaining: remaining, reminderDay: due }, { societyId: String(societyId) });
        }
      }
      if (cfg.visitReminderDays >= 0) {
        const visitHorizon = dayjs(now).add(cfg.visitReminderDays, 'day').toDate();
        const dueVisits = await Contract.find({ societyId, status: 'ACTIVE', deletedAt: null, nextVisitDue: { $ne: null, $lte: visitHorizon } }).select('contractNumber title vendorName nextVisitDue visitReminderSentFor').lean();
        for (const c of dueVisits) {
          if (c.visitReminderSentFor && new Date(c.visitReminderSentFor).getTime() === new Date(c.nextVisitDue!).getTime()) continue;
          await Contract.updateOne({ _id: c._id }, { $set: { visitReminderSentFor: c.nextVisitDue } });
          visits += 1;
          domainEvents.emit('contract.visit_due', { contractId: String(c._id), contractNumber: c.contractNumber, title: c.title, vendorName: c.vendorName, dueDate: c.nextVisitDue }, { societyId: String(societyId) });
        }
      }
    }
    return { expired, reminders, visits };
  }
}

export const contractService = new ContractService();
