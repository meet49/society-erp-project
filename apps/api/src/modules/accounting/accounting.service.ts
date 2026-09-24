import mongoose, { type ClientSession } from 'mongoose';
import dayjs from 'dayjs';
import { ErrorCodes } from '@society-erp/shared';
import { Account, DEBIT_NORMAL, type AccountDoc } from '../../models/account.model';
import { JournalEntry, type JournalEntryDoc } from '../../models/journal-entry.model';
import { Fund } from '../../models/fund.model';
import { BankAccount } from '../../models/bank-account.model';
import { Invoice } from '../../models/invoice.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { registerFinanceHooks } from '../../core/hooks/finance-hooks';
import { registerSocietyInitializer } from '../../core/tenancy/society.service';
import { moduleEngine } from '../../core/modules/module-engine.service';
import { logger } from '../../lib/logger';
import { round2 } from '../billing/charge-calculator';
import { DEFAULT_CHART_OF_ACCOUNTS, SystemAccountKeys } from './chart-of-accounts';

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
  fundKey?: string | null;
  partyType?: string | null;
  partyId?: any;
}

export interface JournalInput {
  date: Date;
  narration: string;
  lines: JournalLineInput[];
  source?: string;
  refType?: string | null;
  refId?: any;
  refNumber?: string | null;
  post?: boolean;
}

interface AccountingConfig {
  fiscalYearStartMonth: number;
  autoPostInvoices: boolean;
  autoPostPayments: boolean;
  autoPostExpenses: boolean;
}

const ONLINE_METHODS = new Set(['ONLINE', 'UPI', 'CARD', 'NETBANKING', 'WALLET']);

/**
 * Double-entry accounting: chart of accounts, journals, automatic postings from billing / payments /
 * expenses (through finance hooks) and the standard reports. Balances are always derived from posted
 * journal lines, never stored.
 */
class AccountingService {
  // ------------------------------------------------------------------ setup
  async ensureChartOfAccounts(societyId: string, session?: ClientSession): Promise<void> {
    for (const [i, a] of DEFAULT_CHART_OF_ACCOUNTS.entries()) {
      await Account.updateOne({ societyId, code: a.code }, { $setOnInsert: { ...a, societyId, sortOrder: i, isActive: true, openingBalance: 0 } }, { upsert: true, session });
    }
    for (const f of [{ key: 'SINKING', name: 'Sinking fund', accountCode: '3100' }, { key: 'CORPUS', name: 'Corpus fund', accountCode: '3110' }, { key: 'RESERVE', name: 'Reserve fund', accountCode: '3120' }, { key: 'REPAIR', name: 'Repair fund', accountCode: '3130' }]) {
      await Fund.updateOne({ societyId, key: f.key }, { $setOnInsert: { ...f, societyId, isActive: true, openingBalance: 0 } }, { upsert: true, session });
    }
    await BankAccount.updateOne({ societyId, accountCode: '1000' }, { $setOnInsert: { societyId, name: 'Cash box', kind: 'CASH', accountCode: '1000', paymentMethods: ['CASH'], isActive: true } }, { upsert: true, session });
    await BankAccount.updateOne({ societyId, accountCode: '1010' }, { $setOnInsert: { societyId, name: 'Main bank account', kind: 'BANK', accountCode: '1010', isDefault: true, paymentMethods: ['CHEQUE', 'BANK_TRANSFER', 'UPI', 'OTHER'], isActive: true } }, { upsert: true, session });
    await BankAccount.updateOne({ societyId, accountCode: '1020' }, { $setOnInsert: { societyId, name: 'Payment gateway settlement', kind: 'GATEWAY', accountCode: '1020', paymentMethods: ['ONLINE', 'CARD', 'NETBANKING', 'WALLET'], isActive: true } }, { upsert: true, session });
  }

  getConfig(societyId: string): Promise<AccountingConfig> {
    return configurationService.getSocietySetting<AccountingConfig>(societyId, 'accounting.config');
  }

  private async systemAccount(societyId: string, key: string): Promise<AccountDoc> {
    let acc = await Account.findOne({ societyId, systemKey: key, isActive: true });
    if (!acc) {
      await this.ensureChartOfAccounts(societyId);
      acc = await Account.findOne({ societyId, systemKey: key });
    }
    if (!acc) throw Errors.custom(500, ErrorCodes.INTERNAL_ERROR, `System account ${key} is missing`);
    return acc;
  }

  private async accountByCodeOrFallback(societyId: string, code: string | null | undefined, fallbackKey: string): Promise<string> {
    if (code) {
      const acc = await Account.findOne({ societyId, code, isActive: true }).select('code').lean();
      if (acc) return acc.code;
    }
    return (await this.systemAccount(societyId, fallbackKey)).code;
  }

