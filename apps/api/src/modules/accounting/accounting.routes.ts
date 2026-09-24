import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, noContent, paged } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { auditService } from '../../core/audit/audit.service';
import { accountingService } from './accounting.service';
import { bankService } from './bank.service';
import { accountCreateSchema, accountListQuerySchema, accountUpdateSchema, asOfQuerySchema, bankAccountCreateSchema, bankAccountUpdateSchema, bankTxnListQuerySchema, bankTxnSchema, fundSchema, ignoreSchema, journalCreateSchema, journalListQuerySchema, journalUpdateSchema, ledgerParamSchema, matchSchema, periodQuerySchema, reverseSchema, statementImportSchema } from './accounting.schemas';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const period = (q: any) => ({ from: q.from ?? dayjs().startOf('month').toDate(), to: q.to ?? new Date() });
const sendCsv = (res: any, name: string, rows: Record<string, unknown>[]) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send(toCsv(rows));
};

export const accountingRouter = Router();
accountingRouter.use(authenticate, requireSociety, requireModule('accounting'), requireSubscription());

// ---- overview & reports
accountingRouter.get('/summary', authorizePermission('accounting:view'), asyncHandler(async (req, res) => ok(res, await accountingService.summary(sid(req)))));
accountingRouter.get('/trend', authorizePermission('accounting:view'), asyncHandler(async (req, res) => ok(res, await accountingService.trend(sid(req), Number(req.query.months) || 6))));
accountingRouter.get('/reports/trial-balance', authorizePermission('accounting:view'), validate(asOfQuerySchema, 'query'), asyncHandler(async (req, res) => ok(res, await accountingService.trialBalance(sid(req), (req.query as any).asOf))));
accountingRouter.get('/reports/income-expenditure', authorizePermission('accounting:view'), validate(periodQuerySchema, 'query'), asyncHandler(async (req, res) => { const p = period(req.query); ok(res, await accountingService.incomeExpenditure(sid(req), p.from, p.to)); }));
accountingRouter.get('/reports/balance-sheet', authorizePermission('accounting:view'), validate(asOfQuerySchema, 'query'), asyncHandler(async (req, res) => ok(res, await accountingService.balanceSheet(sid(req), (req.query as any).asOf ?? new Date()))));
accountingRouter.get('/reports/receivables-aging', authorizePermission('accounting:view'), validate(asOfQuerySchema, 'query'), asyncHandler(async (req, res) => ok(res, await accountingService.receivablesAging(sid(req), (req.query as any).asOf ?? new Date()))));
accountingRouter.get('/reports/day-book', authorizePermission('accounting:view'), validate(periodQuerySchema, 'query'), asyncHandler(async (req, res) => { const p = period(req.query); ok(res, await accountingService.dayBook(sid(req), p.from, p.to)); }));
accountingRouter.get('/reports/general-ledger/:code', authorizePermission('accounting:view'), validate(ledgerParamSchema, 'params'), validate(periodQuerySchema, 'query'), asyncHandler(async (req, res) => ok(res, await accountingService.generalLedger(sid(req), req.params.code, req.query as any))));
accountingRouter.get(
  '/reports/:report/export',
  authorizePermission('accounting:export'),
  validate(z.object({ report: z.enum(['trial-balance', 'income-expenditure', 'balance-sheet', 'receivables-aging', 'day-book']) }), 'params'),
  validate(periodQuerySchema.merge(asOfQuerySchema), 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const report = req.params.report;
    let rows: Record<string, unknown>[] = [];
    if (report === 'trial-balance') rows = (await accountingService.trialBalance(sid(req), q.asOf)).rows;
    else if (report === 'income-expenditure') { const p = period(q); const r = await accountingService.incomeExpenditure(sid(req), p.from, p.to); rows = [...r.income.map((x) => ({ section: 'Income', ...x })), ...r.expense.map((x) => ({ section: 'Expense', ...x })), { section: 'Surplus', code: '', name: 'Surplus / (deficit)', amount: r.surplus }]; }
    else if (report === 'balance-sheet') { const r = await accountingService.balanceSheet(sid(req), q.asOf ?? new Date()); rows = [...r.assets.map((x) => ({ section: 'Assets', ...x })), ...r.liabilities.map((x) => ({ section: 'Liabilities', ...x })), ...r.equity.map((x) => ({ section: 'Funds & equity', ...x })), { section: 'Funds & equity', code: '', name: 'Accumulated surplus', amount: r.accumulatedSurplus }]; }
    else if (report === 'receivables-aging') rows = (await accountingService.receivablesAging(sid(req), q.asOf ?? new Date())).rows;
    else { const p = period(q); rows = (await accountingService.dayBook(sid(req), p.from, p.to)).flatMap((e: any) => e.lines.map((l: any) => ({ entryNumber: e.entryNumber, date: dayjs(e.date).format('YYYY-MM-DD'), narration: e.narration, account: `${l.accountCode} ${l.accountName ?? ''}`, debit: l.debit, credit: l.credit, ref: e.refNumber ?? '' }))); }
    auditService.record({ action: 'accounting.report_exported', resource: 'Report', resourceId: report, societyId: sid(req), metadata: { rows: rows.length }, req });
    sendCsv(res, report, rows);
  }),
);

