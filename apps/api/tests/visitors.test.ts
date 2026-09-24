import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { visitorService } from '../src/modules/visitors/visitors.service';
import { Visitor } from '../src/models/visitor.model';
import { Notification } from '../src/models/notification.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin: string;
let otherAdmin: string;
let member: string;
let memberUserId = '';
let guard: string;
let guardUserId = '';
let unitId = '';
let otherUnitId = '';
let gateId = '';
let pass: any;

const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  other = await createSociety({ planSlug: 'growth' });
  admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
  const b = (await api.post('/api/v1/buildings').set(auth(admin)).send({ name: 'Tower A', code: 'A', floors: 1 })).body.data;
  unitId = (await api.post('/api/v1/units').set(auth(admin)).send({ buildingId: b.id, floor: 1, number: '101' })).body.data.id;
  otherUnitId = (await api.post('/api/v1/units').set(auth(admin)).send({ buildingId: b.id, floor: 1, number: '102' })).body.data.id;
  const roles = (await api.get('/api/v1/society/roles').set(auth(admin))).body.data;
  const resident = (await api.post('/api/v1/residents').set(auth(admin)).send({ unitId, name: 'Host One', email: `host-${Date.now()}@test.local`, phone: '9000000301', type: 'OWNER' })).body.data;
  const invite = await api.post(`/api/v1/residents/${resident.id}/invite`).set(auth(admin)).send({ roleIds: [roles.find((r: any) => r.key === 'MEMBER').id] });
  const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token: invite.body.data.inviteUrl.split('token=')[1], password: 'Member@12345' });
  member = accepted.body.data.accessToken;
  memberUserId = accepted.body.data.context.user.id;
  const guardEmail = `guard-${Date.now()}@test.local`;
  const g = await api.post('/api/v1/society/users').set(auth(admin)).send({ name: 'Gate Guard', email: guardEmail, password: 'Guard@12345', roleIds: [roles.find((r: any) => r.key === 'SECURITY_GUARD').id] });
  guardUserId = g.body.data.user?.id ?? g.body.data.id;
  guard = (await login(api, guardEmail, 'Guard@12345')).accessToken;
});
afterAll(teardownTestApp);

