import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { JournalEntry } from '../src/models/journal-entry.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin: string;
let otherAdmin: string;
let unitId = '';
let invoice: any;
let payment: any;
let bankAccounts: any[] = [];

const period = { periodFrom: dayjs().subtract(1, 'month').startOf('month').toISOString(), periodTo: dayjs().subtract(1, 'month').endOf('month').toISOString() };

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  other = await createSociety({ planSlug: 'growth' });
  admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
  const b = (await api.post('/api/v1/buildings').set(auth(admin)).send({ name: 'Tower A', code: 'A', floors: 1 })).body.data;
  unitId = (await api.post('/api/v1/units').set(auth(admin)).send({ buildingId: b.id, floor: 1, number: '101', areaSqft: 1000 })).body.data.id;
  await api.post('/api/v1/billing/charge-heads').set(auth(admin)).send({ name: 'Maintenance', code: 'MAINT', type: 'FIXED', amount: 3000, ledgerAccountCode: '4100' });
  await api.post('/api/v1/billing/charge-heads').set(auth(admin)).send({ name: 'Sinking fund', code: 'SINK', type: 'FIXED', amount: 500, ledgerAccountCode: '4110', fundKey: 'SINKING' });
});
afterAll(teardownTestApp);

describe('chart of accounts & automatic postings', () => {
  it('seeds a default chart of accounts, funds and bank accounts for a new society', async () => {
    const accounts = await api.get('/api/v1/accounting/accounts').set(auth(admin));
    expect(accounts.status).toBe(200);
    expect(accounts.body.data.length).toBeGreaterThan(30);
    expect(accounts.body.data.find((a: any) => a.code === '1200').systemKey).toBe('RECEIVABLES');
    const funds = await api.get('/api/v1/accounting/funds').set(auth(admin));
    expect(funds.body.data.map((f: any) => f.key)).toEqual(expect.arrayContaining(['SINKING', 'CORPUS']));
    bankAccounts = (await api.get('/api/v1/accounting/bank-accounts').set(auth(admin))).body.data;
    expect(bankAccounts.some((b: any) => b.kind === 'CASH')).toBe(true);
    expect(bankAccounts.some((b: any) => b.isDefault)).toBe(true);
  });

  it('posts a balanced journal when an invoice is issued and when a payment is received', async () => {
    const run = await api.post('/api/v1/billing/runs').set(auth(admin)).send({ ...period, issueImmediately: true });
    expect(run.status).toBe(201);
    await flush(200);
    invoice = (await api.get('/api/v1/billing/invoices').set(auth(admin))).body.data[0];
    const je = await JournalEntry.findOne({ societyId: s.societyId, refType: 'Invoice', refId: invoice.id }).lean();
    expect(je).toBeTruthy();
    expect(je!.status).toBe('POSTED');
    expect(je!.totalDebit).toBe(3500);
    expect(je!.lines.find((l) => l.accountCode === '1200')!.debit).toBe(3500);
    expect(je!.lines.find((l) => l.accountCode === '4100')!.credit).toBe(3000);
    expect(je!.lines.find((l) => l.accountCode === '4110')!.fundKey).toBe('SINKING');
    // payment: cash box debit, receivables credit; advance goes to member advances
    payment = (await api.post('/api/v1/payments').set(auth(admin)).send({ unitId, amount: 4000, method: 'CASH' })).body.data;
    await flush(200);
    const pj = await JournalEntry.findOne({ societyId: s.societyId, refType: 'Payment', refId: payment.id }).lean();
    expect(pj).toBeTruthy();
    expect(pj!.lines.find((l) => l.accountCode === '1000')!.debit).toBe(4000);
    expect(pj!.lines.find((l) => l.accountCode === '1200')!.credit).toBe(3500);
    expect(pj!.lines.find((l) => l.accountCode === '2010')!.credit).toBe(500);
    const funds = await api.get('/api/v1/accounting/funds').set(auth(admin));
    expect(funds.body.data.find((f: any) => f.key === 'SINKING').contributions).toBe(500);
  });

  it('produces a balanced trial balance, income statement and balance sheet', async () => {
    const tb = await api.get('/api/v1/accounting/reports/trial-balance').set(auth(admin));
    expect(tb.status).toBe(200);
    expect(tb.body.data.totalDebit).toBe(tb.body.data.totalCredit);
    const pl = await api.get(`/api/v1/accounting/reports/income-expenditure?from=${dayjs().subtract(2, 'month').toISOString()}`).set(auth(admin));
    expect(pl.body.data.totalIncome).toBe(3500);
    expect(pl.body.data.surplus).toBe(3500);
    const bs = await api.get('/api/v1/accounting/reports/balance-sheet').set(auth(admin));
    expect(bs.body.data.totalAssets).toBe(4000); // cash 4000, receivables 0
    expect(bs.body.data.difference).toBe(0);
    const gl = await api.get('/api/v1/accounting/reports/general-ledger/1200').set(auth(admin));
    expect(gl.body.data.rows).toHaveLength(2);
    expect(gl.body.data.closingBalance).toBe(0);
    const aging = await api.get('/api/v1/accounting/reports/receivables-aging').set(auth(admin));
    expect(aging.body.data.grandTotal).toBe(0);
    const summary = await api.get('/api/v1/accounting/summary').set(auth(admin));
    expect(summary.body.data.cashAndBank).toBe(4000);
    const csv = await api.get('/api/v1/accounting/reports/trial-balance/export').set(auth(admin));
    expect(csv.headers['content-type']).toContain('text/csv');
  });

  it('validates manual journals, posts and reverses them', async () => {
    const unbalanced = await api.post('/api/v1/accounting/journals').set(auth(admin)).send({ date: new Date().toISOString(), narration: 'Oops', lines: [{ accountCode: '5100', debit: 100 }, { accountCode: '1000', credit: 90 }] });
    expect(unbalanced.status).toBe(422);
    expect(unbalanced.body.fields.lines[0]).toContain('not balanced');
    const unknown = await api.post('/api/v1/accounting/journals').set(auth(admin)).send({ date: new Date().toISOString(), narration: 'Bad account', lines: [{ accountCode: '9999', debit: 100 }, { accountCode: '1000', credit: 100 }] });
    expect(unknown.status).toBe(422);
    const draft = await api.post('/api/v1/accounting/journals').set(auth(admin)).send({ date: new Date().toISOString(), narration: 'Stationery bought with cash', lines: [{ accountCode: '5100', debit: 250 }, { accountCode: '1000', credit: 250 }] });
    expect(draft.status).toBe(201);
    expect(draft.body.data.status).toBe('DRAFT');
    expect(draft.body.data.entryNumber).toMatch(/^JV\//);
    const posted = await api.post(`/api/v1/accounting/journals/${draft.body.data.id}/post`).set(auth(admin));
    expect(posted.body.data.status).toBe('POSTED');
    expect((await api.patch(`/api/v1/accounting/journals/${draft.body.data.id}`).set(auth(admin)).send({ narration: 'changed narration' })).status).toBe(409);
    const reversed = await api.post(`/api/v1/accounting/journals/${draft.body.data.id}/reverse`).set(auth(admin)).send({ reason: 'Entered twice' });
    expect(reversed.status).toBe(200);
    expect(reversed.body.data.lines.find((l: any) => l.accountCode === '1000').debit).toBe(250);
    expect((await api.get(`/api/v1/accounting/journals/${draft.body.data.id}`).set(auth(admin))).body.data.status).toBe('REVERSED');
    const cash = await api.get('/api/v1/accounting/reports/general-ledger/1000').set(auth(admin));
    expect(cash.body.data.closingBalance).toBe(4000);
  });

  it('cancelling an invoice reverses its journal automatically', async () => {
    const adhoc = await api.post('/api/v1/billing/invoices').set(auth(admin)).send({ unitId, lineItems: [{ description: 'NOC fee', amount: 1000 }], issueImmediately: true });
    await flush(200);
    expect(await JournalEntry.countDocuments({ societyId: s.societyId, refType: 'Invoice', refId: adhoc.body.data.id, status: 'POSTED' })).toBe(1);
    await api.post(`/api/v1/billing/invoices/${adhoc.body.data.id}/cancel`).set(auth(admin)).send({ reason: 'Raised in error' }).expect(200);
    await flush(200);
    const entries = await JournalEntry.find({ societyId: s.societyId, refType: 'Invoice', refId: adhoc.body.data.id }).lean();
    expect(entries.map((e) => e.status).sort()).toEqual(['POSTED', 'REVERSED']);
    const pl = await api.get(`/api/v1/accounting/reports/income-expenditure?from=${dayjs().subtract(2, 'month').toISOString()}`).set(auth(admin));
    expect(pl.body.data.totalIncome).toBe(3500);
  });
});

describe('bank reconciliation', () => {
  it('imports a statement, deduplicates, matches a payment and reports the reconciliation status', async () => {
    const cashBox = bankAccounts.find((b: any) => b.kind === 'CASH');
    const bank = bankAccounts.find((b: any) => b.isDefault);
    // a cheque payment lands in the bank
    const cheque = (await api.post('/api/v1/payments').set(auth(admin)).send({ unitId, amount: 1500, method: 'CHEQUE', reference: 'CHQ-778', receivedAt: dayjs().subtract(2, 'day').toISOString() })).body.data;
    const csv = `Date,Narration,Chq/Ref No,Withdrawal,Deposit,Balance\n${dayjs().subtract(2, 'day').format('DD/MM/YYYY')},CLG CHQ 778,CHQ-778,,1500.00,51500.00\n${dayjs().subtract(1, 'day').format('DD/MM/YYYY')},BANK CHARGES,,59.00,,51441.00\n`;
    const imp = await api.post(`/api/v1/accounting/bank-accounts/${bank.id}/statement`).set(auth(admin)).send({ csv });
    expect(imp.status).toBe(200);
    expect(imp.body.data.imported).toBe(2);
    expect(imp.body.data.autoMatched).toBe(1);
    const again = await api.post(`/api/v1/accounting/bank-accounts/${bank.id}/statement`).set(auth(admin)).send({ csv });
    expect(again.body.data.duplicates).toBe(2);
    const txns = await api.get(`/api/v1/accounting/bank-transactions?bankAccountId=${bank.id}`).set(auth(admin));
    expect(txns.body.data).toHaveLength(2);
    const matched = txns.body.data.find((t: any) => t.status === 'MATCHED');
    expect(matched.matchedId).toBe(cheque.id);
    expect((await api.get(`/api/v1/payments/${cheque.id}`).set(auth(admin))).body.data.reconciled).toBe(true);
    const unmatched = txns.body.data.find((t: any) => t.status === 'UNMATCHED');
    expect((await api.get(`/api/v1/accounting/bank-transactions/${unmatched.id}/suggestions`).set(auth(admin))).body.data).toHaveLength(0);
    const ignored = await api.post(`/api/v1/accounting/bank-transactions/${unmatched.id}/ignore`).set(auth(admin)).send({ note: 'Bank charges booked separately' });
    expect(ignored.body.data.status).toBe('IGNORED');
    const summary = await api.get(`/api/v1/accounting/bank-accounts/${bank.id}/reconciliation`).set(auth(admin));
    expect(summary.body.data.matched.credits.count).toBe(1);
    expect(summary.body.data.statementBalance).toBe(51441);
    expect(cashBox).toBeTruthy();
    // unmatch restores the payment
    await api.post(`/api/v1/accounting/bank-transactions/${matched.id}/unmatch`).set(auth(admin)).expect(200);
    expect((await api.get(`/api/v1/payments/${cheque.id}`).set(auth(admin))).body.data.reconciled).toBe(false);
  });

  it('creates a bank account with an opening balance journal', async () => {
    const created = await api.post('/api/v1/accounting/bank-accounts').set(auth(admin)).send({ name: 'FD account', kind: 'BANK', bankName: 'SBI', accountNumber: '12345678901234', ifsc: 'SBIN0001234', openingBalance: 100000 });
    expect(created.status).toBe(201);
    expect(created.body.data.accountNumberMasked).toBe('XXXX1234');
    expect(created.body.data.accountCode).toMatch(/^10\d\d$/);
    const gl = await api.get(`/api/v1/accounting/reports/general-ledger/${created.body.data.accountCode}`).set(auth(admin));
    expect(gl.body.data.closingBalance).toBe(100000);
  });
});

describe('accounting tenant isolation & permissions', () => {
  it('keeps journals, accounts and bank data per society', async () => {
    expect((await api.get('/api/v1/accounting/journals').set(auth(otherAdmin))).body.data).toHaveLength(0);
    expect((await api.get('/api/v1/accounting/reports/trial-balance').set(auth(otherAdmin))).body.data.totalDebit).toBe(0);
    const mine = (await api.get('/api/v1/accounting/journals').set(auth(admin))).body.data[0];
    expect((await api.get(`/api/v1/accounting/journals/${mine.id}`).set(auth(otherAdmin))).status).toBe(404);
    expect((await api.post(`/api/v1/accounting/journals/${mine.id}/reverse`).set(auth(otherAdmin)).send({ reason: 'nope' })).status).toBe(404);
    expect((await api.get(`/api/v1/accounting/bank-transactions?bankAccountId=${bankAccounts[0].id}`).set(auth(otherAdmin))).body.data).toHaveLength(0);
  });
});
