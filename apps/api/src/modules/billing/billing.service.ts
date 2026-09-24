import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { ChargeHead } from '../../models/charge-head.model';
import { BillingRun, type BillingRunDoc } from '../../models/billing-run.model';
import { Invoice, type InvoiceDoc } from '../../models/invoice.model';
import { MeterReading } from '../../models/meter-reading.model';
import { UnitLedgerEntry } from '../../models/unit-ledger-entry.model';
import { Unit } from '../../models/unit.model';
import { Resident } from '../../models/resident.model';
import { Payment } from '../../models/payment.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { configurationService } from '../../core/configuration/configuration.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { auditService } from '../../core/audit/audit.service';
import { domainEvents } from '../../core/events/event-bus';
import { runFinanceHook } from '../../core/hooks/finance-hooks';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { logger } from '../../lib/logger';
import { setDuesResolver } from '../residents/residents.service';
import { computeLineItems, computePenalty, round2, totalsFor, validateFormula, type LineItemDraft, type PenaltyConfig } from './charge-calculator';

export interface BillingConfig {
  cycle: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL';
  dueDay: number;
  gracePeriodDays: number;
  penalty: PenaltyConfig;
  invoicePrefix: string;
  receiptPrefix: string;
  taxRate: number;
  taxLabel: string;
  roundOff: boolean;
  autoIssue: boolean;
  notifyOnIssue: boolean;
  notes?: string;
  carryForwardBalance: boolean;
  reminderDaysBeforeDue?: number[];
  reminderDaysAfterDue?: number[];
}

export interface Scope {
  unitIds?: string[];
}

const OPEN_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'];

class BillingService {
  // ------------------------------------------------------------------ config & charge heads
  getConfig(societyId: string): Promise<BillingConfig> {
    return configurationService.getSocietySetting<BillingConfig>(societyId, 'billing.config');
  }

  async setConfig(societyId: string, value: Partial<BillingConfig>, byUserId: string, req?: any): Promise<BillingConfig> {
    const before = await this.getConfig(societyId);
    const merged = (await configurationService.setSocietySetting(societyId, 'billing.config', value, byUserId)) as BillingConfig;
    auditService.record({ action: 'billing.config_updated', resource: 'SocietySetting', resourceId: 'billing.config', societyId, oldValue: before, newValue: value, req });
    return merged;
  }

  async listChargeHeads(societyId: string, includeInactive = false) {
    return ChargeHead.find({ societyId, ...(includeInactive ? {} : { isActive: true }) }).sort({ sortOrder: 1, name: 1 }).lean();
  }

  async createChargeHead(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const code = String(input.code).toUpperCase();
    if (await ChargeHead.exists({ societyId, code })) throw Errors.conflict(`Charge head ${code} already exists`);
    if (input.type === 'FORMULA') validateFormula(input.formula ?? '');
    if (input.type === 'METER_BASED' && !input.meterType) throw Errors.validation({ meterType: ['Meter type is required for meter-based charges'] });
    const head = await ChargeHead.create({ ...input, code, meterType: input.meterType?.toUpperCase(), fundKey: input.fundKey?.toUpperCase(), societyId, createdBy: byUserId });
    auditService.record({ action: 'billing.charge_head_created', resource: 'ChargeHead', resourceId: head._id, societyId, newValue: input, req });
    return head.toJSON();
  }

  async updateChargeHead(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const head = await ChargeHead.findOne({ _id: id, societyId });
    if (!head) throw Errors.notFound('Charge head');
    const old = head.toObject();
    if (patch.code && String(patch.code).toUpperCase() !== head.code && (await ChargeHead.exists({ societyId, code: String(patch.code).toUpperCase() }))) throw Errors.conflict('Charge head code already exists');
    const type = patch.type ?? head.type;
    if (type === 'FORMULA') validateFormula(patch.formula ?? head.formula ?? '');
    head.set({ ...patch, ...(patch.code ? { code: String(patch.code).toUpperCase() } : {}), ...(patch.meterType ? { meterType: String(patch.meterType).toUpperCase() } : {}) });
    await head.save();
    auditService.record({ action: 'billing.charge_head_updated', resource: 'ChargeHead', resourceId: head._id, societyId, oldValue: { amount: old.amount, rate: old.rate, type: old.type, isActive: old.isActive }, newValue: patch, req });
    return head.toJSON();
  }

