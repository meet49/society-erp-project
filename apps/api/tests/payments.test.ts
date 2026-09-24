import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush, SUPER } from './helpers/app';
import { MockPaymentProvider, platformPaymentProvider } from '../src/core/payments/payment-provider';
import { env } from '../src/config/env';
import { Invoice } from '../src/models/invoice.model';
import { Subscription } from '../src/models/subscription.model';
import { PaymentGatewayConfig } from '../src/models/payment-gateway-config.model';
import { AuditLog } from '../src/models/audit-log.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin: string;
let otherAdmin: string;
let superToken: string;
let memberToken: string;
let units: any[] = [];
let invoices: Record<string, any[]> = {};
const mock = new MockPaymentProvider(env.MOCK_PAYMENT_SECRET);

const period = { periodFrom: dayjs().subtract(1, 'month').startOf('month').toISOString(), periodTo: dayjs().subtract(1, 'month').endOf('month').toISOString() };

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  other = await createSociety({ planSlug: 'growth' });
  admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
  superToken = (await login(api, SUPER.email, SUPER.password)).accessToken;
  const b = (await api.post('/api/v1/buildings').set(auth(admin)).send({ name: 'Tower A', code: 'A', floors: 2 })).body.data;
  for (const number of ['101', '102']) units.push((await api.post('/api/v1/units').set(auth(admin)).send({ buildingId: b.id, floor: 1, number, areaSqft: 1000 })).body.data);
  await api.post('/api/v1/billing/charge-heads').set(auth(admin)).send({ name: 'Maintenance', code: 'MAINT', type: 'FIXED', amount: 1000 });
  await api.post('/api/v1/billing/charge-heads').set(auth(admin)).send({ name: 'Sinking', code: 'SINK', type: 'FIXED', amount: 500 });
  // two months of invoices per unit (older first)
  for (const p of [{ periodFrom: dayjs().subtract(2, 'month').startOf('month').toISOString(), periodTo: dayjs().subtract(2, 'month').endOf('month').toISOString(), dueDate: dayjs().subtract(20, 'day').toISOString() }, { ...period, dueDate: dayjs().add(10, 'day').toISOString() }]) {
    await api.post('/api/v1/billing/runs').set(auth(admin)).send({ ...p, issueImmediately: true });
  }
  for (const u of units) invoices[u.id] = (await api.get(`/api/v1/billing/invoices?unitId=${u.id}&sort=dueDate`).set(auth(admin))).body.data;
  // member login on unit 102
  const roles = (await api.get('/api/v1/society/roles').set(auth(admin))).body.data;
  const memberRole = roles.find((r: any) => r.key === 'MEMBER').id;
  const resident = (await api.post('/api/v1/residents').set(auth(admin)).send({ unitId: units[1].id, name: 'Payer', email: `payer-${Date.now()}@test.local`, phone: '9000000202', type: 'OWNER' })).body.data;
  const invite = await api.post(`/api/v1/residents/${resident.id}/invite`).set(auth(admin)).send({ roleIds: [memberRole] });
  const token = invite.body.data.inviteUrl.split('token=')[1];
  memberToken = (await api.post('/api/v1/auth/invitations/accept').send({ token, password: 'Member@12345' })).body.data.accessToken;
});
afterAll(teardownTestApp);

