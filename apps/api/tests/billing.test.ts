import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { billingService } from '../src/modules/billing/billing.service';
import { Invoice } from '../src/models/invoice.model';
import { Notification } from '../src/models/notification.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin: string;
let otherAdmin: string;
let units: any[] = [];
let heads: Record<string, any> = {};
let run: any;
let memberToken: string;
let memberUnitId: string;

const period = { periodFrom: dayjs().subtract(1, 'month').startOf('month').toISOString(), periodTo: dayjs().subtract(1, 'month').endOf('month').toISOString() };

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  other = await createSociety({ planSlug: 'growth' });
  admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
  const b = (await api.post('/api/v1/buildings').set(auth(admin)).send({ name: 'Tower A', code: 'A', floors: 2 })).body.data;
  for (const [number, areaSqft, type] of [['101', 1000, 'FLAT'], ['102', 1500, 'FLAT'], ['G1', 400, 'SHOP']] as const) {
    units.push((await api.post('/api/v1/units').set(auth(admin)).send({ buildingId: b.id, floor: 1, number, areaSqft, type })).body.data);
  }
  // a member with a login on unit 102
  const roles = (await api.get('/api/v1/society/roles').set(auth(admin))).body.data;
  const memberRole = roles.find((r: any) => r.key === 'MEMBER').id;
  const resident = (await api.post('/api/v1/residents').set(auth(admin)).send({ unitId: units[1].id, name: 'Member Bill', email: `bill-${Date.now()}@test.local`, phone: '9000000102', type: 'OWNER' })).body.data;
  const invite = await api.post(`/api/v1/residents/${resident.id}/invite`).set(auth(admin)).send({ roleIds: [memberRole] });
  const token = invite.body.data.inviteUrl.split('token=')[1];
  const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token, password: 'Member@12345' });
  memberToken = accepted.body.data.accessToken;
  memberUnitId = units[1].id;
});
afterAll(teardownTestApp);