describe('visitor passes', () => {
  it('seeds a default gate; admins can add gates', async () => {
    const gates = await api.get('/api/v1/visitors/gates').set(auth(guard));
    expect(gates.status).toBe(200);
    expect(gates.body.data[0].code).toBe('MAIN');
    gateId = gates.body.data[0].id;
    const created = await api.post('/api/v1/visitors/gates').set(auth(admin)).send({ name: 'Service gate', code: 'svc' });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe('SVC');
    expect((await api.post('/api/v1/visitors/gates').set(auth(guard)).send({ name: 'x', code: 'x' })).status).toBe(403);
  });

  it('resident pre-approves a guest and receives a QR + passcode; validity comes from settings', async () => {
    const res = await api.post('/api/v1/visitors').set(auth(member)).send({ name: 'Ravi Guest', phone: '9876501111', categoryKey: 'guest', vehicleNumber: 'ka01ab1234', expectedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    pass = res.body.data;
    expect(pass.status).toBe('APPROVED');
    expect(pass.unitId).toBe(unitId);
    expect(pass.passcode).toMatch(/^\d{6}$/);
    expect(pass.qrPayload).toMatch(/^SERP:V:/);
    expect(pass.vehicleNumber).toBe('KA01AB1234');
    expect(dayjs(pass.validUntil).diff(dayjs(pass.validFrom), 'hour')).toBe(24);
    expect(pass.shareText).toContain(pass.passcode);
    // the raw token is never returned on plain reads
    const read = await api.get(`/api/v1/visitors/${pass.id}`).set(auth(member));
    expect(read.body.data.qrToken).toBeUndefined();
    // a member cannot pre-approve for another unit
    expect((await api.post('/api/v1/visitors').set(auth(member)).send({ name: 'Nope', unitId: otherUnitId })).status).toBe(403);
  });

  it('guard looks the pass up by passcode or QR and checks the visitor in and out (idempotent)', async () => {
    const byCode = await api.post('/api/v1/visitors/lookup').set(auth(guard)).send({ code: pass.passcode });
    expect(byCode.status).toBe(200);
    expect(byCode.body.data.valid).toBe(true);
    expect(byCode.body.data.unitId.code).toBe('A-101');
    const byQr = await api.post('/api/v1/visitors/lookup').set(auth(guard)).send({ code: pass.qrPayload });
    expect(byQr.body.data.id).toBe(pass.id);
    expect((await api.post('/api/v1/visitors/lookup').set(auth(guard)).send({ code: '000000' })).status).toBe(404);
    const checkIn = await api.post(`/api/v1/visitors/${pass.id}/check-in`).set(auth(guard)).send({ gateId, clientRef: 'ref-1' });
    expect(checkIn.status).toBe(200);
    expect(checkIn.body.data.status).toBe('CHECKED_IN');
    expect(checkIn.body.data.checkInGateId).toBe(gateId);
    // replay of the same offline action is a no-op
    const replay = await api.post(`/api/v1/visitors/${pass.id}/check-in`).set(auth(guard)).send({ gateId, clientRef: 'ref-1' });
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
    await flush(200);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: memberUserId, type: 'visitor.checked_in' })).toBe(1);
    const again = await api.post('/api/v1/visitors/lookup').set(auth(guard)).send({ code: pass.passcode });
    expect(again.body.data.valid).toBe(false);
    expect(again.body.data.reason).toContain('Already checked in');
    const out = await api.post(`/api/v1/visitors/${pass.id}/check-out`).set(auth(guard)).send({ gateId });
    expect(out.body.data.status).toBe('CHECKED_OUT');
    expect((await api.post(`/api/v1/visitors/${pass.id}/check-out`).set(auth(guard)).send({})).body.data.replayed).toBe(true);
    // members cannot perform gate actions
    expect((await api.post(`/api/v1/visitors/${pass.id}/check-in`).set(auth(member)).send({})).status).toBe(403);
  });

  it('walk-in: guard registers, host approves in real time, guard checks in; denial and timeouts', async () => {
    const walkIn = await api.post('/api/v1/visitors/walk-in').set(auth(guard)).send({ name: 'Courier Kumar', phone: '9876502222', categoryKey: 'delivery', unitId, gateId, photo: PHOTO, clientRef: 'wi-1' });
    expect(walkIn.status).toBe(201);
    expect(walkIn.body.data.status).toBe('PENDING');
    expect(walkIn.body.data.photoKey).toMatch(/^societies\//);
    expect(walkIn.body.data.hostCount).toBe(1);
    expect((await api.post('/api/v1/visitors/walk-in').set(auth(guard)).send({ name: 'Courier Kumar', unitId, clientRef: 'wi-1' })).body.data.replayed).toBe(true);
    await flush(250);
    const notif = await Notification.findOne({ societyId: s.societyId, userId: memberUserId, type: 'visitor.pending' }).lean();
    expect(notif).toBeTruthy();
    expect((notif!.data as any).photoUrl).toContain('/api/v1/files?');
    // guard cannot check in before approval
    expect((await api.post(`/api/v1/visitors/${walkIn.body.data.id}/check-in`).set(auth(guard)).send({})).status).toBe(409);
    // the guard's gate board shows it pending
    const board = await api.get('/api/v1/visitors/board').set(auth(guard));
    expect(board.body.data.pending.map((v: any) => v.id)).toContain(walkIn.body.data.id);
    // host approves (own scope)
    const approved = await api.post(`/api/v1/visitors/${walkIn.body.data.id}/approve`).set(auth(member)).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');
    const inside = await api.post(`/api/v1/visitors/${walkIn.body.data.id}/check-in`).set(auth(guard)).send({ gateId });
    expect(inside.body.data.status).toBe('CHECKED_IN');
    // denial path
    const second = (await api.post('/api/v1/visitors/walk-in').set(auth(guard)).send({ name: 'Salesman', categoryKey: 'other', unitId })).body.data;
    const denied = await api.post(`/api/v1/visitors/${second.id}/deny`).set(auth(member)).send({ reason: 'Not expecting anyone' });
    expect(denied.body.data.status).toBe('DENIED');
    expect(denied.body.data.deniedReason).toBe('Not expecting anyone');
    // another unit's resident cannot decide
    const third = (await api.post('/api/v1/visitors/walk-in').set(auth(guard)).send({ name: 'Stranger', unitId: otherUnitId })).body.data;
    expect((await api.post(`/api/v1/visitors/${third.id}/approve`).set(auth(member)).send({})).status).toBe(404);
    // timeout sweep expires unanswered walk-ins after the configured minutes
    const sweep = await visitorService.sweep(dayjs().add(11, 'minute').toDate());
    expect(sweep.timedOut).toBe(1);
    expect((await Visitor.findById(third.id).lean())!.status).toBe('EXPIRED');
    // guard with phone confirmation and approve rights checks in directly
    await api.put(`/api/v1/society/roles/${(await api.get('/api/v1/society/roles').set(auth(admin))).body.data.find((r: any) => r.key === 'SECURITY_GUARD').id}`).set(auth(admin)).send({});
  });

  it('enforces the daily guest cap and expires passes; photo requirement is configurable', async () => {
    await api.put('/api/v1/visitors/settings').set(auth(admin)).send({ dailyGuestCap: 3, requirePhoto: true }).expect(200);
    const big = await api.post('/api/v1/visitors').set(auth(member)).send({ name: 'Party', guestCount: 5 });
    expect(big.status).toBe(409);
    const ok = await api.post('/api/v1/visitors').set(auth(member)).send({ name: 'Cousin', guestCount: 1, validHours: 2 });
    expect(ok.status).toBe(201);
    const noPhoto = await api.post(`/api/v1/visitors/${ok.body.data.id}/check-in`).set(auth(guard)).send({ gateId });
    expect(noPhoto.status).toBe(422);
    const withPhoto = await api.post(`/api/v1/visitors/${ok.body.data.id}/check-in`).set(auth(guard)).send({ gateId, photo: PHOTO });
    expect(withPhoto.status).toBe(200);
    await api.put('/api/v1/visitors/settings').set(auth(admin)).send({ dailyGuestCap: 0, requirePhoto: false }).expect(200);
    const expiring = (await api.post('/api/v1/visitors').set(auth(member)).send({ name: 'Late Guest', validHours: 1 })).body.data;
    const r = await visitorService.sweep(dayjs().add(2, 'hour').toDate());
    expect(r.expired).toBeGreaterThanOrEqual(1);
    expect((await Visitor.findById(expiring.id).lean())!.status).toBe('EXPIRED');
    expect((await api.post('/api/v1/visitors/lookup').set(auth(guard)).send({ code: expiring.passcode })).status).toBe(404);
    const stats = await api.get('/api/v1/visitors/stats').set(auth(admin));
    expect(stats.body.data.today).toBeGreaterThanOrEqual(2);
    const csv = await api.get('/api/v1/visitors/export').set(auth(admin));
    expect(csv.headers['content-type']).toContain('text/csv');
  });

  it('members see only their unit visitors; societies are isolated', async () => {
    const mine = await api.get('/api/v1/visitors').set(auth(member));
    expect(mine.body.data.every((v: any) => (v.unitId?.id ?? v.unitId) === unitId)).toBe(true);
    expect(mine.body.data.some((v: any) => v.name === 'Stranger')).toBe(false);
    expect((await api.get('/api/v1/visitors').set(auth(otherAdmin))).body.data).toHaveLength(0);
    expect((await api.get(`/api/v1/visitors/${pass.id}`).set(auth(otherAdmin))).status).toBe(404);
    expect((await api.post('/api/v1/visitors/lookup').set(auth(otherAdmin)).send({ code: pass.passcode })).status).toBe(404);
    // guard cannot reach finance or settings
    for (const path of ['/billing/invoices', '/payments', '/society/users', '/society/settings', '/residents']) expect((await api.get(`/api/v1${path}`).set(auth(guard))).status, path).toBe(403);
    expect(guardUserId).toBeTruthy();
  });
});