  // ------------------------------------------------------------------ chart of accounts
  async listAccounts(societyId: string, opts: { includeInactive?: boolean; withBalances?: boolean; asOf?: Date } = {}) {
    if (!(await Account.exists({ societyId }))) await this.ensureChartOfAccounts(societyId);
    const accounts = await Account.find({ societyId, ...(opts.includeInactive ? {} : { isActive: true }) }).sort({ code: 1 }).lean();
    if (!opts.withBalances) return accounts.map((a) => ({ ...a, id: String(a._id) }));
    const balances = await this.balancesByAccount(societyId, { to: opts.asOf });
    return accounts.map((a) => {
      const b = balances.get(a.code) ?? { debit: 0, credit: 0 };
      const raw = a.openingBalance + (DEBIT_NORMAL.has(a.type) ? b.debit - b.credit : b.credit - b.debit);
      return { ...a, id: String(a._id), debit: round2(b.debit), credit: round2(b.credit), balance: round2(raw) };
    });
  }

  async createAccount(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    if (await Account.exists({ societyId, code: input.code })) throw Errors.conflict(`Account code ${input.code} already exists`);
    if (input.parentCode && !(await Account.exists({ societyId, code: input.parentCode }))) throw Errors.validation({ parentCode: ['Unknown parent account'] });
    const acc = await Account.create({ ...input, societyId, createdBy: byUserId, isSystem: false, systemKey: null });
    auditService.record({ action: 'accounting.account_created', resource: 'Account', resourceId: acc._id, societyId, newValue: input, req });
    return acc.toJSON();
  }

  async updateAccount(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const acc = await Account.findOne({ _id: id, societyId });
    if (!acc) throw Errors.notFound('Account');
    if (patch.code && patch.code !== acc.code) {
      if (await Account.exists({ societyId, code: patch.code })) throw Errors.conflict('Account code already exists');
      const used = await JournalEntry.exists({ societyId, 'lines.accountCode': acc.code });
      if (used) throw Errors.conflict('Accounts with journal entries cannot be re-coded');
    }
    if (patch.isActive === false && acc.isSystem) throw Errors.conflict('System accounts cannot be deactivated');
    acc.set({ ...patch, type: acc.isSystem ? acc.type : (patch.type ?? acc.type) });
    await acc.save();
    auditService.record({ action: 'accounting.account_updated', resource: 'Account', resourceId: acc._id, societyId, newValue: patch, req });
    return acc.toJSON();
  }

  async deleteAccount(societyId: string, id: string, req?: any): Promise<void> {
    const acc = await Account.findOne({ _id: id, societyId });
    if (!acc) throw Errors.notFound('Account');
    if (acc.isSystem) throw Errors.conflict('System accounts cannot be deleted');
    if (await JournalEntry.exists({ societyId, 'lines.accountCode': acc.code })) throw Errors.conflict('This account has journal entries; deactivate it instead');
    await acc.deleteOne();
    auditService.record({ action: 'accounting.account_deleted', resource: 'Account', resourceId: id, societyId, req });
  }

  // ------------------------------------------------------------------ funds
  async listFunds(societyId: string) {
    if (!(await Fund.exists({ societyId }))) await this.ensureChartOfAccounts(societyId);
    const funds = await Fund.find({ societyId }).sort({ key: 1 }).lean();
    const sid = new mongoose.Types.ObjectId(societyId);
    const agg = await JournalEntry.aggregate([{ $match: { societyId: sid, status: { $in: ['POSTED', 'REVERSED'] } } }, { $unwind: '$lines' }, { $match: { 'lines.fundKey': { $ne: null } } }, { $group: { _id: '$lines.fundKey', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } }]);
    const byKey = new Map(agg.map((a) => [a._id, a]));
    return funds.map((f) => {
      const b = byKey.get(f.key) ?? { debit: 0, credit: 0 };
      return { ...f, id: String(f._id), contributions: round2(b.credit), utilisation: round2(b.debit), balance: round2(f.openingBalance + b.credit - b.debit) };
    });
  }

  async upsertFund(societyId: string, input: { key: string; name: string; description?: string; accountCode: string; targetAmount?: number | null; openingBalance?: number; isActive?: boolean }, byUserId: string, req?: any) {
    if (!(await Account.exists({ societyId, code: input.accountCode }))) throw Errors.validation({ accountCode: ['Unknown ledger account'] });
    const fund = await Fund.findOneAndUpdate({ societyId, key: input.key.toUpperCase() }, { $set: { ...input, key: input.key.toUpperCase() }, $setOnInsert: { societyId, createdBy: byUserId } }, { upsert: true, new: true });
    await Account.updateOne({ societyId, code: input.accountCode }, { $set: { fundKey: fund.key } });
    auditService.record({ action: 'accounting.fund_saved', resource: 'Fund', resourceId: fund._id, societyId, newValue: input, req });
    return fund.toJSON();
  }

