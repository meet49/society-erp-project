import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { JournalEntry } from '../src/models/journal-entry.model';
import { Notification } from '../src/models/notification.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin: string;
let committee: string;
let committeeUserId = '';
let otherAdmin: string;
let vendorId = '';
let roles: any[] = [];

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  other = await createSociety({ planSlug: 'growth' });
  admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
  roles = (await api.get('/api/v1/society/roles').set(auth(admin))).body.data;
  const committeeRole = roles.find((r) => r.key === 'COMMITTEE').id;
  const email = `committee-${Date.now()}@test.local`;
  const created = await api.post('/api/v1/society/users').set(auth(admin)).send({ name: 'Committee Member', email, password: 'Committee@123', roleIds: [committeeRole] });
  committeeUserId = created.body.data.user?.id ?? created.body.data.id;
  committee = (await login(api, email, 'Committee@123')).accessToken;
});
afterAll(teardownTestApp);

describe('vendors', () => {
  it('creates, lists and masks vendor bank details', async () => {
    const res = await api.post('/api/v1/vendors').set(auth(admin)).send({ name: 'Sparkle Housekeeping', categoryKey: 'housekeeping', contactName: 'Ravi', phone: '9876543210', email: 'ops@sparkle.example', gstin: '29ABCDE1234F1Z5', bank: { accountHolder: 'Sparkle Services', accountNumber: '50100123456789', ifsc: 'HDFC0000123' }, paymentTermsDays: 15 });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE'); // vendor approval workflow is inactive by default
    expect(res.body.data.bank.accountNumberMasked).toBe('XXXX6789');
    expect(JSON.stringify(res.body)).not.toContain('50100123456789');
    vendorId = res.body.data.id;
    const list = await api.get('/api/v1/vendors?search=sparkle').set(auth(admin));
    expect(list.body.data).toHaveLength(1);
    expect((await api.get('/api/v1/vendors/options').set(auth(admin))).body.data[0].name).toBe('Sparkle Housekeeping');
    expect((await api.get(`/api/v1/vendors/${vendorId}`).set(auth(otherAdmin))).status).toBe(404);
  });
});