// ---- chart of accounts & funds
accountingRouter.get('/accounts', authorizePermission('accounting:view'), validate(accountListQuerySchema, 'query'), asyncHandler(async (req, res) => { const q = req.query as any; ok(res, await accountingService.listAccounts(sid(req), { includeInactive: q.includeInactive === 'true', withBalances: q.withBalances === 'true', asOf: q.asOf })); }));
accountingRouter.post('/accounts', authorizePermission('accounting:configure'), validate(accountCreateSchema), asyncHandler(async (req, res) => created(res, await accountingService.createAccount(sid(req), req.body, uid(req), req))));
accountingRouter.patch('/accounts/:id', authorizePermission('accounting:configure'), validate(idParamSchema, 'params'), validate(accountUpdateSchema), asyncHandler(async (req, res) => ok(res, await accountingService.updateAccount(sid(req), req.params.id, req.body, req))));
accountingRouter.delete('/accounts/:id', authorizePermission('accounting:configure'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await accountingService.deleteAccount(sid(req), req.params.id, req); noContent(res); }));
accountingRouter.get('/funds', authorizePermission('accounting:view'), asyncHandler(async (req, res) => ok(res, await accountingService.listFunds(sid(req)))));
accountingRouter.put('/funds', authorizePermission('accounting:configure'), validate(fundSchema), asyncHandler(async (req, res) => ok(res, await accountingService.upsertFund(sid(req), req.body, uid(req), req))));

// ---- journals
accountingRouter.get('/journals', authorizePermission('accounting:view'), validate(journalListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await accountingService.listJournals(sid(req), req.query as any))));
accountingRouter.post('/journals', authorizePermission('accounting:create'), validate(journalCreateSchema), asyncHandler(async (req, res) => { const post = req.body.post && req.tenant!.permissions.has('accounting:post'); created(res, (await accountingService.createJournal(sid(req), { ...req.body, post, source: 'MANUAL' }, uid(req), req)).toJSON()); }));
accountingRouter.get('/journals/:id', authorizePermission('accounting:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await accountingService.getJournal(sid(req), req.params.id))));
accountingRouter.patch('/journals/:id', authorizePermission('accounting:update'), validate(idParamSchema, 'params'), validate(journalUpdateSchema), asyncHandler(async (req, res) => ok(res, await accountingService.updateJournal(sid(req), req.params.id, req.body, req))));
accountingRouter.delete('/journals/:id', authorizePermission('accounting:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await accountingService.deleteDraft(sid(req), req.params.id, req); noContent(res); }));
accountingRouter.post('/journals/:id/post', authorizePermission('accounting:post'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await accountingService.postJournal(sid(req), req.params.id, uid(req), req))));
accountingRouter.post('/journals/:id/reverse', authorizePermission('accounting:reverse'), validate(idParamSchema, 'params'), validate(reverseSchema), asyncHandler(async (req, res) => ok(res, (await accountingService.reverseJournal(sid(req), req.params.id, uid(req), req.body.reason, req, req.body.date)).toJSON())));

// ---- bank accounts & reconciliation
accountingRouter.get('/bank-accounts', authorizePermission('accounting:view', 'accounting:reconcile', 'accounting:configure', 'expenses:pay', 'payments:create'), asyncHandler(async (req, res) => ok(res, await bankService.list(sid(req)))));
accountingRouter.post('/bank-accounts', authorizePermission('accounting:configure'), validate(bankAccountCreateSchema), asyncHandler(async (req, res) => created(res, await bankService.create(sid(req), req.body, uid(req), req))));
accountingRouter.patch('/bank-accounts/:id', authorizePermission('accounting:configure'), validate(idParamSchema, 'params'), validate(bankAccountUpdateSchema), asyncHandler(async (req, res) => ok(res, await bankService.update(sid(req), req.params.id, req.body, req))));
accountingRouter.get('/bank-accounts/:id/reconciliation', authorizePermission('accounting:reconcile', 'accounting:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await bankService.reconciliationSummary(sid(req), req.params.id))));
accountingRouter.post('/bank-accounts/:id/statement', authorizePermission('accounting:reconcile'), validate(idParamSchema, 'params'), validate(statementImportSchema), asyncHandler(async (req, res) => ok(res, await bankService.importStatement(sid(req), req.params.id, req.body.csv, uid(req), req))));
accountingRouter.post('/bank-accounts/:id/transactions', authorizePermission('accounting:reconcile'), validate(idParamSchema, 'params'), validate(bankTxnSchema), asyncHandler(async (req, res) => created(res, await bankService.addTransaction(sid(req), req.params.id, req.body, uid(req), req))));
accountingRouter.post('/bank-accounts/:id/auto-match', authorizePermission('accounting:reconcile'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, { matched: await bankService.autoMatch(sid(req), req.params.id, uid(req)) })));
accountingRouter.get('/bank-transactions', authorizePermission('accounting:reconcile', 'accounting:view'), validate(bankTxnListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await bankService.listTransactions(sid(req), req.query as any))));
accountingRouter.get('/bank-transactions/:id/suggestions', authorizePermission('accounting:reconcile'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await bankService.suggestions(sid(req), req.params.id))));
accountingRouter.post('/bank-transactions/:id/match', authorizePermission('accounting:reconcile'), validate(idParamSchema, 'params'), validate(matchSchema), asyncHandler(async (req, res) => ok(res, await bankService.match(sid(req), req.params.id, req.body, uid(req), req))));
accountingRouter.post('/bank-transactions/:id/unmatch', authorizePermission('accounting:reconcile'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await bankService.unmatch(sid(req), req.params.id, req))));
accountingRouter.post('/bank-transactions/:id/ignore', authorizePermission('accounting:reconcile'), validate(idParamSchema, 'params'), validate(ignoreSchema), asyncHandler(async (req, res) => ok(res, await bankService.ignore(sid(req), req.params.id, req.body.note, req))));