  // ------------------------------------------------------------------ journals
  private async validateLines(societyId: string, lines: JournalLineInput[]) {
    if (lines.length < 2) throw Errors.validation({ lines: ['A journal needs at least two lines'] });
    const codes = [...new Set(lines.map((l) => l.accountCode))];
    const accounts = await Account.find({ societyId, code: { $in: codes }, isActive: true }).lean();
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const missing = codes.filter((c) => !byCode.has(c));
    if (missing.length) throw Errors.validation({ lines: [`Unknown or inactive account(s): ${missing.join(', ')}`] });
    let debit = 0;
    let credit = 0;
    const normalised = lines.map((l) => {
      const d = round2(l.debit ?? 0);
      const c = round2(l.credit ?? 0);
      if ((d > 0 && c > 0) || (d === 0 && c === 0)) throw Errors.validation({ lines: ['Each line must have either a debit or a credit amount'] });
      debit += d;
      credit += c;
      return { accountCode: l.accountCode, accountName: byCode.get(l.accountCode)!.name, description: l.description, debit: d, credit: c, fundKey: l.fundKey ? l.fundKey.toUpperCase() : byCode.get(l.accountCode)!.fundKey ?? null, partyType: l.partyType ?? null, partyId: l.partyId ?? null };
    });
    if (round2(debit) !== round2(credit)) throw Errors.validation({ lines: [`Journal is not balanced: debits ${round2(debit)} ≠ credits ${round2(credit)}`] });
    return { lines: normalised, total: round2(debit) };
  }

  async createJournal(societyId: string, input: JournalInput, byUserId: string | null, req?: any, session?: ClientSession): Promise<JournalEntryDoc> {
    const { lines, total } = await this.validateLines(societyId, input.lines);
    const general = await configurationService.getSocietySetting<{ financialYearStartMonth: number }>(societyId, 'society.general');
    const entryNumber = await sequenceService.next(societyId, 'journal', { prefix: 'JV', padding: 5, resetPolicy: 'FISCAL_YEAR', fiscalYearStartMonth: general.financialYearStartMonth });
    const [entry] = await JournalEntry.create([{ societyId, entryNumber, date: input.date, narration: input.narration, lines, totalDebit: total, totalCredit: total, status: input.post ? 'POSTED' : 'DRAFT', source: input.source ?? 'MANUAL', refType: input.refType ?? null, refId: input.refId ?? null, refNumber: input.refNumber ?? null, postedAt: input.post ? new Date() : undefined, postedBy: input.post ? byUserId : undefined, createdBy: byUserId }], { session });
    auditService.record({ action: input.post ? 'accounting.journal_posted' : 'accounting.journal_created', resource: 'JournalEntry', resourceId: entry._id, societyId, newValue: { entryNumber, total, source: entry.source, ref: input.refNumber }, actor: byUserId ? undefined : { type: 'SYSTEM' }, req });
    return entry;
  }

  async updateJournal(societyId: string, id: string, patch: Partial<JournalInput>, req?: any) {
    const entry = await JournalEntry.findOne({ _id: id, societyId });
    if (!entry) throw Errors.notFound('Journal entry');
    if (entry.status !== 'DRAFT') throw Errors.conflict('Only draft journals can be edited; reverse posted entries instead');
    if (patch.lines) {
      const { lines, total } = await this.validateLines(societyId, patch.lines);
      entry.lines = lines as any;
      entry.totalDebit = total;
      entry.totalCredit = total;
    }
    if (patch.date) entry.date = patch.date;
    if (patch.narration) entry.narration = patch.narration;
    await entry.save();
    auditService.record({ action: 'accounting.journal_updated', resource: 'JournalEntry', resourceId: entry._id, societyId, req });
    return entry.toJSON();
  }

  async postJournal(societyId: string, id: string, byUserId: string, req?: any) {
    const entry = await JournalEntry.findOne({ _id: id, societyId });
    if (!entry) throw Errors.notFound('Journal entry');
    if (entry.status !== 'DRAFT') throw Errors.invalidTransition(entry.status, 'POSTED', 'Journal');
    await this.validateLines(societyId, entry.lines as any);
    entry.status = 'POSTED';
    entry.postedAt = new Date();
    entry.postedBy = byUserId as any;
    await entry.save();
    auditService.record({ action: 'accounting.journal_posted', resource: 'JournalEntry', resourceId: entry._id, societyId, newValue: { entryNumber: entry.entryNumber }, req });
    return entry.toJSON();
  }

  async deleteDraft(societyId: string, id: string, req?: any): Promise<void> {
    const entry = await JournalEntry.findOne({ _id: id, societyId });
    if (!entry) throw Errors.notFound('Journal entry');
    if (entry.status !== 'DRAFT') throw Errors.conflict('Only draft journals can be deleted');
    await entry.deleteOne();
    auditService.record({ action: 'accounting.journal_deleted', resource: 'JournalEntry', resourceId: id, societyId, req });
  }

  /** Reverses a posted entry with a mirrored posted entry (never edits history). */
  async reverseJournal(societyId: string, id: string, byUserId: string | null, reason: string, req?: any, date = new Date()): Promise<JournalEntryDoc> {
    const entry = await JournalEntry.findOne({ _id: id, societyId });
    if (!entry) throw Errors.notFound('Journal entry');
    if (entry.status !== 'POSTED') throw Errors.invalidTransition(entry.status, 'REVERSED', 'Journal');
    const reversal = await this.createJournal(societyId, { date, narration: `Reversal of ${entry.entryNumber}: ${reason}`, lines: entry.lines.map((l) => ({ accountCode: l.accountCode, debit: l.credit, credit: l.debit, description: l.description ?? undefined, fundKey: l.fundKey, partyType: l.partyType, partyId: l.partyId })), source: entry.source as any, refType: entry.refType, refId: entry.refId, refNumber: entry.refNumber, post: true }, byUserId, req);
    reversal.reversalOf = entry._id;
    await reversal.save();
    entry.status = 'REVERSED';
    entry.reversedBy = reversal._id;
    await entry.save();
    auditService.record({ action: 'accounting.journal_reversed', resource: 'JournalEntry', resourceId: entry._id, societyId, newValue: { reversal: reversal.entryNumber, reason }, actor: byUserId ? undefined : { type: 'SYSTEM' }, req });
    return reversal;
  }