  async deactivateChargeHead(societyId: string, id: string, req?: any): Promise<void> {
    const head = await ChargeHead.findOne({ _id: id, societyId });
    if (!head) throw Errors.notFound('Charge head');
    head.isActive = false;
    await head.save();
    auditService.record({ action: 'billing.charge_head_deactivated', resource: 'ChargeHead', resourceId: head._id, societyId, req });
  }

  // ------------------------------------------------------------------ ledger helpers
  async addLedgerEntry(input: { societyId: string; unitId: any; date: Date; type: string; refType: string; refId: any; refNumber?: string; description: string; debit?: number; credit?: number; createdBy?: string; session?: mongoose.ClientSession }) {
    const [entry] = await UnitLedgerEntry.create([{ ...input, debit: input.debit ?? 0, credit: input.credit ?? 0 }], { session: input.session });
    return entry;
  }

  async removeLedgerEntries(societyId: string, refType: string, refId: any, session?: mongoose.ClientSession): Promise<void> {
    await UnitLedgerEntry.deleteMany({ societyId, refType, refId }).session(session ?? null);
  }

  async getUnitBalance(societyId: string, unitId: string): Promise<number> {
    const [unit, agg] = await Promise.all([
      Unit.findOne({ _id: unitId, societyId }).select('openingBalance').lean(),
      UnitLedgerEntry.aggregate([{ $match: { societyId: new mongoose.Types.ObjectId(societyId), unitId: new mongoose.Types.ObjectId(unitId) } }, { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } }]),
    ]);
    return round2((unit?.openingBalance ?? 0) + (agg[0]?.debit ?? 0) - (agg[0]?.credit ?? 0));
  }

  async unitLedger(societyId: string, unitId: string, range: { from?: Date; to?: Date } = {}) {
    const unit = await Unit.findOne({ _id: unitId, societyId, deletedAt: null }).select('code openingBalance buildingId').populate('buildingId', 'name').lean();
    if (!unit) throw Errors.notFound('Unit');
    const all = await UnitLedgerEntry.find({ societyId, unitId }).sort({ date: 1, createdAt: 1 }).lean();
    let running = unit.openingBalance ?? 0;
    const rows: any[] = [];
    let openingForRange = unit.openingBalance ?? 0;
    for (const e of all) {
      running = round2(running + e.debit - e.credit);
      const inRange = (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to);
      if (inRange) rows.push({ ...e, id: String(e._id), balance: running });
      else if (range.from && e.date < range.from) openingForRange = running;
    }
    return { unit, openingBalance: unit.openingBalance ?? 0, rangeOpeningBalance: openingForRange, entries: rows, closingBalance: running };
  }

  // ------------------------------------------------------------------ invoices
  private async nextInvoiceNumber(societyId: string, cfg: BillingConfig): Promise<string> {
    const general = await configurationService.getSocietySetting<{ financialYearStartMonth: number }>(societyId, 'society.general');
    return sequenceService.next(societyId, 'invoice', { prefix: cfg.invoicePrefix || 'INV', padding: 5, resetPolicy: 'FISCAL_YEAR', fiscalYearStartMonth: general.financialYearStartMonth });
  }

  private async billToFor(societyId: string, unitId: any) {
    const primary = await Resident.findOne({ societyId, unitId, status: 'ACTIVE', deletedAt: null, type: { $in: ['OWNER', 'TENANT'] } }).sort({ isPrimary: -1, type: 1 }).lean();
    return primary ? { residentId: primary._id, billTo: { name: primary.name, email: primary.email, phone: primary.phone } } : { residentId: null, billTo: {} };
  }

  private async unbilledReadings(societyId: string, unitId: any, period: { from: Date; to: Date }) {
    const readings = await MeterReading.find({ societyId, unitId, billed: false, readingDate: { $lte: dayjs(period.to).endOf('day').toDate() } }).sort({ readingDate: -1 }).lean();
    const map = new Map<string, { id: string; consumption: number }>();
    for (const r of readings) {
      const key = r.meterType.toUpperCase();
      if (!map.has(key)) map.set(key, { id: String(r._id), consumption: r.consumption });
    }
    return map;
  }

  private async dueDateFor(cfg: BillingConfig, period: { to: Date }, override?: Date): Promise<Date> {
    if (override) return override;
    const base = dayjs(period.to).add(1, 'day');
    const due = base.date(Math.min(cfg.dueDay, base.daysInMonth()));
    return (due.isBefore(base) ? due.add(1, 'month') : due).endOf('day').toDate();
  }

  private async buildDraft(societyId: string, unit: any, heads: any[], period: { from: Date; to: Date; label: string }, cfg: BillingConfig, opts: { includePreviousBalance: boolean; dueDate?: Date; runId?: any; byUserId: string; notes?: string }) {
    const readings = await this.unbilledReadings(societyId, unit._id, period);
    const { items, readingIds } = computeLineItems(unit, heads as any, readings);
    if (!items.length) return null;
    const totals = totalsFor(items, 0, 0, cfg.roundOff);
    const previousBalance = opts.includePreviousBalance && cfg.carryForwardBalance ? await this.getUnitBalance(societyId, String(unit._id)) : 0;
    const { residentId, billTo } = await this.billToFor(societyId, unit._id);
    const invoice = await Invoice.create({
      societyId,
      invoiceNumber: await this.nextInvoiceNumber(societyId, cfg),
      unitId: unit._id,
      residentId,
      billTo,
      period,
      billingRunId: opts.runId ?? null,
      lineItems: items,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      balanceDue: totals.total,
      previousBalance,
      dueDate: await this.dueDateFor(cfg, period, opts.dueDate),
      status: 'DRAFT',
      notes: opts.notes ?? cfg.notes,
      createdBy: opts.byUserId,
    });
    if (readingIds.length) await MeterReading.updateMany({ _id: { $in: readingIds } }, { $set: { billed: true, invoiceId: invoice._id } });
    return invoice;
  }

  async previewRun(societyId: string, input: Record<string, any>) {
    const cfg = await this.getConfig(societyId);
    const heads = await this.resolveHeads(societyId, input.chargeHeadIds);
    const units = await this.resolveUnits(societyId, input);
    const period = this.periodFrom(input);
    const rows: any[] = [];
    const skipped: { unitCode: string; reason: string }[] = [];
    for (const unit of units) {
      const readings = await this.unbilledReadings(societyId, unit._id, period);
      const { items } = computeLineItems(unit as any, heads as any, readings);
      if (!items.length) {
        skipped.push({ unitCode: unit.code, reason: 'No applicable charges' });
        continue;
      }
      const totals = totalsFor(items, 0, 0, cfg.roundOff);
      const previousBalance = input.includePreviousBalance !== false && cfg.carryForwardBalance ? await this.getUnitBalance(societyId, String(unit._id)) : 0;
      rows.push({ unitId: String(unit._id), unitCode: unit.code, items, ...totals, previousBalance });
    }
    return { period, invoices: rows, skipped, count: rows.length, totalAmount: round2(rows.reduce((s, r) => s + r.total, 0)) };
  }

  private periodFrom(input: Record<string, any>) {
    const from = dayjs(input.periodFrom).startOf('day').toDate();
    const to = dayjs(input.periodTo).endOf('day').toDate();
    if (to < from) throw Errors.validation({ periodTo: ['Period end must be after the start'] });
    const label = input.label || (dayjs(from).isSame(to, 'month') ? dayjs(from).format('MMM YYYY') : `${dayjs(from).format('DD MMM YYYY')} – ${dayjs(to).format('DD MMM YYYY')}`);
    return { from, to, label };
  }

  private async resolveHeads(societyId: string, ids?: string[]) {
    const filter: Record<string, unknown> = { societyId, isActive: true };
    if (ids?.length) filter._id = { $in: ids };
    else filter.frequency = 'RECURRING';
    const heads = await ChargeHead.find(filter).sort({ sortOrder: 1 }).lean();
    if (!heads.length) throw Errors.validation({ chargeHeadIds: ['No active charge heads configured. Add charge heads in Billing → Setup first.'] });
    return heads;
  }

  private async resolveUnits(societyId: string, input: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId, deletedAt: null, status: 'ACTIVE' };
    if (input.unitIds?.length) filter._id = { $in: input.unitIds };
    if (input.buildingIds?.length) filter.buildingId = { $in: input.buildingIds };
    if (input.unitTypes?.length) filter.type = { $in: input.unitTypes.map((t: string) => t.toUpperCase()) };
    return Unit.find(filter).sort({ code: 1 }).lean();
  }

  async generateRun(societyId: string, input: Record<string, any>, byUserId: string, req?: any): Promise<BillingRunDoc> {
    const cfg = await this.getConfig(societyId);
    const heads = await this.resolveHeads(societyId, input.chargeHeadIds);
    const units = await this.resolveUnits(societyId, input);
    const period = this.periodFrom(input);
    const runNumber = await sequenceService.next(societyId, 'billing_run', { prefix: 'RUN', padding: 4 });
    const run = await BillingRun.create({ societyId, runNumber, period, cycle: input.cycle ?? cfg.cycle, chargeHeadIds: heads.map((h) => h._id), unitFilter: { buildingIds: input.buildingIds ?? [], unitTypes: input.unitTypes ?? [], unitIds: input.unitIds ?? [] }, options: { includePreviousBalance: input.includePreviousBalance !== false, dueDate: input.dueDate, notes: input.notes }, generatedBy: byUserId });
    let count = 0;
    let total = 0;
    const skipped: { unitCode: string; reason: string }[] = [];
    for (const unit of units) {
      const duplicate = await Invoice.exists({ societyId, unitId: unit._id, 'period.from': period.from, 'period.to': period.to, status: { $ne: 'CANCELLED' }, billingRunId: { $ne: null } });
      if (duplicate) {
        skipped.push({ unitCode: unit.code, reason: 'Already invoiced for this period' });
        continue;
      }
      const invoice = await this.buildDraft(societyId, unit, heads, period, cfg, { includePreviousBalance: input.includePreviousBalance !== false, dueDate: input.dueDate, runId: run._id, byUserId, notes: input.notes });
      if (!invoice) {
        skipped.push({ unitCode: unit.code, reason: 'No applicable charges' });
        continue;
      }
      count += 1;
      total += invoice.total;
    }
    run.invoiceCount = count;
    run.totalAmount = round2(total);
    run.skipped = skipped as any;
    await run.save();
    auditService.record({ action: 'billing.run_generated', resource: 'BillingRun', resourceId: run._id, societyId, newValue: { runNumber, period: period.label, invoices: count, total: run.totalAmount, skipped: skipped.length }, req });
    if (input.issueImmediately || cfg.autoIssue) await this.issueRun(societyId, String(run._id), byUserId, req);
    return (await BillingRun.findById(run._id))!;
  }

  async listRuns(societyId: string, query: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId };
    if (query.status) filter.status = query.status;
    return paginate(BillingRun as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'period.from', 'status', 'totalAmount'], populate: [{ path: 'generatedBy', select: 'name' }, { path: 'issuedBy', select: 'name' }] });
  }

  async getRun(societyId: string, id: string) {
    const run = await BillingRun.findOne({ _id: id, societyId }).populate('chargeHeadIds', 'name code type').populate('generatedBy', 'name').lean();
    if (!run) throw Errors.notFound('Billing run');
    const summary = await Invoice.aggregate([{ $match: { societyId: new mongoose.Types.ObjectId(societyId), billingRunId: run._id } }, { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' }, paid: { $sum: '$amountPaid' } } }]);
    return { ...run, id: String(run._id), summary: summary.map((s) => ({ status: s._id, count: s.count, total: round2(s.total), paid: round2(s.paid) })) };
  }

  private async issueInvoiceDoc(invoice: InvoiceDoc, cfg: BillingConfig, byUserId: string, _req?: any): Promise<void> {
    if (invoice.status !== 'DRAFT') throw Errors.invalidTransition(invoice.status, 'ISSUED', 'Invoice');
    const now = new Date();
    invoice.status = 'ISSUED';
    invoice.issueDate = now;
    if (!invoice.dueDate) invoice.dueDate = await this.dueDateFor(cfg, { to: invoice.period?.to ?? now });
    invoice.balanceDue = round2(invoice.total - invoice.amountPaid);
    await invoice.save();
    await this.addLedgerEntry({ societyId: String(invoice.societyId), unitId: invoice.unitId, date: now, type: 'INVOICE', refType: 'Invoice', refId: invoice._id, refNumber: invoice.invoiceNumber, description: `Invoice ${invoice.invoiceNumber}${invoice.period?.label ? ` · ${invoice.period.label}` : ''}`, debit: invoice.total, createdBy: byUserId });
    await runFinanceHook('onInvoiceIssued', invoice.toObject(), { societyId: String(invoice.societyId), byUserId });
    if (cfg.notifyOnIssue) {
      const unit = await Unit.findById(invoice.unitId).select('code').lean();
      domainEvents.emit('invoice.created', { invoiceId: String(invoice._id), invoiceNumber: invoice.invoiceNumber, unitId: String(invoice.unitId), unitCode: unit?.code, amount: invoice.total, dueDate: invoice.dueDate }, { societyId: String(invoice.societyId), actorId: byUserId });
    }
  }

  async issueRun(societyId: string, id: string, byUserId: string, req?: any): Promise<BillingRunDoc> {
    const run = await BillingRun.findOne({ _id: id, societyId });
    if (!run) throw Errors.notFound('Billing run');
    if (run.status !== 'DRAFT') throw Errors.invalidTransition(run.status, 'ISSUED', 'Billing run');
    const cfg = await this.getConfig(societyId);
    const drafts = await Invoice.find({ societyId, billingRunId: run._id, status: 'DRAFT' });
    for (const inv of drafts) await this.issueInvoiceDoc(inv, cfg, byUserId, req);
    run.status = 'ISSUED';
    run.issuedBy = byUserId as any;
    run.issuedAt = new Date();
    await run.save();
    auditService.record({ action: 'billing.run_issued', resource: 'BillingRun', resourceId: run._id, societyId, newValue: { invoices: drafts.length }, req });
    return run;
  }

  async cancelRun(societyId: string, id: string, reason: string, byUserId: string, req?: any): Promise<BillingRunDoc> {
    const run = await BillingRun.findOne({ _id: id, societyId });
    if (!run) throw Errors.notFound('Billing run');
    if (run.status === 'CANCELLED') throw Errors.invalidTransition(run.status, 'CANCELLED', 'Billing run');
    const paid = await Invoice.countDocuments({ societyId, billingRunId: run._id, amountPaid: { $gt: 0 } });
    if (paid > 0) throw Errors.conflict(`${paid} invoice(s) in this run already have payments. Cancel or refund them individually.`);
    const invoices = await Invoice.find({ societyId, billingRunId: run._id, status: { $ne: 'CANCELLED' } });
    for (const inv of invoices) await this.cancelInvoiceDoc(inv, reason, byUserId, req);
    run.status = 'CANCELLED';
    run.cancelledAt = new Date();
    await run.save();
    auditService.record({ action: 'billing.run_cancelled', resource: 'BillingRun', resourceId: run._id, societyId, newValue: { reason, invoices: invoices.length }, req });
    return run;
  }

  private async cancelInvoiceDoc(invoice: InvoiceDoc, reason: string, byUserId: string, req?: any): Promise<void> {
    if (invoice.amountPaid > 0) throw Errors.conflict(`Invoice ${invoice.invoiceNumber} has payments; refund or reallocate them first`);
    const wasIssued = invoice.status !== 'DRAFT';
    invoice.status = 'CANCELLED';
    invoice.cancelReason = reason;
    invoice.cancelledAt = new Date();
    invoice.balanceDue = 0;
    await invoice.save();
    await this.removeLedgerEntries(String(invoice.societyId), 'Invoice', invoice._id);
    await MeterReading.updateMany({ invoiceId: invoice._id }, { $set: { billed: false, invoiceId: null } });
    if (wasIssued) await runFinanceHook('onInvoiceCancelled', invoice.toObject(), { societyId: String(invoice.societyId), byUserId });
    auditService.record({ action: 'billing.invoice_cancelled', resource: 'Invoice', resourceId: invoice._id, societyId: String(invoice.societyId), newValue: { invoiceNumber: invoice.invoiceNumber, reason }, req });
  }

  async createInvoice(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const cfg = await this.getConfig(societyId);
    const unit = await Unit.findOne({ _id: input.unitId, societyId, deletedAt: null }).lean();
    if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
    const items: LineItemDraft[] = input.lineItems.map((li: any) => {
      const taxAmount = round2((li.amount * (li.taxRate ?? 0)) / 100);
      return { chargeHeadId: li.chargeHeadId ?? null, code: li.code ?? 'ADHOC', description: li.description, quantity: li.quantity ?? 1, rate: li.rate ?? li.amount, amount: round2(li.amount), taxRate: li.taxRate ?? 0, taxAmount, total: round2(li.amount + taxAmount), meterReadingId: null, ledgerAccountCode: li.ledgerAccountCode, fundKey: li.fundKey };
    });
    const discount = input.discount?.amount ?? 0;
    const totals = totalsFor(items, discount, 0, cfg.roundOff);
    const period = input.periodFrom && input.periodTo ? this.periodFrom(input) : { from: undefined, to: undefined, label: input.label ?? 'Ad-hoc' };
    const { residentId, billTo } = await this.billToFor(societyId, unit._id);
    const invoice = await Invoice.create({ societyId, invoiceNumber: await this.nextInvoiceNumber(societyId, cfg), unitId: unit._id, residentId: input.residentId ?? residentId, billTo, period, lineItems: items, subtotal: totals.subtotal, taxTotal: totals.taxTotal, discount: { amount: discount, reason: input.discount?.reason }, total: totals.total, balanceDue: totals.total, previousBalance: 0, dueDate: input.dueDate ?? (await this.dueDateFor(cfg, { to: (period.to as Date) ?? new Date() })), status: 'DRAFT', notes: input.notes, createdBy: byUserId });
    auditService.record({ action: 'billing.invoice_created', resource: 'Invoice', resourceId: invoice._id, societyId, newValue: { invoiceNumber: invoice.invoiceNumber, unit: unit.code, total: invoice.total }, req });
    if (input.issueImmediately) await this.issueInvoiceDoc(invoice, cfg, byUserId, req);
    return invoice.toJSON();
  }

  async updateInvoice(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const invoice = await Invoice.findOne({ _id: id, societyId });
    if (!invoice) throw Errors.notFound('Invoice');
    if (invoice.status !== 'DRAFT') throw Errors.conflict('Only draft invoices can be edited. Cancel and re-create issued invoices.');
    const cfg = await this.getConfig(societyId);
    if (patch.lineItems) {
      invoice.lineItems = patch.lineItems.map((li: any) => {
        const taxAmount = round2((li.amount * (li.taxRate ?? 0)) / 100);
        return { chargeHeadId: li.chargeHeadId ?? null, code: li.code ?? 'ADHOC', description: li.description, quantity: li.quantity ?? 1, rate: li.rate ?? li.amount, amount: round2(li.amount), taxRate: li.taxRate ?? 0, taxAmount, total: round2(li.amount + taxAmount), ledgerAccountCode: li.ledgerAccountCode, fundKey: li.fundKey };
      }) as any;
    }
    if (patch.discount) invoice.set('discount', patch.discount);
    if (patch.dueDate) invoice.dueDate = patch.dueDate;
    if (patch.notes !== undefined) invoice.notes = patch.notes;
    const totals = totalsFor(invoice.lineItems as any, invoice.discount?.amount ?? 0, invoice.penalty, cfg.roundOff);
    invoice.subtotal = totals.subtotal;
    invoice.taxTotal = totals.taxTotal;
    invoice.total = totals.total;
    invoice.balanceDue = totals.total;
    await invoice.save();
    auditService.record({ action: 'billing.invoice_updated', resource: 'Invoice', resourceId: invoice._id, societyId, newValue: patch, req });
    return invoice.toJSON();
  }

  async issueInvoice(societyId: string, id: string, byUserId: string, req?: any) {
    const invoice = await Invoice.findOne({ _id: id, societyId });
    if (!invoice) throw Errors.notFound('Invoice');
    await this.issueInvoiceDoc(invoice, await this.getConfig(societyId), byUserId, req);
    auditService.record({ action: 'billing.invoice_issued', resource: 'Invoice', resourceId: invoice._id, societyId, newValue: { invoiceNumber: invoice.invoiceNumber }, req });
    return invoice.toJSON();
  }

  async cancelInvoice(societyId: string, id: string, reason: string, byUserId: string, req?: any) {
    const invoice = await Invoice.findOne({ _id: id, societyId });
    if (!invoice) throw Errors.notFound('Invoice');
    if (invoice.status === 'CANCELLED') throw Errors.invalidTransition('CANCELLED', 'CANCELLED', 'Invoice');
    await this.cancelInvoiceDoc(invoice, reason, byUserId, req);
    return invoice.toJSON();
  }

  async listInvoices(societyId: string, query: Record<string, any>, scope: Scope = {}) {
    const filter: Record<string, unknown> = { societyId };
    if (scope.unitIds) filter.unitId = { $in: scope.unitIds };
    if (query.unitId) filter.unitId = scope.unitIds ? { $in: scope.unitIds.filter((u) => u === query.unitId) } : query.unitId;
    if (query.buildingId) {
      const units = await Unit.find({ societyId, buildingId: query.buildingId }).select('_id').lean();
      filter.unitId = { $in: units.map((u) => u._id) };
    }
    if (query.status) filter.status = query.status;
    if (query.billingRunId) filter.billingRunId = query.billingRunId;
    if (query.overdueOnly) filter.status = 'OVERDUE';
    if (query.from || query.to) filter.issueDate = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ invoiceNumber: rx }, { 'billTo.name': rx }];
    return paginate(Invoice as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'dueDate', 'total', 'balanceDue', 'status', 'invoiceNumber'], select: '-lineItems', populate: [{ path: 'unitId', select: 'code buildingId', populate: { path: 'buildingId', select: 'name' } }] });
  }

  async getInvoice(societyId: string, id: string, scope: Scope = {}) {
    const invoice = await Invoice.findOne({ _id: id, societyId }).populate('unitId', 'code number floor buildingId areaSqft').populate('residentId', 'name phone email').lean();
    if (!invoice) throw Errors.notFound('Invoice');
    if (scope.unitIds && !scope.unitIds.includes(String((invoice.unitId as any)?._id ?? invoice.unitId))) throw Errors.notFound('Invoice');
    const payments = await Payment.find({ societyId, 'allocations.invoiceId': invoice._id, status: { $in: ['SUCCESS', 'REFUNDED'] } }).select('paymentNumber receiptNumber amount method receivedAt allocations status').lean();
    return { ...invoice, id: String(invoice._id), payments: payments.map((p: any) => ({ ...p, id: String(p._id), allocated: p.allocations.find((a: any) => String(a.invoiceId) === String(invoice._id))?.amount ?? 0 })) };
  }

  async sendReminder(societyId: string, id: string, byUserId: string, req?: any) {
    const invoice = await Invoice.findOne({ _id: id, societyId }).populate('unitId', 'code');
    if (!invoice) throw Errors.notFound('Invoice');
    if (!OPEN_STATUSES.includes(invoice.status)) throw Errors.conflict('Only open invoices can be reminded');
    domainEvents.emit('invoice.reminder', { invoiceId: String(invoice._id), invoiceNumber: invoice.invoiceNumber, unitId: String((invoice.unitId as any)._id), unitCode: (invoice.unitId as any).code, balanceDue: invoice.balanceDue, dueDate: invoice.dueDate, manual: true }, { societyId, actorId: byUserId });
    invoice.remindersSent.push({ key: `manual:${Date.now()}`, at: new Date() } as any);
    await invoice.save();
    auditService.record({ action: 'billing.reminder_sent', resource: 'Invoice', resourceId: invoice._id, societyId, req });
  }

  // ------------------------------------------------------------------ stats & export
  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const monthStart = dayjs().startOf('month').toDate();
    const [open, overdue, issuedThisMonth, collectedThisMonth, byBuilding] = await Promise.all([
      Invoice.aggregate([{ $match: { societyId: sid, status: { $in: OPEN_STATUSES } } }, { $group: { _id: null, amount: { $sum: '$balanceDue' }, count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $match: { societyId: sid, status: 'OVERDUE' } }, { $group: { _id: null, amount: { $sum: '$balanceDue' }, count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $match: { societyId: sid, issueDate: { $gte: monthStart }, status: { $ne: 'CANCELLED' } } }, { $group: { _id: null, amount: { $sum: '$total' }, count: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { societyId: sid, status: 'SUCCESS', receivedAt: { $gte: monthStart } } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $match: { societyId: sid, status: { $in: OPEN_STATUSES } } }, { $lookup: { from: 'units', localField: 'unitId', foreignField: '_id', as: 'unit' } }, { $unwind: '$unit' }, { $lookup: { from: 'buildings', localField: 'unit.buildingId', foreignField: '_id', as: 'building' } }, { $unwind: { path: '$building', preserveNullAndEmptyArrays: true } }, { $group: { _id: '$building.name', amount: { $sum: '$balanceDue' }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }]),
    ]);
    const issued = issuedThisMonth[0]?.amount ?? 0;
    const collected = collectedThisMonth[0]?.amount ?? 0;
    return { outstanding: round2(open[0]?.amount ?? 0), openInvoices: open[0]?.count ?? 0, overdueAmount: round2(overdue[0]?.amount ?? 0), overdueCount: overdue[0]?.count ?? 0, issuedThisMonth: round2(issued), collectedThisMonth: round2(collected), collectionRate: issued > 0 ? Math.min(100, Math.round((collected / issued) * 100)) : null, outstandingByBuilding: byBuilding.map((b) => ({ building: b._id ?? 'No building', amount: round2(b.amount), count: b.count })) };
  }

  async exportRows(societyId: string, query: Record<string, any>) {
    const page = await this.listInvoices(societyId, { ...query, limit: 200, page: 1 });
    const rows: any[] = [];
    let pageNo = 1;
    let current = page;
    while (true) {
      rows.push(...current.items.map((i: any) => ({ invoiceNumber: i.invoiceNumber, unit: i.unitId?.code ?? '', building: i.unitId?.buildingId?.name ?? '', billTo: i.billTo?.name ?? '', period: i.period?.label ?? '', issueDate: i.issueDate ? dayjs(i.issueDate).format('YYYY-MM-DD') : '', dueDate: i.dueDate ? dayjs(i.dueDate).format('YYYY-MM-DD') : '', subtotal: i.subtotal, tax: i.taxTotal, penalty: i.penalty, total: i.total, paid: i.amountPaid, balance: i.balanceDue, status: i.status })));
      if (pageNo >= current.pages || rows.length >= 5000) break;
      pageNo += 1;
      current = await this.listInvoices(societyId, { ...query, limit: 200, page: pageNo });
    }
    return rows;
  }

  // ------------------------------------------------------------------ jobs
  /** Marks overdue invoices, applies the configured penalty once and sends reminders (idempotent). */
  async processOverdue(now = new Date()): Promise<{ overdue: number; penalties: number; reminders: number }> {
    const result = { overdue: 0, penalties: 0, reminders: 0 };
    const societies = await Invoice.distinct('societyId', { status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] }, dueDate: { $lte: dayjs(now).add(60, 'day').toDate() } });
    for (const sid of societies) {
      const societyId = String(sid);
      const cfg = await this.getConfig(societyId);
      const graceEnd = (due: Date) => dayjs(due).add(cfg.gracePeriodDays ?? 0, 'day').endOf('day');
      const candidates = await Invoice.find({ societyId, status: { $in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { $lt: now }, balanceDue: { $gt: 0 } });
      for (const inv of candidates) {
        if (!graceEnd(inv.dueDate!).isBefore(dayjs(now))) continue;
        inv.status = 'OVERDUE';
        inv.overdueAt = inv.overdueAt ?? now;
        await inv.save();
        result.overdue += 1;
      }
      const penaltyCandidates = await Invoice.find({ societyId, status: 'OVERDUE', penaltyAppliedAt: null, balanceDue: { $gt: 0 } });
      for (const inv of penaltyCandidates) {
        const daysOverdue = dayjs(now).diff(dayjs(inv.dueDate), 'day');
        if (daysOverdue < (cfg.penalty?.applyAfterDays ?? 0)) continue;
        const penalty = computePenalty(inv.balanceDue, daysOverdue, cfg.penalty);
        inv.penaltyAppliedAt = now;
        if (penalty > 0) {
          inv.penalty = round2(inv.penalty + penalty);
          inv.total = round2(inv.total + penalty);
          inv.balanceDue = round2(inv.balanceDue + penalty);
          await this.addLedgerEntry({ societyId, unitId: inv.unitId, date: now, type: 'DEBIT_NOTE', refType: 'InvoicePenalty', refId: inv._id, refNumber: inv.invoiceNumber, description: `Late payment penalty on ${inv.invoiceNumber}`, debit: penalty });
          result.penalties += 1;
        }
        await inv.save();
      }
      // reminders (before and after due date) with idempotent keys
      const before = cfg.reminderDaysBeforeDue ?? [3];
      const after = cfg.reminderDaysAfterDue ?? [7, 30];
      const open = await Invoice.find({ societyId, status: { $in: OPEN_STATUSES }, balanceDue: { $gt: 0 } }).populate('unitId', 'code');
      for (const inv of open) {
        const diff = dayjs(inv.dueDate).startOf('day').diff(dayjs(now).startOf('day'), 'day');
        const key = diff >= 0 && before.includes(diff) ? `before:${diff}` : diff < 0 && after.includes(-diff) ? `after:${-diff}` : null;
        if (!key || inv.remindersSent.some((r) => r.key === key)) continue;
        inv.remindersSent.push({ key, at: now } as any);
        await inv.save();
        domainEvents.emit(diff < 0 ? 'invoice.overdue' : 'invoice.reminder', { invoiceId: String(inv._id), invoiceNumber: inv.invoiceNumber, unitId: String((inv.unitId as any)._id), unitCode: (inv.unitId as any).code, balanceDue: inv.balanceDue, dueDate: inv.dueDate }, { societyId });
        result.reminders += 1;
      }
    }
    return result;
  }
}

export const billingService = new BillingService();

// residents module asks billing for outstanding dues before move-out
setDuesResolver((societyId, unitId) => billingService.getUnitBalance(societyId, unitId));

registerJobHandlers(() => {
  jobQueue.register(JobNames.INVOICE_OVERDUE, async () => {
    const r = await billingService.processOverdue();
    if (r.overdue || r.penalties || r.reminders) logger.info(r, 'Invoice overdue sweep');
  });
});
