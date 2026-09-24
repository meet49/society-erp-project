import mongoose from 'mongoose';
import dayjs from 'dayjs';
// .js is required: dayjs ships no exports map for its plugin subpaths, so Node's ESM resolver
// rejects the extensionless form at runtime even though tsx and bundlers accept it.
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { BankAccount } from '../../models/bank-account.model';
import { BankTransaction } from '../../models/bank-transaction.model';
import { Payment } from '../../models/payment.model';
import { Expense } from '../../models/expense.model';
import { Account } from '../../models/account.model';
import { JournalEntry } from '../../models/journal-entry.model';
import { Errors } from '../../lib/errors';
import { paginate } from '../../lib/pagination';
import { sha256 } from '../../lib/crypto';
import { auditService } from '../../core/audit/audit.service';
import { round2 } from '../billing/charge-calculator';
import { accountingService } from './accounting.service';

dayjs.extend(customParseFormat);

/** Parses a bank statement CSV. Accepts common Indian bank exports: date, description/narration, ref/chq no, debit, credit or amount+type, balance. */
export function parseStatementCsv(csv: string): { rows: { date: Date; description: string; reference?: string; amount: number; type: 'CREDIT' | 'DEBIT'; balanceAfter?: number; line: number }[]; errors: { line: number; message: string }[] } {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: any[] = [];
  const errors: { line: number; message: string }[] = [];
  if (!lines.length) return { rows, errors };
  const split = (l: string) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()).filter((_, i, arr) => i < arr.length - 1 || _ !== '') ?? [];
  const header = split(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = idx(['date', 'txndate', 'valuedate']);
  const iDesc = idx(['description', 'narration', 'particulars', 'details', 'remarks']);
  const iRef = idx(['ref', 'chq', 'cheque', 'utr', 'transactionid']);
  const iDebit = idx(['debit', 'withdrawal', 'dr']);
  const iCredit = idx(['credit', 'deposit', 'cr']);
  const iAmount = idx(['amount']);
  const iType = idx(['type', 'drcr']);
  const iBalance = idx(['balance']);
  if (iDate < 0 || (iDebit < 0 && iCredit < 0 && iAmount < 0)) return { rows, errors: [{ line: 1, message: 'Header must include a date column and debit/credit (or amount) columns' }] };
  const num = (s?: string) => { const n = Number(String(s ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const parseDate = (s: string) => { for (const f of ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'DD MMM YYYY', 'D/M/YYYY', 'DD/MM/YY']) { const d = dayjs(s, f as any, true); if (d.isValid()) return d.toDate(); } const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; };
  lines.slice(1).forEach((line, i) => {
    const cells = split(line);
    const date = parseDate(cells[iDate] ?? '');
    if (!date) { errors.push({ line: i + 2, message: `Unreadable date "${cells[iDate] ?? ''}"` }); return; }
    let amount = 0;
    let type: 'CREDIT' | 'DEBIT' = 'CREDIT';
    if (iDebit >= 0 || iCredit >= 0) {
      const d = iDebit >= 0 ? num(cells[iDebit]) : 0;
      const c = iCredit >= 0 ? num(cells[iCredit]) : 0;
      if (d > 0) { amount = d; type = 'DEBIT'; } else if (c > 0) { amount = c; type = 'CREDIT'; }
    } else {
      const a = num(cells[iAmount]);
      const t = (cells[iType] ?? '').toUpperCase();
      amount = Math.abs(a);
      type = a < 0 || t.startsWith('D') ? 'DEBIT' : 'CREDIT';
    }
    if (!amount) { errors.push({ line: i + 2, message: 'No amount' }); return; }
    rows.push({ date, description: cells[iDesc] ?? '', reference: iRef >= 0 ? cells[iRef] || undefined : undefined, amount: round2(amount), type, balanceAfter: iBalance >= 0 ? num(cells[iBalance]) : undefined, line: i + 2 });
  });
  return { rows, errors };
}

class BankService {
  // ------------------------------------------------------------------ accounts
  async list(societyId: string) {
    if (!(await BankAccount.exists({ societyId }))) await accountingService.ensureChartOfAccounts(societyId);
    const accounts = await BankAccount.find({ societyId }).sort({ isDefault: -1, name: 1 }).lean();
    const ledger = await accountingService.listAccounts(societyId, { withBalances: true });
    const unmatched = await BankTransaction.aggregate([{ $match: { societyId: new mongoose.Types.ObjectId(societyId), status: 'UNMATCHED' } }, { $group: { _id: '$bankAccountId', count: { $sum: 1 } } }]);
    const unmatchedBy = new Map(unmatched.map((u) => [String(u._id), u.count]));
    return accounts.map((a) => ({ ...a, id: String(a._id), ledgerBalance: (ledger as any[]).find((l) => l.code === a.accountCode)?.balance ?? 0, unmatchedCount: unmatchedBy.get(String(a._id)) ?? 0 }));
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    let accountCode = input.accountCode as string | undefined;
    if (!accountCode) {
      // create a ledger account for the bank automatically (10xx range)
      const existing = await Account.find({ societyId, code: /^10\d\d$/ }).select('code').lean();
      const next = Math.max(1020, ...existing.map((a) => Number(a.code))) + 10;
      accountCode = String(next);
      await accountingService.createAccount(societyId, { code: accountCode, name: input.name, type: 'ASSET', parentCode: null }, byUserId, req);
    } else if (!(await Account.exists({ societyId, code: accountCode, type: 'ASSET' }))) throw Errors.validation({ accountCode: ['Ledger account must be an existing asset account'] });
    if (await BankAccount.exists({ societyId, accountCode })) throw Errors.conflict('A bank account is already linked to that ledger account');
    if (input.isDefault) await BankAccount.updateMany({ societyId }, { $set: { isDefault: false } });
    const doc = await BankAccount.create({ ...input, accountCode, accountNumberMasked: input.accountNumber ? `XXXX${String(input.accountNumber).slice(-4)}` : input.accountNumberMasked, societyId, createdBy: byUserId });
    if (input.openingBalance) {
      await accountingService.createJournal(societyId, { date: input.openingBalanceDate ?? new Date(), narration: `Opening balance - ${doc.name}`, lines: [{ accountCode, debit: input.openingBalance }, { accountCode: '3900', credit: input.openingBalance }], source: 'OPENING', refType: 'BankAccount', refId: doc._id, post: true }, byUserId, req);
    }
    auditService.record({ action: 'accounting.bank_account_created', resource: 'BankAccount', resourceId: doc._id, societyId, newValue: { name: doc.name, kind: doc.kind, accountCode }, req });
    return doc.toJSON();
  }

  async update(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const doc = await BankAccount.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Bank account');
    if (patch.isDefault) await BankAccount.updateMany({ societyId, _id: { $ne: doc._id } }, { $set: { isDefault: false } });
    if (patch.accountNumber) patch.accountNumberMasked = `XXXX${String(patch.accountNumber).slice(-4)}`;
    delete patch.accountNumber;
    delete patch.accountCode;
    doc.set(patch);
    await doc.save();
    auditService.record({ action: 'accounting.bank_account_updated', resource: 'BankAccount', resourceId: doc._id, societyId, newValue: patch, req });
    return doc.toJSON();
  }

  // ------------------------------------------------------------------ statement lines
  private fingerprint(bankAccountId: string, r: { date: Date; amount: number; type: string; reference?: string; description?: string }) {
    return sha256([bankAccountId, dayjs(r.date).format('YYYY-MM-DD'), r.amount.toFixed(2), r.type, (r.reference ?? '').toUpperCase(), (r.description ?? '').toUpperCase().slice(0, 60)].join('|'));
  }

  async importStatement(societyId: string, bankAccountId: string, csv: string, byUserId: string, req?: any) {
    const bank = await BankAccount.findOne({ _id: bankAccountId, societyId });
    if (!bank) throw Errors.notFound('Bank account');
    const { rows, errors } = parseStatementCsv(csv);
    const batch = `${dayjs().format('YYYYMMDD-HHmmss')}`;
    let imported = 0;
    let duplicates = 0;
    for (const r of rows) {
      try {
        await BankTransaction.create({ societyId, bankAccountId: bank._id, date: r.date, description: r.description, reference: r.reference, amount: r.amount, type: r.type, balanceAfter: r.balanceAfter, source: 'IMPORT', importBatch: batch, fingerprint: this.fingerprint(String(bank._id), r) });
        imported += 1;
      } catch (err: any) {
        if (err?.code === 11000) duplicates += 1;
        else errors.push({ line: r.line, message: err?.message ?? 'Failed' });
      }
    }
    const last = rows[rows.length - 1];
    if (last?.balanceAfter != null) {
      bank.lastStatementBalance = last.balanceAfter;
      await bank.save();
    }
    const matched = await this.autoMatch(societyId, String(bank._id), byUserId);
    auditService.record({ action: 'accounting.statement_imported', resource: 'BankAccount', resourceId: bank._id, societyId, metadata: { batch, imported, duplicates, errors: errors.length, autoMatched: matched }, req });
    return { batch, total: rows.length, imported, duplicates, autoMatched: matched, errors };
  }

  async addTransaction(societyId: string, bankAccountId: string, input: { date: Date; description?: string; reference?: string; amount: number; type: 'CREDIT' | 'DEBIT' }, byUserId: string, req?: any) {
    const bank = await BankAccount.findOne({ _id: bankAccountId, societyId });
    if (!bank) throw Errors.notFound('Bank account');
    const txn = await BankTransaction.create({ ...input, societyId, bankAccountId: bank._id, source: 'MANUAL', fingerprint: this.fingerprint(String(bank._id), { ...input, reference: input.reference ?? `manual-${Date.now()}` }) });
    auditService.record({ action: 'accounting.bank_txn_added', resource: 'BankTransaction', resourceId: txn._id, societyId, newValue: input, req });
    return txn.toJSON();
  }

  async listTransactions(societyId: string, query: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId };
    if (query.bankAccountId) filter.bankAccountId = query.bankAccountId;
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.from || query.to) filter.date = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    if (query.search) filter.$or = [{ description: new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { reference: new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
    return paginate(BankTransaction as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-date', allowedSorts: ['date', 'amount', 'status', 'createdAt'] });
  }

  /** Candidate payments / expense payments for a statement line: same amount, same direction, within ±7 days, not yet reconciled; reference match ranks first. */
  async suggestions(societyId: string, txnId: string) {
    const txn = await BankTransaction.findOne({ _id: txnId, societyId }).lean();
    if (!txn) throw Errors.notFound('Bank transaction');
    const from = dayjs(txn.date).subtract(7, 'day').toDate();
    const to = dayjs(txn.date).add(7, 'day').toDate();
    const ref = (txn.reference ?? '').trim();
    if (txn.type === 'CREDIT') {
      const payments = await Payment.find({ societyId, status: 'SUCCESS', reconciled: false, amount: txn.amount, receivedAt: { $gte: from, $lte: to } }).populate('unitId', 'code').limit(10).lean();
      return payments.map((p) => ({ type: 'Payment', id: String(p._id), label: `${p.receiptNumber} · ${(p.unitId as any)?.code ?? ''} · ${p.method}`, amount: p.amount, date: p.receivedAt, reference: p.reference ?? p.providerPaymentId, score: ref && (p.reference === ref || p.providerPaymentId === ref) ? 2 : 1 })).sort((a, b) => b.score - a.score);
    }
    const expenses = await Expense.find({ societyId, 'payments.amount': txn.amount, 'payments.date': { $gte: from, $lte: to } }).populate('vendorId', 'name').limit(10).lean();
    const out: any[] = [];
    for (const e of expenses) for (const p of e.payments) {
      if (p.amount !== txn.amount || p.date < from || p.date > to) continue;
      const alreadyMatched = await BankTransaction.exists({ societyId, matchedType: 'Expense', matchedId: p._id });
      if (alreadyMatched) continue;
      out.push({ type: 'Expense', id: String(p._id), expenseId: String(e._id), label: `${e.expenseNumber} · ${e.vendorName ?? (e.vendorId as any)?.name ?? ''} · ${p.method}`, amount: p.amount, date: p.date, reference: p.reference, score: ref && p.reference === ref ? 2 : 1 });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  async match(societyId: string, txnId: string, target: { type: 'Payment' | 'Expense' | 'JournalEntry'; id: string }, byUserId: string, req?: any) {
    const txn = await BankTransaction.findOne({ _id: txnId, societyId });
    if (!txn) throw Errors.notFound('Bank transaction');
    if (txn.status === 'MATCHED') throw Errors.conflict('Already matched');
    if (target.type === 'Payment') {
      const p = await Payment.findOne({ _id: target.id, societyId, status: 'SUCCESS' });
      if (!p) throw Errors.notFound('Payment');
      if (p.amount !== txn.amount || txn.type !== 'CREDIT') throw Errors.validation({ target: ['Amount or direction does not match the statement line'] });
      p.reconciled = true;
      p.reconciledAt = new Date();
      p.bankTransactionId = txn._id;
      p.bankAccountId = txn.bankAccountId;
      await p.save();
    } else if (target.type === 'Expense') {
      const e = await Expense.findOne({ societyId, 'payments._id': target.id });
      if (!e) throw Errors.notFound('Expense payment');
      const pay = e.payments.find((x) => String(x._id) === target.id)!;
      if (pay.amount !== txn.amount || txn.type !== 'DEBIT') throw Errors.validation({ target: ['Amount or direction does not match the statement line'] });
    } else {
      const j = await JournalEntry.findOne({ _id: target.id, societyId, status: 'POSTED' });
      if (!j) throw Errors.notFound('Journal entry');
    }
    txn.status = 'MATCHED';
    txn.matchedType = target.type;
    txn.matchedId = target.id as any;
    txn.matchedAt = new Date();
    txn.matchedBy = byUserId as any;
    await txn.save();
    await BankAccount.updateOne({ _id: txn.bankAccountId }, { $set: { lastReconciledAt: new Date() } });
    auditService.record({ action: 'accounting.bank_txn_matched', resource: 'BankTransaction', resourceId: txn._id, societyId, newValue: target, req });
    return txn.toJSON();
  }

  async unmatch(societyId: string, txnId: string, req?: any) {
    const txn = await BankTransaction.findOne({ _id: txnId, societyId });
    if (!txn) throw Errors.notFound('Bank transaction');
    if (txn.matchedType === 'Payment' && txn.matchedId) await Payment.updateOne({ _id: txn.matchedId }, { $set: { reconciled: false, reconciledAt: null, bankTransactionId: null } });
    txn.status = 'UNMATCHED';
    txn.matchedType = null;
    txn.matchedId = null;
    await txn.save();
    auditService.record({ action: 'accounting.bank_txn_unmatched', resource: 'BankTransaction', resourceId: txn._id, societyId, req });
    return txn.toJSON();
  }

  async ignore(societyId: string, txnId: string, note: string | undefined, req?: any) {
    const txn = await BankTransaction.findOne({ _id: txnId, societyId });
    if (!txn) throw Errors.notFound('Bank transaction');
    txn.status = txn.status === 'IGNORED' ? 'UNMATCHED' : 'IGNORED';
    if (note) txn.notes = note;
    await txn.save();
    auditService.record({ action: 'accounting.bank_txn_ignored', resource: 'BankTransaction', resourceId: txn._id, societyId, newValue: { status: txn.status, note }, req });
    return txn.toJSON();
  }

  /** Matches statement lines to payments automatically when exactly one candidate has the same amount and reference (or the same amount on the same day). */
  async autoMatch(societyId: string, bankAccountId: string, byUserId: string): Promise<number> {
    const pending = await BankTransaction.find({ societyId, bankAccountId, status: 'UNMATCHED' }).limit(500);
    let matched = 0;
    for (const txn of pending) {
      const cands = await this.suggestions(societyId, String(txn._id));
      const strong = cands.filter((c) => c.score === 2);
      const sameDay = cands.filter((c) => dayjs(c.date).isSame(txn.date, 'day'));
      const pick = strong.length === 1 ? strong[0] : strong.length === 0 && sameDay.length === 1 ? sameDay[0] : null;
      if (!pick) continue;
      try {
        await this.match(societyId, String(txn._id), { type: pick.type as any, id: pick.id }, byUserId);
        matched += 1;
      } catch {
        /* skip ambiguous / invalid */
      }
    }
    return matched;
  }

  async reconciliationSummary(societyId: string, bankAccountId: string) {
    const bank = await BankAccount.findOne({ _id: bankAccountId, societyId }).lean();
    if (!bank) throw Errors.notFound('Bank account');
    const sid = new mongoose.Types.ObjectId(societyId);
    const [byStatus, unreconciledPayments, ledger] = await Promise.all([
      BankTransaction.aggregate([{ $match: { societyId: sid, bankAccountId: bank._id } }, { $group: { _id: { status: '$status', type: '$type' }, count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
      Payment.countDocuments({ societyId, status: 'SUCCESS', reconciled: false, $or: [{ bankAccountId: bank._id }, { bankAccountId: null, method: { $in: bank.paymentMethods } }] }),
      accountingService.generalLedger(societyId, bank.accountCode, {}),
    ]);
    const get = (status: string, type: string) => byStatus.find((b) => b._id.status === status && b._id.type === type) ?? { count: 0, amount: 0 };
    return { bankAccount: { ...bank, id: String(bank._id) }, ledgerBalance: ledger.closingBalance, statementBalance: bank.lastStatementBalance ?? null, difference: bank.lastStatementBalance != null ? round2(bank.lastStatementBalance - ledger.closingBalance) : null, unmatched: { credits: get('UNMATCHED', 'CREDIT'), debits: get('UNMATCHED', 'DEBIT') }, matched: { credits: get('MATCHED', 'CREDIT'), debits: get('MATCHED', 'DEBIT') }, ignored: { credits: get('IGNORED', 'CREDIT'), debits: get('IGNORED', 'DEBIT') }, unreconciledPayments, lastReconciledAt: bank.lastReconciledAt ?? null };
  }
}

export const bankService = new BankService();