describe('offline payments & allocation', () => {
  it('allocates FIFO by due date, supports partial payments and keeps the leftover as advance', async () => {
    const unitId = units[0].id;
    const [older, newer] = invoices[unitId];
    expect(older.total).toBe(1500);
    // partial on the oldest
    const p1 = await api.post('/api/v1/payments').set(auth(admin)).send({ unitId, amount: 500, method: 'CASH' });
    expect(p1.status).toBe(201);
    expect(p1.body.data.receiptNumber).toMatch(/^RCP\/\d{4}-\d{2}\/00001$/);
    expect(p1.body.data.allocations).toEqual([expect.objectContaining({ invoiceNumber: older.invoiceNumber, amount: 500 })]);
    expect((await Invoice.findById(older.id).lean())!.status).toBe('PARTIALLY_PAID');
    // pays the remainder of the older one, then part of the newer, leftover becomes advance
    const p2 = await api.post('/api/v1/payments').set(auth(admin)).send({ unitId, amount: 3000, method: 'BANK_TRANSFER', reference: 'NEFT-42' });
    expect(p2.body.data.allocations.map((a: any) => a.amount)).toEqual([1000, 1500]);
    expect(p2.body.data.unallocatedAmount).toBe(500);
    expect((await Invoice.findById(older.id).lean())!.status).toBe('PAID');
    expect((await Invoice.findById(newer.id).lean())!.status).toBe('PAID');
    const balance = await api.get(`/api/v1/billing/units/${unitId}/balance`).set(auth(admin));
    expect(balance.body.data.balance).toBe(-500); // credit balance = advance
    const receipt = await api.get(`/api/v1/payments/${p2.body.data.id}/receipt`).set(auth(admin));
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.society.name).toBeTruthy();
    expect(receipt.body.data.invoices).toHaveLength(2);
    await flush(100);
  });

  it('rejects allocations to invoices of another unit and respects the partial-payment setting', async () => {
    const wrong = await api.post('/api/v1/payments').set(auth(admin)).send({ unitId: units[1].id, amount: 100, method: 'CASH', invoiceIds: [invoices[units[0].id][0].id] });
    expect(wrong.status).toBe(422);
    await api.put('/api/v1/society/settings/payments.config').set(auth(admin)).send({ value: { allowPartialPayments: false } });
    const partial = await api.post('/api/v1/payments').set(auth(admin)).send({ unitId: units[1].id, amount: 100, method: 'CASH', invoiceIds: [invoices[units[1].id][0].id] });
    expect(partial.status).toBe(409);
    await api.put('/api/v1/society/settings/payments.config').set(auth(admin)).send({ value: { allowPartialPayments: true } });
  });

  it('members see only their own payments; admins can reconcile and export', async () => {
    const mine = await api.get('/api/v1/payments').set(auth(memberToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(0);
    const all = await api.get('/api/v1/payments').set(auth(admin));
    expect(all.body.data).toHaveLength(2);
    expect((await api.get(`/api/v1/payments/${all.body.data[0].id}`).set(auth(memberToken))).status).toBe(404);
    expect((await api.post('/api/v1/payments').set(auth(memberToken)).send({ unitId: units[1].id, amount: 10, method: 'CASH' })).status).toBe(403);
    const rec = await api.post(`/api/v1/payments/${all.body.data[0].id}/reconcile`).set(auth(admin)).send({ reconciled: true, note: 'Bank stmt line 12' });
    expect(rec.body.data.reconciled).toBe(true);
    const csv = await api.get('/api/v1/payments/export').set(auth(admin));
    expect(csv.headers['content-type']).toContain('text/csv');
    const stats = await api.get('/api/v1/payments/stats').set(auth(admin));
    expect(stats.body.data.collectedThisMonth).toBe(3500);
  });
});

describe('online payments (server-verified)', () => {
  it('refuses to create orders until the gateway is configured, and never exposes secrets', async () => {
    const off = await api.post('/api/v1/payments/orders').set(auth(memberToken)).send({});
    expect(off.status).toBe(400);
    expect(off.body.code).toBe('FEATURE_DISABLED');
    const cfg = await api.put('/api/v1/payments/gateway').set(auth(admin)).send({ provider: 'mock', enabled: true, keyId: 'mock_key_123456', keySecret: env.MOCK_PAYMENT_SECRET, webhookSecret: env.MOCK_PAYMENT_SECRET, testMode: true });
    expect(cfg.status).toBe(200);
    expect(cfg.body.data.hasKeySecret).toBe(true);
    expect(JSON.stringify(cfg.body)).not.toContain(env.MOCK_PAYMENT_SECRET);
    const stored = await PaymentGatewayConfig.findOne({ societyId: s.societyId }).select('+keySecretEncrypted').lean();
    expect(stored!.keySecretEncrypted).not.toContain(env.MOCK_PAYMENT_SECRET);
    const pub = await api.get('/api/v1/payments/gateway/public').set(auth(memberToken));
    expect(pub.body.data.enabled).toBe(true);
    expect(pub.body.data).not.toHaveProperty('keySecret');
    expect((await api.get('/api/v1/payments/gateway').set(auth(memberToken))).status).toBe(403);
    // razorpay needs credentials to be enabled
    expect((await api.put('/api/v1/payments/gateway').set(auth(admin)).send({ provider: 'razorpay', enabled: true, keyId: '' })).status).toBe(422);
  });

  it('member pays own dues: order → signed verification → payment recorded; bad signatures are rejected and audited', async () => {
    const unitId = units[1].id;
    const order = await api.post('/api/v1/payments/orders').set(auth(memberToken)).send({});
    expect(order.status).toBe(201);
    expect(order.body.data.amount).toBe(3000);
    expect(order.body.data.unitId).toBe(unitId);
    expect(order.body.data.invoiceIds).toHaveLength(2);
    // forged callback
    const bad = await api.post(`/api/v1/payments/orders/${order.body.data.orderId}/verify`).set(auth(memberToken)).send({ paymentId: 'pay_fake', signature: 'deadbeef'.repeat(4) });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('PAYMENT_VERIFICATION_FAILED');
    expect(await AuditLog.countDocuments({ societyId: s.societyId, action: 'payment.verification_failed' })).toBe(1);
    expect((await Invoice.findById(invoices[unitId][0].id).lean())!.status).not.toBe('PAID');
    // genuine callback (signed with the gateway secret)
    const signature = mock.sign(order.body.data.providerOrderId, 'pay_ok_1');
    const good = await api.post(`/api/v1/payments/orders/${order.body.data.orderId}/verify`).set(auth(memberToken)).send({ paymentId: 'pay_ok_1', signature });
    expect(good.status).toBe(200);
    expect(good.body.data.payment.signatureVerified).toBe(true);
    expect(good.body.data.payment.method).toBe('ONLINE');
    expect(good.body.data.payment.allocations).toHaveLength(2);
    expect((await Invoice.findById(invoices[unitId][0].id).lean())!.status).toBe('PAID');
    // replaying the callback is idempotent
    const again = await api.post(`/api/v1/payments/orders/${order.body.data.orderId}/verify`).set(auth(memberToken)).send({ paymentId: 'pay_ok_1', signature });
    expect(again.status).toBe(200);
    expect(again.body.data.alreadyProcessed).toBe(true);
    expect((await api.get('/api/v1/payments').set(auth(memberToken))).body.data).toHaveLength(1);
    // another member cannot verify someone else's order
    expect((await api.post(`/api/v1/payments/orders/${order.body.data.orderId}/verify`).set(auth(otherAdmin)).send({ paymentId: 'pay_other', signature })).status).toBe(404);
    // no more dues → no order
    expect((await api.post('/api/v1/payments/orders').set(auth(memberToken)).send({})).status).toBe(409);
    const adv = await api.post('/api/v1/payments/orders').set(auth(memberToken)).send({ amount: 250 });
    expect(adv.status).toBe(201);
    expect(adv.body.data.purpose).toBe('ADVANCE');
  });

  it('webhooks are signature-checked and idempotent', async () => {
    // create a fresh order for unit 101 as admin (advance)
    const order = (await api.post('/api/v1/payments/orders').set(auth(admin)).send({ unitId: units[0].id, amount: 700 })).body.data;
    const payload = { id: 'evt_1', event: 'payment.captured', orderId: order.providerOrderId, paymentId: 'pay_wh_1', amount: 700 };
    const raw = JSON.stringify(payload);
    const url = `/api/v1/webhooks/payments/mock/${s.societyId}`;
    const unsigned = await api.post(url).set('Content-Type', 'application/json').send(raw);
    expect(unsigned.status).toBe(401);
    expect(unsigned.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    const signed = await api.post(url).set('Content-Type', 'application/json').set('x-webhook-signature', mock.signWebhook(raw)).send(raw);
    expect(signed.status).toBe(200);
    expect(signed.body.status).toBe('PROCESSED');
    const payments = await api.get(`/api/v1/payments?unitId=${units[0].id}&provider=mock`).set(auth(admin));
    expect(payments.body.data).toHaveLength(1);
    expect(payments.body.data[0].unallocatedAmount).toBe(700);
    // same event id replayed → duplicate, nothing recorded twice
    const replay = await api.post(url).set('Content-Type', 'application/json').set('x-webhook-signature', mock.signWebhook(raw)).send(raw);
    expect(replay.body.status).toBe('DUPLICATE');
    expect((await api.get(`/api/v1/payments?unitId=${units[0].id}&provider=mock`).set(auth(admin))).body.data).toHaveLength(1);
    // wrong society in the URL → unknown gateway
    expect((await api.post(`/api/v1/webhooks/payments/mock/${other.societyId}`).set('Content-Type', 'application/json').set('x-webhook-signature', mock.signWebhook(raw)).send(raw)).status).toBe(404);
    // failed event flips the order
    const failed = { id: 'evt_2', event: 'payment.failed', orderId: order.providerOrderId, paymentId: 'pay_wh_2' };
    const rawF = JSON.stringify(failed);
    await api.post(url).set('Content-Type', 'application/json').set('x-webhook-signature', mock.signWebhook(rawF)).send(rawF).expect(200);
  });

  it('refunds reverse allocations, post to the ledger and cannot be repeated', async () => {
    const unitId = units[1].id;
    const online = (await api.get(`/api/v1/payments?unitId=${unitId}`).set(auth(admin))).body.data.find((p: any) => p.method === 'ONLINE');
    const tooMuch = await api.post(`/api/v1/payments/${online.id}/refund`).set(auth(admin)).send({ amount: 99999, reason: 'oops' });
    expect(tooMuch.status).toBe(422);
    const partial = await api.post(`/api/v1/payments/${online.id}/refund`).set(auth(admin)).send({ amount: 1000, reason: 'Double charged' });
    expect(partial.status).toBe(200);
    expect(partial.body.data.refund.amount).toBe(1000);
    expect(partial.body.data.refund.providerRefundId).toContain('rfnd_mock');
    expect(partial.body.data.status).toBe('SUCCESS');
    // the newest invoice got 1000 reversed
    const newest = await Invoice.findById(invoices[unitId][1].id).lean();
    expect(newest!.status).toBe('PARTIALLY_PAID');
    expect(newest!.balanceDue).toBe(1000);
    const balance = await api.get(`/api/v1/billing/units/${unitId}/balance`).set(auth(admin));
    expect(balance.body.data.balance).toBe(1000);
    expect((await api.post(`/api/v1/payments/${online.id}/refund`).set(auth(admin)).send({ amount: 10, reason: 'again' })).status).toBe(409);
    expect((await api.post(`/api/v1/payments/${online.id}/refund`).set(auth(memberToken)).send({ reason: 'me' })).status).toBe(403);
    expect((await api.post(`/api/v1/payments/${online.id}/refund`).set(auth(otherAdmin)).send({ reason: 'nope' })).status).toBe(404);
  });
});

describe('subscription payments to the platform', () => {
  it('society pays for its plan online (mock gateway) and the subscription activates; offline recording by the platform team', async () => {
    const quote = await api.get('/api/v1/society/subscription/pay/quote').set(auth(admin));
    expect(quote.status).toBe(200);
    expect(quote.body.data.amount).toBeGreaterThan(0);
    const order = await api.post('/api/v1/society/subscription/pay/order').set(auth(admin)).send({ billingCycle: 'ANNUAL' });
    expect(order.status).toBe(201);
    expect(order.body.data.free).toBe(false);
    expect(order.body.data.billingCycle).toBe('ANNUAL');
    const bad = await api.post(`/api/v1/society/subscription/pay/order/${order.body.data.orderId}/verify`).set(auth(admin)).send({ paymentId: 'pay_sub_x', signature: 'ff'.repeat(16) });
    expect(bad.status).toBe(400);
    expect((await Subscription.findOne({ societyId: s.societyId }).lean())!.status).toBe('TRIALING');
    const signature = (platformPaymentProvider as MockPaymentProvider).sign(order.body.data.providerOrderId, 'pay_sub_1');
    const ok = await api.post(`/api/v1/society/subscription/pay/order/${order.body.data.orderId}/verify`).set(auth(admin)).send({ paymentId: 'pay_sub_1', signature });
    expect(ok.status).toBe(200);
    expect(ok.body.data.subscription.status).toBe('ACTIVE');
    expect(ok.body.data.subscription.billingCycle).toBe('ANNUAL');
    expect(ok.body.data.payment.status).toBe('SUCCESS');
    expect(ok.body.data.payment.receiptNumber).toMatch(/^PR\//);
    const history = await api.get('/api/v1/society/subscription/pay/history').set(auth(admin));
    expect(history.body.data).toHaveLength(1);
    // members cannot pay the subscription
    expect((await api.post('/api/v1/society/subscription/pay/order').set(auth(memberToken)).send({})).status).toBe(403);
    // platform lists it and can record an offline payment for another society
    const list = await api.get('/api/v1/platform/payments?status=SUCCESS').set(auth(superToken));
    expect(list.body.data.some((p: any) => p.providerPaymentId === 'pay_sub_1')).toBe(true);
    const offline = await api.post('/api/v1/platform/payments/record').set(auth(superToken)).send({ societyId: other.societyId, amount: 4999, method: 'BANK_TRANSFER', reference: 'NEFT-77' });
    expect(offline.status).toBe(201);
    expect((await Subscription.findOne({ societyId: other.societyId }).lean())!.status).toBe('ACTIVE');
    expect((await api.post('/api/v1/platform/payments/record').set(auth(admin)).send({ societyId: other.societyId, amount: 1, method: 'CASH' })).status).toBe(403);
  });
});