describe('billing configuration & charge heads', () => {
  it('exposes DB-driven billing config and lets admins change it', async () => {
    const cfg = await api.get('/api/v1/billing/config').set(auth(admin));
    expect(cfg.status).toBe(200);
    expect(cfg.body.data.invoicePrefix).toBe('INV');
    const upd = await api.put('/api/v1/billing/config').set(auth(admin)).send({ dueDay: 15, penalty: { type: 'PERCENT', value: 2, applyAfterDays: 0, maxAmount: 500 }, gracePeriodDays: 0, notifyOnIssue: true });
    expect(upd.status).toBe(200);
    expect(upd.body.data.dueDay).toBe(15);
    expect(upd.body.data.penalty.type).toBe('PERCENT');
    expect(upd.body.data.invoicePrefix).toBe('INV'); // merged, not replaced
  });

  it('creates charge heads of each type and validates formulas', async () => {
    const create = (body: any) => api.post('/api/v1/billing/charge-heads').set(auth(admin)).send(body);
    heads.maint = (await create({ name: 'Maintenance', code: 'maint', type: 'AREA_BASED', rate: 2 })).body.data;
    heads.sink = (await create({ name: 'Sinking fund', code: 'SINK', type: 'FIXED', amount: 500, fundKey: 'sinking' })).body.data;
    heads.water = (await create({ name: 'Water', code: 'WATER', type: 'METER_BASED', rate: 10, amount: 50, meterType: 'water' })).body.data;
    heads.formula = (await create({ name: 'Lift', code: 'LIFT', type: 'FORMULA', formula: 'max(100, floor * 50)' })).body.data;
    heads.noc = (await create({ name: 'Non-occupancy', code: 'NOC', type: 'PERCENTAGE', rate: 10, applicableUnitTypes: ['SHOP'] })).body.data;
    expect(heads.maint.code).toBe('MAINT');
    expect(heads.water.meterType).toBe('WATER');
    const bad = await create({ name: 'Bad', code: 'BAD', type: 'FORMULA', formula: 'area * unknownVar' });
    expect(bad.status).toBe(422);
    expect(bad.body.fields.formula[0]).toContain('Unknown variable');
    const dup = await create({ name: 'Dup', code: 'MAINT', type: 'FIXED', amount: 1 });
    expect(dup.status).toBe(409);
    const noMeter = await create({ name: 'Gas', code: 'GAS', type: 'METER_BASED', rate: 5 });
    expect(noMeter.status).toBe(422);
    const test = await api.post('/api/v1/billing/config/formula-test').set(auth(admin)).send({ formula: 'area * 2 + 100', vars: { area: 500 } });
    expect(test.body.data.result).toBe(1100);
  });

  it('records meter readings (manual, bulk, csv) and rejects readings lower than the previous one', async () => {
    const r1 = await api.post('/api/v1/billing/meters').set(auth(admin)).send({ unitId: units[0].id, meterType: 'water', currentReading: 120, previousReading: 100, readingDate: period.periodTo });
    expect(r1.status).toBe(201);
    expect(r1.body.data.consumption).toBe(20);
    const lower = await api.post('/api/v1/billing/meters').set(auth(admin)).send({ unitId: units[0].id, meterType: 'water', currentReading: 110 });
    expect(lower.status).toBe(422);
    const csv = `unitCode,meterType,currentReading,readingDate\nA-102,WATER,35,${dayjs(period.periodTo).format('YYYY-MM-DD')}\nZZ-999,WATER,10,\n`;
    const imp = await api.post('/api/v1/billing/meters/import').set(auth(admin)).send({ csv });
    expect(imp.status).toBe(200);
    expect(imp.body.data.saved).toBe(1);
    expect(imp.body.data.failed).toBe(1);
    expect(imp.body.data.results.find((r: any) => r.unitCode === 'ZZ-999').error).toContain('Unknown unit');
    const list = await api.get('/api/v1/billing/meters?billed=false').set(auth(admin));
    expect(list.body.data).toHaveLength(2);
    const types = await api.get('/api/v1/billing/meters/types').set(auth(admin));
    expect(types.body.data).toEqual(['WATER']);
  });
});