describe('expense approval workflow', () => {
  it('auto-approves small expenses per the default workflow rule and posts the payable journal', async () => {
    const res = await api.post('/api/v1/expenses').set(auth(admin)).send({ title: 'Light bulbs', vendorId, categoryKey: 'electrical', amount: 1200, taxRate: 18, billDate: new Date().toISOString(), submit: true });
    expect(res.status).toBe(201);
    expect(res.body.data.approvalStatus).toBe('APPROVED');
    expect(res.body.data.total).toBe(1416);
    expect(res.body.data.expenseNumber).toMatch(/^EXP\//);
    await flush(200);
    const je = await JournalEntry.findOne({ societyId: s.societyId, refType: 'Expense', refId: res.body.data.id }).lean();
    expect(je!.lines.find((l) => l.accountCode === '2000')!.credit).toBe(1416);
    expect(je!.lines.find((l) => l.accountCode === '5100')!.debit).toBe(1416);
  });

  it('routes larger expenses to the committee, notifies approvers and finalises on decision', async () => {
    const res = await api.post('/api/v1/expenses').set(auth(admin)).send({ title: 'Monthly housekeeping', vendorId, categoryKey: 'housekeeping', amount: 18000, billDate: new Date().toISOString(), submit: true });
    expect(res.status).toBe(201);
    expect(res.body.data.approvalStatus).toBe('PENDING');
    const expenseId = res.body.data.id;
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: committeeUserId, type: 'expense.approval_requested' })).toBe(1);
    // admin is not a committee member: cannot decide the committee step directly
    const notApprover = await api.post(`/api/v1/expenses/${expenseId}/approve`).set(auth(admin)).send({});
    expect(notApprover.status).toBe(403);
    // committee sees it in the approvals inbox and approves
    const inbox = await api.get('/api/v1/approvals').set(auth(committee));
    expect(inbox.body.data.map((i: any) => String(i.entityId))).toContain(expenseId);
    // committee role lacks expenses:approve by default? then use the generic approvals endpoint
    const decided = await api.post(`/api/v1/approvals/${inbox.body.data[0].id}/decide`).set(auth(committee)).send({ decision: 'APPROVED', note: 'Looks fine' });
    expect(decided.status).toBe(200);
    expect(decided.body.data.status).toBe('APPROVED');
    await flush(300);
    const after = await api.get(`/api/v1/expenses/${expenseId}`).set(auth(admin));
    expect(after.body.data.approvalStatus).toBe('APPROVED');
    expect(after.body.data.workflow.status).toBe('APPROVED');
    expect(after.body.data.accountCode).toBe('5110'); // housekeeping category → ledger mapping
    expect((await api.get('/api/v1/approvals').set(auth(committee))).body.data).toHaveLength(0);
  });

  it('needs a second (admin) step for very large expenses and supports rejection', async () => {
    const res = await api.post('/api/v1/expenses').set(auth(admin)).send({ title: 'Lift modernisation', vendorId, categoryKey: 'lift', amount: 250000, submit: true });
    const expenseId = res.body.data.id;
    expect(res.body.data.approvalStatus).toBe('PENDING');
    let inbox = (await api.get('/api/v1/approvals').set(auth(committee))).body.data;
    await api.post(`/api/v1/approvals/${inbox[0].id}/decide`).set(auth(committee)).send({ decision: 'APPROVED' }).expect(200);
    await flush(200);
    // still pending: second step waits on the society admin
    expect((await api.get(`/api/v1/expenses/${expenseId}`).set(auth(admin))).body.data.approvalStatus).toBe('PENDING');
    inbox = (await api.get('/api/v1/approvals').set(auth(admin))).body.data;
    expect(inbox.map((i: any) => String(i.entityId))).toContain(expenseId);
    const rejected = await api.post(`/api/v1/expenses/${expenseId}/reject`).set(auth(admin)).send({ reason: 'Get three quotes first' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.approvalStatus).toBe('REJECTED');
    expect(rejected.body.data.rejectionReason).toBe('Get three quotes first');
    // edit + resubmit restarts the workflow
    const edited = await api.patch(`/api/v1/expenses/${expenseId}`).set(auth(admin)).send({ amount: 40000 });
    expect(edited.body.data.approvalStatus).toBe('DRAFT');
    const resubmitted = await api.post(`/api/v1/expenses/${expenseId}/submit`).set(auth(admin));
    expect(resubmitted.body.data.approvalStatus).toBe('PENDING');
    const withdrawn = await api.post(`/api/v1/expenses/${expenseId}/withdraw`).set(auth(admin));
    expect(withdrawn.body.data.approvalStatus).toBe('DRAFT');
  });

  it('records expense payments (partial then full) and posts them against the bank', async () => {
    const approved = (await api.get('/api/v1/expenses?approvalStatus=APPROVED&search=housekeeping').set(auth(admin))).body.data[0];
    const tooMuch = await api.post(`/api/v1/expenses/${approved.id}/payments`).set(auth(admin)).send({ amount: 99999, method: 'BANK_TRANSFER' });
    expect(tooMuch.status).toBe(422);
    const part = await api.post(`/api/v1/expenses/${approved.id}/payments`).set(auth(admin)).send({ amount: 8000, method: 'BANK_TRANSFER', reference: 'NEFT-1' });
    expect(part.status).toBe(201);
    expect(part.body.data.paymentStatus).toBe('PARTIAL');
    const rest = await api.post(`/api/v1/expenses/${approved.id}/payments`).set(auth(admin)).send({ amount: 10000, method: 'CHEQUE', reference: 'CHQ-9' });
    expect(rest.body.data.paymentStatus).toBe('PAID');
    await flush(300);
    const journals = await JournalEntry.find({ societyId: s.societyId, refType: 'ExpensePayment' }).lean();
    expect(journals).toHaveLength(2);
    expect(journals.every((j) => j.lines.find((l) => l.accountCode === '2000')!.debit > 0 && j.lines.find((l) => l.accountCode === '1010')!.credit > 0)).toBe(true);
    const stats = await api.get('/api/v1/expenses/stats').set(auth(admin));
    expect(stats.body.data.payable.count).toBe(1); // only the auto-approved bulbs expense remains unpaid
    const csv = await api.get('/api/v1/expenses/export').set(auth(admin));
    expect(csv.headers['content-type']).toContain('text/csv');
  });

  it('workflow definitions are editable per society and drive routing', async () => {
    const list = await api.get('/api/v1/society/workflows').set(auth(admin));
    expect(list.body.data.map((w: any) => w.key)).toContain('expense_approval');
    const upd = await api.put('/api/v1/society/workflows/expense_approval').set(auth(admin)).send({ autoApproveCondition: { field: 'amount', operator: 'lt', value: 100000 } });
    expect(upd.status).toBe(200);
    const res = await api.post('/api/v1/expenses').set(auth(admin)).send({ title: 'Garden supplies', amount: 60000, submit: true });
    expect(res.body.data.approvalStatus).toBe('APPROVED');
    const bad = await api.put('/api/v1/society/workflows/expense_approval').set(auth(admin)).send({ steps: [{ name: 'Ghost', approverType: 'ROLE', approverRef: 'NOPE' }] });
    expect(bad.status).toBe(422);
    expect((await api.get('/api/v1/society/workflows').set(auth(otherAdmin))).body.data.find((w: any) => w.key === 'expense_approval').autoApproveCondition.value).toBe(2000);
  });
});