  async reverseByRef(societyId: string, refType: string, refId: any, reason: string, byUserId?: string): Promise<void> {
    const entries = await JournalEntry.find({ societyId, refType, refId, status: 'POSTED' });
    for (const e of entries) await this.reverseJournal(societyId, String(e._id), byUserId ?? null, reason);
  }

  async listJournals(societyId: string, query: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId };
    if (query.status) filter.status = query.status;
    if (query.source) filter.source = query.source;
    if (query.accountCode) filter['lines.accountCode'] = query.accountCode;
    if (query.from || query.to) filter.date = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ entryNumber: rx }, { narration: rx }, { refNumber: rx }];
    return paginate(JournalEntry as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-date,-createdAt', allowedSorts: ['date', 'createdAt', 'entryNumber', 'totalDebit', 'status'], populate: [{ path: 'createdBy', select: 'name' }] });
  }

  async getJournal(societyId: string, id: string) {
    const entry = await JournalEntry.findOne({ _id: id, societyId }).populate('createdBy', 'name').populate('postedBy', 'name').lean();
    if (!entry) throw Errors.notFound('Journal entry');
    return { ...entry, id: String(entry._id) };
  }

  // ------------------------------------------------------------------ automatic postings (finance hooks)
  private async shouldAutoPost(societyId: string, flag: keyof AccountingConfig): Promise<boolean> {
    const states = await moduleEngine.getSocietyModuleStates(societyId).catch(() => null);
    const accounting = states?.find((s: any) => s.key === 'accounting');
    if (accounting && !accounting.accessible) return false;
    const cfg = await this.getConfig(societyId);
    return Boolean(cfg[flag]);
  }

  async postInvoice(invoice: any, ctx: { societyId: string; byUserId?: string }): Promise<void> {
    if (!(await this.shouldAutoPost(ctx.societyId, 'autoPostInvoices'))) return;
    if (await JournalEntry.exists({ societyId: ctx.societyId, refType: 'Invoice', refId: invoice._id, status: 'POSTED' })) return;
    const receivables = await this.systemAccount(ctx.societyId, SystemAccountKeys.RECEIVABLES);
    const taxPayable = await this.systemAccount(ctx.societyId, SystemAccountKeys.TAX_PAYABLE);
    const penaltyIncome = await this.systemAccount(ctx.societyId, SystemAccountKeys.PENALTY_INCOME);
    const lines: JournalLineInput[] = [{ accountCode: receivables.code, debit: invoice.total, description: `Invoice ${invoice.invoiceNumber}`, partyType: 'Unit', partyId: invoice.unitId }];
    const byAccount = new Map<string, { amount: number; fundKey: string | null }>();
    for (const li of invoice.lineItems ?? []) {
      const code = await this.accountByCodeOrFallback(ctx.societyId, li.ledgerAccountCode, SystemAccountKeys.MAINTENANCE_INCOME);
      const cur = byAccount.get(code) ?? { amount: 0, fundKey: li.fundKey ?? null };
      cur.amount = round2(cur.amount + li.amount);
      byAccount.set(code, cur);
    }
    for (const [code, v] of byAccount) lines.push({ accountCode: code, credit: v.amount, fundKey: v.fundKey });
    if (invoice.taxTotal) lines.push({ accountCode: taxPayable.code, credit: invoice.taxTotal, description: 'Tax on invoice' });
    if (invoice.penalty) lines.push({ accountCode: penaltyIncome.code, credit: invoice.penalty, description: 'Late payment penalty' });
    if (invoice.discount?.amount) lines.push({ accountCode: (await this.systemAccount(ctx.societyId, SystemAccountKeys.MAINTENANCE_INCOME)).code, debit: invoice.discount.amount, description: 'Discount' });
    // rounding differences from round-off go to other income
    const debit = round2(lines.reduce((s, l) => s + (l.debit ?? 0), 0));
    const credit = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
    if (debit !== credit) lines.push(debit > credit ? { accountCode: (await this.systemAccount(ctx.societyId, SystemAccountKeys.OTHER_INCOME)).code, credit: round2(debit - credit), description: 'Round off' } : { accountCode: (await this.systemAccount(ctx.societyId, SystemAccountKeys.OTHER_INCOME)).code, debit: round2(credit - debit), description: 'Round off' });
    const entry = await this.createJournal(ctx.societyId, { date: invoice.issueDate ?? new Date(), narration: `Invoice ${invoice.invoiceNumber}${invoice.period?.label ? ` (${invoice.period.label})` : ''}`, lines, source: 'INVOICE', refType: 'Invoice', refId: invoice._id, refNumber: invoice.invoiceNumber, post: true }, ctx.byUserId ?? null);
    await Invoice.updateOne({ _id: invoice._id }, { $set: { journalEntryId: entry._id } });
  }

  async postPayment(payment: any, ctx: { societyId: string; byUserId?: string }): Promise<void> {
    if (!(await this.shouldAutoPost(ctx.societyId, 'autoPostPayments'))) return;
    if (await JournalEntry.exists({ societyId: ctx.societyId, refType: 'Payment', refId: payment._id, status: 'POSTED' })) return;
    const receivables = await this.systemAccount(ctx.societyId, SystemAccountKeys.RECEIVABLES);
    const advances = await this.systemAccount(ctx.societyId, SystemAccountKeys.MEMBER_ADVANCES);
    const bank = await this.bankAccountForPayment(ctx.societyId, payment);
    const allocated = round2(payment.amount - (payment.unallocatedAmount ?? 0));
    const lines: JournalLineInput[] = [{ accountCode: bank.accountCode, debit: payment.amount, description: `Receipt ${payment.receiptNumber}`, partyType: 'BankAccount', partyId: bank._id }];
    if (allocated > 0) lines.push({ accountCode: receivables.code, credit: allocated, partyType: 'Unit', partyId: payment.unitId });
    if ((payment.unallocatedAmount ?? 0) > 0) lines.push({ accountCode: advances.code, credit: payment.unallocatedAmount, description: 'Advance received', partyType: 'Unit', partyId: payment.unitId });
    const entry = await this.createJournal(ctx.societyId, { date: payment.receivedAt ?? new Date(), narration: `Receipt ${payment.receiptNumber} (${payment.method})`, lines, source: 'PAYMENT', refType: 'Payment', refId: payment._id, refNumber: payment.receiptNumber, post: true }, ctx.byUserId ?? null);
    await mongoose.model('Payment').updateOne({ _id: payment._id }, { $set: { journalEntryId: entry._id } });
  }

  async postRefund(payment: any, ctx: { societyId: string; byUserId?: string; amount: number }): Promise<void> {
    if (!(await this.shouldAutoPost(ctx.societyId, 'autoPostPayments'))) return;
    const receivables = await this.systemAccount(ctx.societyId, SystemAccountKeys.RECEIVABLES);
    const bank = await this.bankAccountForPayment(ctx.societyId, payment);
    await this.createJournal(ctx.societyId, { date: new Date(), narration: `Refund against ${payment.receiptNumber}: ${payment.refund?.reason ?? ''}`.trim(), lines: [{ accountCode: receivables.code, debit: ctx.amount, partyType: 'Unit', partyId: payment.unitId }, { accountCode: bank.accountCode, credit: ctx.amount, partyType: 'BankAccount', partyId: bank._id }], source: 'REFUND', refType: 'PaymentRefund', refId: payment._id, refNumber: payment.receiptNumber, post: true }, ctx.byUserId ?? null);
  }

  async postExpenseApproved(expense: any, ctx: { societyId: string; byUserId?: string }): Promise<void> {
    if (!(await this.shouldAutoPost(ctx.societyId, 'autoPostExpenses'))) return;
    if (await JournalEntry.exists({ societyId: ctx.societyId, refType: 'Expense', refId: expense._id, status: 'POSTED' })) return;
    const payables = await this.systemAccount(ctx.societyId, SystemAccountKeys.PAYABLES);
    const expenseCode = await this.accountByCodeOrFallback(ctx.societyId, expense.accountCode, SystemAccountKeys.GENERAL_EXPENSE);
    const lines: JournalLineInput[] = [{ accountCode: expenseCode, debit: round2(expense.amount + (expense.taxAmount ?? 0)), description: expense.title, fundKey: expense.fundKey ?? null, partyType: expense.vendorId ? 'Vendor' : null, partyId: expense.vendorId ?? null }];
    if (expense.tdsAmount) lines.push({ accountCode: (await this.systemAccount(ctx.societyId, SystemAccountKeys.TDS_PAYABLE)).code, credit: expense.tdsAmount, description: 'TDS deducted' });
    lines.push({ accountCode: payables.code, credit: round2(expense.total), partyType: expense.vendorId ? 'Vendor' : null, partyId: expense.vendorId ?? null });
    const entry = await this.createJournal(ctx.societyId, { date: expense.billDate ?? expense.approvedAt ?? new Date(), narration: `Expense ${expense.expenseNumber}: ${expense.title}${expense.vendorName ? ` (${expense.vendorName})` : ''}`, lines, source: 'EXPENSE', refType: 'Expense', refId: expense._id, refNumber: expense.expenseNumber, post: true }, ctx.byUserId ?? null);
    await mongoose.model('Expense').updateOne({ _id: expense._id }, { $set: { approvalJournalEntryId: entry._id } });
  }

  async postExpensePayment(expense: any, ctx: { societyId: string; byUserId?: string; payment?: any }): Promise<void> {
    if (!(await this.shouldAutoPost(ctx.societyId, 'autoPostExpenses'))) return;
    const payment = ctx.payment ?? expense.payments?.[expense.payments.length - 1];
    if (!payment) return;
    if (await JournalEntry.exists({ societyId: ctx.societyId, refType: 'ExpensePayment', refId: payment._id, status: 'POSTED' })) return;
    const payables = await this.systemAccount(ctx.societyId, SystemAccountKeys.PAYABLES);
    const bank = payment.bankAccountId ? await BankAccount.findOne({ _id: payment.bankAccountId, societyId: ctx.societyId }).lean() : await this.bankAccountForMethod(ctx.societyId, payment.method);
    const bankCode = bank?.accountCode ?? (await this.systemAccount(ctx.societyId, SystemAccountKeys.BANK)).code;
    const entry = await this.createJournal(ctx.societyId, { date: payment.date ?? new Date(), narration: `Paid ${expense.expenseNumber}${expense.vendorName ? ` to ${expense.vendorName}` : ''} (${payment.method})`, lines: [{ accountCode: payables.code, debit: payment.amount, partyType: expense.vendorId ? 'Vendor' : null, partyId: expense.vendorId ?? null }, { accountCode: bankCode, credit: payment.amount, partyType: 'BankAccount', partyId: bank?._id ?? null }], source: 'EXPENSE_PAYMENT', refType: 'ExpensePayment', refId: payment._id, refNumber: expense.expenseNumber, post: true }, ctx.byUserId ?? null);
    await mongoose.model('Expense').updateOne({ _id: expense._id, 'payments._id': payment._id }, { $set: { 'payments.$.journalEntryId': entry._id } });
  }

  private async bankAccountForMethod(societyId: string, method: string) {
    if (!(await BankAccount.exists({ societyId }))) await this.ensureChartOfAccounts(societyId);
    const byMethod = await BankAccount.findOne({ societyId, isActive: true, paymentMethods: method }).lean();
    if (byMethod) return byMethod;
    if (ONLINE_METHODS.has(method)) {
      const gw = await BankAccount.findOne({ societyId, isActive: true, kind: 'GATEWAY' }).lean();
      if (gw) return gw;
    }
    return (await BankAccount.findOne({ societyId, isActive: true, isDefault: true }).lean()) ?? (await BankAccount.findOne({ societyId, isActive: true }).lean())!;
  }

  private async bankAccountForPayment(societyId: string, payment: any) {
    if (payment.bankAccountId) {
      const b = await BankAccount.findOne({ _id: payment.bankAccountId, societyId }).lean();
      if (b) return b;
    }
    return this.bankAccountForMethod(societyId, payment.provider && payment.provider !== 'manual' ? 'ONLINE' : payment.method);
  }

  // ------------------------------------------------------------------ reports
  private async balancesByAccount(societyId: string, range: { from?: Date; to?: Date } = {}): Promise<Map<string, { debit: number; credit: number }>> {
    const match: Record<string, unknown> = { societyId: new mongoose.Types.ObjectId(societyId), status: { $in: ['POSTED', 'REVERSED'] } };
    if (range.from || range.to) match.date = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
    const agg = await JournalEntry.aggregate([{ $match: match }, { $unwind: '$lines' }, { $group: { _id: '$lines.accountCode', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } }]);
    return new Map(agg.map((a) => [a._id, { debit: a.debit, credit: a.credit }]));
  }

  async trialBalance(societyId: string, asOf?: Date) {
    const accounts = await this.listAccounts(societyId, { withBalances: true, asOf });
    const rows = accounts.filter((a: any) => a.debit || a.credit || a.openingBalance).map((a: any) => ({ code: a.code, name: a.name, type: a.type, debit: DEBIT_NORMAL.has(a.type) && a.balance > 0 ? a.balance : !DEBIT_NORMAL.has(a.type) && a.balance < 0 ? -a.balance : 0, credit: !DEBIT_NORMAL.has(a.type) && a.balance > 0 ? a.balance : DEBIT_NORMAL.has(a.type) && a.balance < 0 ? -a.balance : 0 }));
    return { asOf: asOf ?? new Date(), rows, totalDebit: round2(rows.reduce((s, r) => s + r.debit, 0)), totalCredit: round2(rows.reduce((s, r) => s + r.credit, 0)) };
  }

  /** Income & expenditure statement (P&L) for a period. */
  async incomeExpenditure(societyId: string, from: Date, to: Date) {
    const balances = await this.balancesByAccount(societyId, { from, to });
    const accounts = await Account.find({ societyId, type: { $in: ['INCOME', 'EXPENSE'] } }).sort({ code: 1 }).lean();
    const income = accounts.filter((a) => a.type === 'INCOME').map((a) => ({ code: a.code, name: a.name, amount: round2((balances.get(a.code)?.credit ?? 0) - (balances.get(a.code)?.debit ?? 0)) })).filter((r) => r.amount !== 0);
    const expense = accounts.filter((a) => a.type === 'EXPENSE').map((a) => ({ code: a.code, name: a.name, amount: round2((balances.get(a.code)?.debit ?? 0) - (balances.get(a.code)?.credit ?? 0)) })).filter((r) => r.amount !== 0);
    const totalIncome = round2(income.reduce((s, r) => s + r.amount, 0));
    const totalExpense = round2(expense.reduce((s, r) => s + r.amount, 0));
    return { from, to, income, expense, totalIncome, totalExpense, surplus: round2(totalIncome - totalExpense) };
  }

  async balanceSheet(societyId: string, asOf = new Date()) {
    const accounts = await this.listAccounts(societyId, { withBalances: true, asOf });
    const cfg = await configurationService.getSocietySetting<{ financialYearStartMonth: number }>(societyId, 'society.general');
    const fyStart = dayjs(asOf).month() + 1 >= cfg.financialYearStartMonth ? dayjs(asOf).month(cfg.financialYearStartMonth - 1).startOf('month') : dayjs(asOf).subtract(1, 'year').month(cfg.financialYearStartMonth - 1).startOf('month');
    const pl = await this.incomeExpenditure(societyId, dayjs('1970-01-01').toDate(), asOf);
    const group = (type: string) => accounts.filter((a: any) => a.type === type && a.balance !== 0).map((a: any) => ({ code: a.code, name: a.name, amount: a.balance }));
    const assets = group('ASSET');
    const liabilities = group('LIABILITY');
    const equity = group('EQUITY');
    const totalAssets = round2(assets.reduce((s, r) => s + r.amount, 0));
    const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.amount, 0));
    const totalEquity = round2(equity.reduce((s, r) => s + r.amount, 0));
    return { asOf, fiscalYearStart: fyStart.toDate(), assets, liabilities, equity, accumulatedSurplus: pl.surplus, totalAssets, totalLiabilities, totalEquity: round2(totalEquity + pl.surplus), difference: round2(totalAssets - totalLiabilities - totalEquity - pl.surplus) };
  }

  async generalLedger(societyId: string, accountCode: string, range: { from?: Date; to?: Date } = {}) {
    const account = await Account.findOne({ societyId, code: accountCode }).lean();
    if (!account) throw Errors.notFound('Account');
    const sid = new mongoose.Types.ObjectId(societyId);
    const opening = await JournalEntry.aggregate([{ $match: { societyId: sid, status: { $in: ['POSTED', 'REVERSED'] }, ...(range.from ? { date: { $lt: range.from } } : { date: { $lt: new Date(0) } }) } }, { $unwind: '$lines' }, { $match: { 'lines.accountCode': accountCode } }, { $group: { _id: null, debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } }]);
    const debitNormal = DEBIT_NORMAL.has(account.type);
    let running = round2(account.openingBalance + (debitNormal ? (opening[0]?.debit ?? 0) - (opening[0]?.credit ?? 0) : (opening[0]?.credit ?? 0) - (opening[0]?.debit ?? 0)));
    const openingBalance = running;
    const match: Record<string, unknown> = { societyId: sid, status: { $in: ['POSTED', 'REVERSED'] }, 'lines.accountCode': accountCode };
    if (range.from || range.to) match.date = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
    const entries = await JournalEntry.find(match).sort({ date: 1, createdAt: 1 }).lean();
    const rows: any[] = [];
    for (const e of entries) {
      for (const l of e.lines.filter((x) => x.accountCode === accountCode)) {
        running = round2(running + (debitNormal ? l.debit - l.credit : l.credit - l.debit));
        rows.push({ entryId: String(e._id), entryNumber: e.entryNumber, date: e.date, narration: e.narration, description: l.description, refType: e.refType, refNumber: e.refNumber, debit: l.debit, credit: l.credit, balance: running });
      }
    }
    return { account: { ...account, id: String(account._id) }, openingBalance, rows, closingBalance: running };
  }

  async dayBook(societyId: string, from: Date, to: Date) {
    const entries = await JournalEntry.find({ societyId, status: { $in: ['POSTED', 'REVERSED'] }, date: { $gte: from, $lte: to } }).sort({ date: 1, createdAt: 1 }).lean();
    return entries.map((e) => ({ ...e, id: String(e._id) }));
  }

  async receivablesAging(societyId: string, asOf = new Date()) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const buckets = [{ key: 'current', label: 'Not due', min: -Infinity, max: 0 }, { key: 'd1_30', label: '1–30 days', min: 1, max: 30 }, { key: 'd31_60', label: '31–60 days', min: 31, max: 60 }, { key: 'd61_90', label: '61–90 days', min: 61, max: 90 }, { key: 'd90p', label: '90+ days', min: 91, max: Infinity }];
    const invoices = await Invoice.find({ societyId: sid, status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] }, balanceDue: { $gt: 0 } }).select('unitId balanceDue dueDate').populate('unitId', 'code buildingId').lean();
    const byUnit = new Map<string, any>();
    const totals: Record<string, number> = Object.fromEntries(buckets.map((b) => [b.key, 0]));
    for (const inv of invoices) {
      const days = dayjs(asOf).diff(dayjs(inv.dueDate), 'day');
      const bucket = buckets.find((b) => days >= b.min && days <= b.max)!;
      const unitId = String((inv.unitId as any)?._id ?? inv.unitId);
      const row = byUnit.get(unitId) ?? { unitId, unitCode: (inv.unitId as any)?.code, total: 0, ...Object.fromEntries(buckets.map((b) => [b.key, 0])) };
      row[bucket.key] = round2(row[bucket.key] + inv.balanceDue);
      row.total = round2(row.total + inv.balanceDue);
      totals[bucket.key] = round2(totals[bucket.key] + inv.balanceDue);
      byUnit.set(unitId, row);
    }
    const rows = [...byUnit.values()].sort((a, b) => b.total - a.total);
    return { asOf, buckets: buckets.map((b) => ({ key: b.key, label: b.label })), rows, totals, grandTotal: round2(rows.reduce((s, r) => s + r.total, 0)) };
  }

  async summary(societyId: string) {
    const now = new Date();
    const cfg = await configurationService.getSocietySetting<{ financialYearStartMonth: number }>(societyId, 'society.general');
    const fyStart = dayjs(now).month() + 1 >= cfg.financialYearStartMonth ? dayjs(now).month(cfg.financialYearStartMonth - 1).startOf('month') : dayjs(now).subtract(1, 'year').month(cfg.financialYearStartMonth - 1).startOf('month');
    const [pl, month, accounts, drafts, funds] = await Promise.all([this.incomeExpenditure(societyId, fyStart.toDate(), now), this.incomeExpenditure(societyId, dayjs(now).startOf('month').toDate(), now), this.listAccounts(societyId, { withBalances: true }), JournalEntry.countDocuments({ societyId, status: 'DRAFT' }), this.listFunds(societyId)]);
    const cashAndBank = round2(accounts.filter((a: any) => ['CASH', 'BANK', 'GATEWAY_SETTLEMENT'].includes(a.systemKey)).reduce((s: number, a: any) => s + a.balance, 0));
    const receivables = round2(accounts.filter((a: any) => a.systemKey === 'RECEIVABLES').reduce((s: number, a: any) => s + a.balance, 0));
    const payables = round2(accounts.filter((a: any) => a.systemKey === 'PAYABLES').reduce((s: number, a: any) => s + a.balance, 0));
    return { fiscalYearStart: fyStart.toDate(), ytd: { income: pl.totalIncome, expense: pl.totalExpense, surplus: pl.surplus }, month: { income: month.totalIncome, expense: month.totalExpense, surplus: month.surplus }, cashAndBank, receivables, payables, draftJournals: drafts, funds: funds.map((f: any) => ({ key: f.key, name: f.name, balance: f.balance })), topExpenses: pl.expense.sort((a, b) => b.amount - a.amount).slice(0, 6), topIncome: pl.income.sort((a, b) => b.amount - a.amount).slice(0, 6) };
  }

  /** Monthly income vs expense trend for the last N months. */
  async trend(societyId: string, months = 6) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const from = dayjs().subtract(months - 1, 'month').startOf('month').toDate();
    const agg = await JournalEntry.aggregate([{ $match: { societyId: sid, status: { $in: ['POSTED', 'REVERSED'] }, date: { $gte: from } } }, { $unwind: '$lines' }, { $lookup: { from: 'accounts', let: { code: '$lines.accountCode', sid: '$societyId' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$code', '$$code'] }, { $eq: ['$societyId', '$$sid'] }] } } }, { $project: { type: 1 } }], as: 'account' } }, { $unwind: '$account' }, { $match: { 'account.type': { $in: ['INCOME', 'EXPENSE'] } } }, { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, type: '$account.type' }, debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } }]);
    const rows = new Map<string, { month: string; income: number; expense: number }>();
    for (let i = 0; i < months; i += 1) {
      const m = dayjs(from).add(i, 'month').format('YYYY-MM');
      rows.set(m, { month: m, income: 0, expense: 0 });
    }
    for (const a of agg) {
      const row = rows.get(a._id.month);
      if (!row) continue;
      if (a._id.type === 'INCOME') row.income = round2(row.income + a.credit - a.debit);
      else row.expense = round2(row.expense + a.debit - a.credit);
    }
    return [...rows.values()];
  }
}

export const accountingService = new AccountingService();

registerSocietyInitializer('accounting', async ({ societyId, session }) => {
  await accountingService.ensureChartOfAccounts(societyId, session);
});

registerFinanceHooks({
  onInvoiceIssued: (invoice, ctx) => accountingService.postInvoice(invoice, ctx),
  onInvoiceCancelled: async (invoice, ctx) => accountingService.reverseByRef(ctx.societyId, 'Invoice', invoice._id, `Invoice ${invoice.invoiceNumber} cancelled`, ctx.byUserId),
  onPaymentReceived: (payment, ctx) => accountingService.postPayment(payment, ctx),
  onPaymentRefunded: (payment, ctx) => accountingService.postRefund(payment, ctx),
  onExpenseApproved: (expense, ctx) => accountingService.postExpenseApproved(expense, ctx),
  onExpensePaid: (expense, ctx) => accountingService.postExpensePayment(expense, ctx as any),
});

logger.debug('Accounting finance hooks registered');