describe('billing runs & invoices', () => {
  it('previews and generates a run with per-unit line items, then issues it (ledger + notifications)', async () => {
    const preview = await api.post('/api/v1/billing/runs/preview').set(auth(admin)).send(period);
    expect(preview.status).toBe(200);
    expect(preview.body.data.count).toBe(3);
    const u101 = preview.body.data.invoices.find((i: any) => i.unitCode === 'A-101');
    // 1000 sqft × 2 = 2000, sink 500, water 50 + 10×20 = 250, lift max(100, 50) = 100 → 2850
    expect(u101.subtotal).toBe(2850);
    const shop = preview.body.data.invoices.find((i: any) => i.unitCode === 'A-G1');
    // 400×2 = 800 + 500 + lift 100 (no water reading → only fixed 50) = 1450 ; NOC 10% of 1450 = 145
    expect(shop.items.find((i: any) => i.code === 'NOC').amount).toBe(145);
    expect(shop.subtotal).toBe(1595);

    const created = await api.post('/api/v1/billing/runs').set(auth(admin)).send(period);
    expect(created.status).toBe(201);
    run = created.body.data;
    expect(run.status).toBe('DRAFT');
    expect(run.invoiceCount).toBe(3);
    const drafts = await api.get(`/api/v1/billing/invoices?billingRunId=${run.id}`).set(auth(admin));
    expect(drafts.body.data.every((i: any) => i.status === 'DRAFT')).toBe(true);
    expect(drafts.body.data[0].invoiceNumber).toMatch(/^INV\/\d{4}-\d{2}\/\d{5}$/);

    // duplicate generation for the same period skips already-invoiced units
    const again = await api.post('/api/v1/billing/runs').set(auth(admin)).send(period);
    expect(again.body.data.invoiceCount).toBe(0);
    expect(again.body.data.skipped).toHaveLength(3);

    const issued = await api.post(`/api/v1/billing/runs/${run.id}/issue`).set(auth(admin));
    expect(issued.status).toBe(200);
    expect(issued.body.data.status).toBe('ISSUED');
    const ledger = await api.get(`/api/v1/billing/units/${units[0].id}/ledger`).set(auth(admin));
    expect(ledger.body.data.entries).toHaveLength(1);
    expect(ledger.body.data.entries[0].debit).toBe(2850);
    expect(ledger.body.data.closingBalance).toBe(2850);
    const balance = await api.get(`/api/v1/billing/units/${units[0].id}/balance`).set(auth(admin));
    expect(balance.body.data.balance).toBe(2850);
    // meter readings are marked billed
    const unbilled = await api.get('/api/v1/billing/meters?billed=false').set(auth(admin));
    expect(unbilled.body.data).toHaveLength(0);
    await flush(150);
    const notif = await Notification.findOne({ societyId: s.societyId, type: 'invoice.created' }).lean();
    expect(notif).toBeTruthy();
  });

  it('members only see their own unit bills (own scope) and cannot read others', async () => {
    const mine = await api.get('/api/v1/billing/invoices').set(auth(memberToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].unitId.id).toBe(memberUnitId);
    const otherInvoice = (await api.get(`/api/v1/billing/invoices?unitId=${units[0].id}`).set(auth(admin))).body.data[0];
    expect((await api.get(`/api/v1/billing/invoices/${otherInvoice.id}`).set(auth(memberToken))).status).toBe(404);
    expect((await api.get(`/api/v1/billing/units/${units[0].id}/ledger`).set(auth(memberToken))).status).toBe(404);
    expect((await api.get(`/api/v1/billing/units/${memberUnitId}/ledger`).set(auth(memberToken))).status).toBe(200);
    // members cannot configure billing or generate runs
    expect((await api.post('/api/v1/billing/runs').set(auth(memberToken)).send(period)).status).toBe(403);
    expect((await api.get('/api/v1/billing/stats').set(auth(memberToken))).status).toBe(403);
  });

  it('creates, edits, issues and cancels an ad-hoc invoice', async () => {
    const created = await api.post('/api/v1/billing/invoices').set(auth(admin)).send({ unitId: units[0].id, lineItems: [{ description: 'Move-in charges', amount: 1000, taxRate: 18 }], discount: { amount: 100, reason: 'Goodwill' } });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('DRAFT');
    expect(created.body.data.total).toBe(1080); // 1000 + 180 tax − 100
    const edited = await api.patch(`/api/v1/billing/invoices/${created.body.data.id}`).set(auth(admin)).send({ lineItems: [{ description: 'Move-in charges', amount: 2000 }] });
    expect(edited.body.data.total).toBe(1900);
    const issued = await api.post(`/api/v1/billing/invoices/${created.body.data.id}/issue`).set(auth(admin));
    expect(issued.body.data.status).toBe('ISSUED');
    expect((await api.patch(`/api/v1/billing/invoices/${created.body.data.id}`).set(auth(admin)).send({ notes: 'x' })).status).toBe(409);
    const cancelled = await api.post(`/api/v1/billing/invoices/${created.body.data.id}/cancel`).set(auth(admin)).send({ reason: 'Raised in error' });
    expect(cancelled.body.data.status).toBe('CANCELLED');
    const balance = await api.get(`/api/v1/billing/units/${units[0].id}/balance`).set(auth(admin));
    expect(balance.body.data.balance).toBe(2850); // cancelled invoice removed from the ledger
  });

  it('marks invoices overdue after the grace period, applies the configured penalty once and sends reminders', async () => {
    const before = await Invoice.findOne({ societyId: s.societyId, unitId: units[0].id, status: 'ISSUED' }).lean();
    expect(before).toBeTruthy();
    const dueDate = dayjs(before!.dueDate);
    const result = await billingService.processOverdue(dueDate.add(3, 'day').toDate());
    expect(result.overdue).toBeGreaterThanOrEqual(3);
    expect(result.penalties).toBeGreaterThanOrEqual(3);
    const after = await Invoice.findById(before!._id).lean();
    expect(after!.status).toBe('OVERDUE');
    expect(after!.penalty).toBe(57); // 2% of 2850
    expect(after!.total).toBe(2907);
    expect(after!.balanceDue).toBe(2907);
    // idempotent: running again applies nothing new
    const second = await billingService.processOverdue(dueDate.add(4, 'day').toDate());
    expect(second.penalties).toBe(0);
    expect((await Invoice.findById(before!._id).lean())!.penalty).toBe(57);
    const ledger = await api.get(`/api/v1/billing/units/${units[0].id}/ledger`).set(auth(admin));
    expect(ledger.body.data.entries.some((e: any) => e.type === 'DEBIT_NOTE' && e.debit === 57)).toBe(true);
    const stats = await api.get('/api/v1/billing/stats').set(auth(admin));
    expect(stats.body.data.overdueCount).toBe(3);
    // manual reminder for an open invoice
    const remind = await api.post(`/api/v1/billing/invoices/${before!._id}/remind`).set(auth(admin));
    expect(remind.status).toBe(200);
  });

  it('exports invoices as CSV and blocks cancelling a run that has payments', async () => {
    const csv = await api.get('/api/v1/billing/export').set(auth(admin));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n').length).toBeGreaterThan(3);
    // pay one invoice, then the run cannot be cancelled
    const pay = await api.post('/api/v1/payments').set(auth(admin)).send({ unitId: units[2].id, amount: 100, method: 'CASH' });
    expect(pay.status).toBe(201);
    const cancel = await api.post(`/api/v1/billing/runs/${run.id}/cancel`).set(auth(admin)).send({ reason: 'test' });
    expect(cancel.status).toBe(409);
  });
});