describe('purchase orders', () => {
  it('runs PR → approval → order → receipt → expense', async () => {
    const po = await api.post('/api/v1/expenses/purchase-orders').set(auth(admin)).send({ title: 'CCTV cameras', vendorId, categoryKey: 'security', items: [{ description: '4MP dome camera', quantity: 4, rate: 3500, taxRate: 18 }, { description: 'Installation', quantity: 1, rate: 2000 }], quotes: [{ vendorName: 'Sparkle', amount: 18520, selected: true }, { vendorName: 'Other', amount: 20000 }], submit: true });
    expect(po.status).toBe(201);
    expect(po.body.data.total).toBe(18520);
    expect(po.body.data.status).toBe('PENDING_APPROVAL');
    const inbox = (await api.get('/api/v1/approvals?entityType=PurchaseOrder').set(auth(committee))).body.data;
    expect(inbox).toHaveLength(1);
    await api.post(`/api/v1/approvals/${inbox[0].id}/decide`).set(auth(committee)).send({ decision: 'APPROVED' }).expect(200);
    await flush(200);
    expect((await api.get(`/api/v1/expenses/purchase-orders/${po.body.data.id}`).set(auth(admin))).body.data.status).toBe('APPROVED');
    await api.post(`/api/v1/expenses/purchase-orders/${po.body.data.id}/order`).set(auth(admin)).expect(200);
    const items = (await api.get(`/api/v1/expenses/purchase-orders/${po.body.data.id}`).set(auth(admin))).body.data.items;
    const partial = await api.post(`/api/v1/expenses/purchase-orders/${po.body.data.id}/receive`).set(auth(admin)).send({ items: [{ itemId: items[0].id ?? items[0]._id, receivedQuantity: 2 }] });
    expect(partial.body.data.status).toBe('PARTIALLY_RECEIVED');
    const full = await api.post(`/api/v1/expenses/purchase-orders/${po.body.data.id}/receive`).set(auth(admin)).send({ items: [{ itemId: items[0].id ?? items[0]._id, receivedQuantity: 2 }, { itemId: items[1].id ?? items[1]._id, receivedQuantity: 1 }] });
    expect(full.body.data.status).toBe('RECEIVED');
    const converted = await api.post(`/api/v1/expenses/purchase-orders/${po.body.data.id}/convert`).set(auth(admin)).send({ billNumber: 'INV-CCTV-1' });
    expect(converted.status).toBe(201);
    expect(converted.body.data.expense.approvalStatus).toBe('APPROVED');
    expect(converted.body.data.expense.total).toBe(18520);
    expect(converted.body.data.purchaseOrder.status).toBe('CLOSED');
    expect((await api.post(`/api/v1/expenses/purchase-orders/${po.body.data.id}/convert`).set(auth(admin)).send({})).status).toBe(409);
    expect((await api.get(`/api/v1/expenses/purchase-orders/${po.body.data.id}`).set(auth(otherAdmin))).status).toBe(404);
  });
});