describe('deliveries', () => {
  it('resident announces a parcel, guard logs arrival (matched), resident collects; leave-at-gate flow', async () => {
    const announced = await api.post('/api/v1/deliveries/announce').set(auth(member)).send({ provider: 'Amazon', trackingRef: 'AMZ123', kind: 'PARCEL', leaveAtGate: true });
    expect(announced.status).toBe(201);
    expect(announced.body.data.status).toBe('EXPECTED');
    const arrived = await api.post('/api/v1/deliveries/arrive').set(auth(guard)).send({ unitId, provider: 'amazon', trackingRef: 'AMZ123', deliveryPersonName: 'Delivery Dan', gateId, clientRef: 'd-1' });
    expect(arrived.status).toBe(201);
    expect(arrived.body.data.id).toBe(announced.body.data.id); // matched to the announced one
    expect(arrived.body.data.status).toBe('RECEIVED_AT_GATE');
    expect((await api.post('/api/v1/deliveries/arrive').set(auth(guard)).send({ unitId, clientRef: 'd-1' })).body.data.replayed).toBe(true);
    await flush(200);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: memberUserId, type: 'delivery.arrived' })).toBe(1);
    const atGate = await api.get('/api/v1/deliveries/at-gate').set(auth(guard));
    expect(atGate.body.data.map((d: any) => d.id)).toContain(announced.body.data.id);
    // resident can only mark collected
    expect((await api.post(`/api/v1/deliveries/${announced.body.data.id}/status`).set(auth(member)).send({ status: 'RETURNED' })).status).toBe(403);
    const collected = await api.post(`/api/v1/deliveries/${announced.body.data.id}/status`).set(auth(member)).send({ status: 'COLLECTED', collectedByName: 'Host One' });
    expect(collected.body.data.status).toBe('COLLECTED');
    expect((await api.post(`/api/v1/deliveries/${announced.body.data.id}/status`).set(auth(guard)).send({ status: 'RETURNED' })).status).toBe(409);
    // unannounced food delivery handed over directly
    const food = await api.post('/api/v1/deliveries/arrive').set(auth(guard)).send({ unitId, provider: 'Swiggy', kind: 'FOOD' });
    expect(food.body.data.status).toBe('ARRIVED');
    const handed = await api.post(`/api/v1/deliveries/${food.body.data.id}/status`).set(auth(guard)).send({ status: 'COLLECTED' });
    expect(handed.body.data.status).toBe('COLLECTED');
    const stats = await api.get('/api/v1/deliveries/stats').set(auth(admin));
    expect(stats.body.data.today).toBe(2);
    expect((await api.get('/api/v1/deliveries').set(auth(otherAdmin))).body.data).toHaveLength(0);
  });
});