describe('billing tenant isolation', () => {
  it('never leaks invoices, runs, charge heads or ledgers across societies', async () => {
    expect((await api.get('/api/v1/billing/charge-heads').set(auth(otherAdmin))).body.data).toHaveLength(0);
    expect((await api.get('/api/v1/billing/invoices').set(auth(otherAdmin))).body.data).toHaveLength(0);
    expect((await api.get(`/api/v1/billing/runs/${run.id}`).set(auth(otherAdmin))).status).toBe(404);
    expect((await api.post(`/api/v1/billing/runs/${run.id}/issue`).set(auth(otherAdmin))).status).toBe(404);
    expect((await api.get(`/api/v1/billing/units/${units[0].id}/ledger`).set(auth(otherAdmin))).status).toBe(404);
    expect((await api.patch(`/api/v1/billing/charge-heads/${heads.maint.id}`).set(auth(otherAdmin)).send({ amount: 1 })).status).toBe(404);
    // a client-supplied societyId is ignored
    const forged = await api.get(`/api/v1/billing/invoices?societyId=${s.societyId}`).set(auth(otherAdmin));
    expect(forged.body.data).toHaveLength(0);
  });

  it('is blocked when the billing module is disabled for the society', async () => {
    await api.patch('/api/v1/society/modules/payments').set(auth(admin)).send({ enabled: false });
    const off = await api.patch('/api/v1/society/modules/billing').set(auth(admin)).send({ enabled: false });
    expect(off.status).toBe(200);
    const res = await api.get('/api/v1/billing/invoices').set(auth(admin));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MODULE_DISABLED');
    await api.patch('/api/v1/society/modules/billing').set(auth(admin)).send({ enabled: true });
    await api.patch('/api/v1/society/modules/payments').set(auth(admin)).send({ enabled: true });
    expect((await api.get('/api/v1/billing/invoices').set(auth(admin))).status).toBe(200);
  });
});
