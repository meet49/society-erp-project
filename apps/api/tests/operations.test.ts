import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { staffService } from '../src/modules/operations/staff.service';
import { Notification } from '../src/models/notification.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin = '';
let adminUserId = '';
let otherAdmin = '';
let guard = '';
let m1 = '';
let m1UserId = '';
let m2 = '';
let unitA = '';
let unitB = '';
const post = (path: string, token: string, body: Record<string, unknown>) => api.post(`/api/v1${path}`).set(auth(token)).send(body);
const get = (path: string, token: string) => api.get(`/api/v1${path}`).set(auth(token));
const today = dayjs().format('YYYY-MM-DD');

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  other = await createSociety({ planSlug: 'growth' });
  const a = await login(api, s.adminEmail, s.adminPassword);
  admin = a.accessToken;
  adminUserId = a.context.user.id;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
  const b = (await post('/buildings', admin, { name: 'Tower A', code: 'A', floors: 1 })).body.data;
  unitA = (await post('/units', admin, { buildingId: b.id, floor: 1, number: '101' })).body.data.id;
  unitB = (await post('/units', admin, { buildingId: b.id, floor: 1, number: '102' })).body.data.id;
  const roles = (await get('/society/roles', admin)).body.data;
  const memberRole = roles.find((r: any) => r.key === 'MEMBER').id;
  for (const [unitId, name] of [[unitA, 'Asha'], [unitB, 'Bharat']] as const) {
    const resident = (await post('/residents', admin, { unitId, name: `${name} Member`, email: `${name.toLowerCase()}-${Date.now()}@test.local`, phone: `9200${Math.floor(Math.random() * 900000) + 100000}`, type: 'OWNER' })).body.data;
    const invite = await post(`/residents/${resident.id}/invite`, admin, { roleIds: [memberRole] });
    const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token: invite.body.data.inviteUrl.split('token=')[1], password: 'Member@12345' });
    if (name === 'Asha') { m1 = accepted.body.data.accessToken; m1UserId = accepted.body.data.context.user.id; } else m2 = accepted.body.data.accessToken;
  }
  const guardEmail = `guard-${Date.now()}@test.local`;
  await post('/society/users', admin, { name: 'Gate Guard', email: guardEmail, password: 'Guard@12345', roleIds: [roles.find((r: any) => r.key === 'SECURITY_GUARD').id] });
  guard = (await login(api, guardEmail, 'Guard@12345')).accessToken;
});
afterAll(teardownTestApp);

describe('staff & attendance', () => {
  let staffId = '';
  it('creates staff with masked sensitive fields, marks attendance, punches at the gate and builds the register', async () => {
    const created = await post('/staff', admin, { name: 'Ramu Cleaner', phone: '9000011111', categoryKey: 'housekeeping', designation: 'Housekeeping', salary: { amount: 12000 }, idProof: { type: 'AADHAAR', number: '123412341234' }, weeklyOff: [0], shiftKey: 'MORNING' });
    expect(created.status).toBe(201);
    staffId = created.body.data.id;
    expect(created.body.data.staffNumber).toMatch(/^STF/);
    expect(created.body.data.categoryKey).toBe('HOUSEKEEPING');
    expect(created.body.data.salary.amount).toBe(12000);
    expect((await post('/staff', admin, { name: 'X', categoryKey: 'NOPE' })).status).toBe(422);
    await post('/staff', admin, { name: 'Shyam Guard', categoryKey: 'SECURITY', employmentType: 'AGENCY' }).expect(201);
    expect((await post('/staff', m1, { name: 'Member cannot', categoryKey: 'SECURITY' })).status).toBe(403);
    const list = await get('/staff', admin);
    expect(list.body.data).toHaveLength(2);
    // manual marking
    const marked = await post('/staff/attendance', admin, { date: today, entries: [{ staffId, status: 'PRESENT', checkInAt: dayjs(today).hour(6).minute(20).toISOString(), checkOutAt: dayjs(today).hour(16).minute(0).toISOString() }] });
    expect(marked.status).toBe(200);
    expect(marked.body.data.marked).toBe(1);
    const detail = await get(`/staff/${staffId}`, admin);
    expect(detail.body.data.recentAttendance[0]).toMatchObject({ status: 'PRESENT', late: true, minutesWorked: 580, overtimeMinutes: 40 });
    expect(detail.body.data.monthSummary.present).toBe(1);
    // gate punch for the guard record
    const shyam = list.body.data.find((x: any) => x.name === 'Shyam Guard');
    const inRes = await post(`/staff/${shyam.id}/check-in`, admin, {});
    expect(inRes.status).toBe(200);
    expect(inRes.body.data.status).toBe('PRESENT');
    expect((await post(`/staff/${shyam.id}/check-in`, admin, {})).body.data.replayed).toBe(true);
    const outRes = await post(`/staff/${shyam.id}/check-out`, admin, {});
    expect(outRes.body.data.checkOutAt).toBeTruthy();
    expect(outRes.body.data.status).toBe('HALF_DAY'); // checked out within minutes
    const register = await get(`/staff/attendance/register?month=${today.slice(0, 7)}`, admin);
    expect(register.body.data.days.length).toBeGreaterThanOrEqual(28);
    expect(register.body.data.rows).toHaveLength(2);
    expect(register.body.data.rows.find((r: any) => r.staff.id === staffId).byDate[today].status).toBe('PRESENT');
    const csv = await get(`/staff/attendance/export?month=${today.slice(0, 7)}`, admin);
    expect(csv.headers['content-type']).toContain('text/csv');
    const stats = await get('/staff/stats', admin);
    expect(stats.body.data.headcount).toBe(2);
    expect(stats.body.data.today.present).toBe(2);
  });

  it('auto-marks yesterday, reminds about unmarked staff once, and isolates societies', async () => {
    const extra = (await post('/staff', admin, { name: 'Late Marker', categoryKey: 'HOUSEKEEPING', weeklyOff: [dayjs().subtract(1, 'day').day()] })).body.data;
    const r1 = await staffService.process(dayjs().hour(13).toDate());
    expect(r1.autoMarked).toBe(3); // nobody was marked yesterday
    const y = await get(`/staff/${extra.id}`, admin);
    expect(y.body.data.recentAttendance.find((a: any) => a.date === dayjs().subtract(1, 'day').format('YYYY-MM-DD')).status).toBe('WEEK_OFF');
    expect(r1.reminders).toBe(1); // Late Marker has no attendance today
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'staff.attendance_missing' })).toBe(1);
    const r2 = await staffService.process(dayjs().hour(14).toDate());
    expect(r2.reminders).toBe(0); // once per day
    expect((await get('/staff', otherAdmin)).body.data).toHaveLength(0);
    expect((await get(`/staff/${staffId}`, otherAdmin)).status).toBe(404);
    expect((await api.delete(`/api/v1/staff/${extra.id}`).set(auth(admin))).status).toBe(204);
  });
});

describe('domestic help', () => {
  let helpId = '';
  let passcode = '';
  it('residents register help for their unit, the office verifies, shared help joins by phone', async () => {
    const reg = await post('/domestic-help', m1, { name: 'Lakshmi', phone: '9811100001', typeKey: 'maid', schedule: 'Mornings 7-9' });
    expect(reg.status).toBe(201);
    helpId = reg.body.data.id;
    passcode = reg.body.data.passcode;
    expect(passcode).toMatch(/^\d{6}$/);
    expect(reg.body.data.qrPayload).toMatch(/^SERP:H:/);
    expect(reg.body.data.verification.status).toBe('PENDING');
    expect(reg.body.data.units[0].unitId.code).toBe('A-101');
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'domestic_help.registered' })).toBe(1);
    // the neighbour registers the same maid: joins the record, one passcode for both homes
    const shared = await post('/domestic-help', m2, { name: 'Lakshmi', phone: '9811100001', typeKey: 'MAID', schedule: 'Afternoons' });
    expect(shared.status).toBe(201);
    expect(shared.body.data.id).toBe(helpId);
    expect(shared.body.data.units).toHaveLength(2);
    expect(shared.body.data.passcode).toBe(passcode);
    expect((await get('/domestic-help', m1)).body.data).toHaveLength(1);
    expect((await get('/domestic-help', m2)).body.data).toHaveLength(1);
    expect((await post(`/domestic-help/${helpId}/verify`, m1, { status: 'VERIFIED' })).status).toBe(403);
    const verified = await post(`/domestic-help/${helpId}/verify`, admin, { status: 'VERIFIED', note: 'ID checked' });
    expect(verified.body.data.verification.status).toBe('VERIFIED');
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'domestic_help.verified' })).toBe(1);
  });

  it('the gate recognises the passcode, logs entries and exits, and respects blocks', async () => {
    const found = await post('/domestic-help/lookup', guard, { code: passcode });
    expect(found.status).toBe(200);
    expect(found.body.data.allowed).toBe(true);
    expect(found.body.data.help.units.map((u: any) => u.code).sort()).toEqual(['A-101', 'A-102']);
    expect(found.body.data.help.phone).toContain('*'); // masked for the gate
    expect((await post('/domestic-help/lookup', guard, { code: '000000' })).body.data.found).toBe(false);
    const entry = await post(`/domestic-help/${helpId}/check-in`, guard, { clientRef: 'gate-abc-1' });
    expect(entry.status).toBe(200);
    expect(entry.body.data.type).toBe('IN');
    expect((await post(`/domestic-help/${helpId}/check-in`, guard, { clientRef: 'gate-abc-1' })).body.data.replayed).toBe(true);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'domestic_help.entry' })).toBe(1);
    expect((await get(`/domestic-help/${helpId}`, m1)).body.data.isInside).toBe(true);
    await post(`/domestic-help/${helpId}/check-out`, guard, {}).expect(200);
    const logs = await get('/domestic-help/logs', m1);
    expect(logs.body.data).toHaveLength(2);
    expect((await get('/domestic-help/stats', admin)).body.data.entriesToday).toBe(1);
    await post(`/domestic-help/${helpId}/block`, admin, { reason: 'Reported theft' }).expect(200);
    const blocked = await post('/domestic-help/lookup', guard, { code: passcode });
    expect(blocked.body.data.allowed).toBe(false);
    expect(blocked.body.data.reason).toContain('Blocked');
    expect((await post(`/domestic-help/${helpId}/check-in`, guard, {})).status).toBe(409);
    await post(`/domestic-help/${helpId}/unblock`, admin, {}).expect(200);
    // a unit stops the engagement; the record survives for the other unit
    expect((await post(`/domestic-help/${helpId}/units/${unitB}/remove`, m1, {})).status).toBe(403);
    expect((await post(`/domestic-help/${helpId}/units/${unitB}/remove`, m2, {})).body.data.status).toBe('ACTIVE');
    expect((await get('/domestic-help', m2)).body.data).toHaveLength(0);
    expect((await get('/domestic-help', otherAdmin)).body.data).toHaveLength(0);
  });
});

describe('vehicles & parking', () => {
  let carId = '';
  let slotId = '';
  it('residents register vehicles (normalised, unique), guards look them up with owner privacy', async () => {
    const car = await post('/vehicles', m1, { number: 'ka 01 ab 1234', type: 'CAR', make: 'Maruti', model: 'Swift', color: 'Red' });
    expect(car.status).toBe(201);
    carId = car.body.data.id;
    expect(car.body.data.number).toBe('KA01AB1234');
    expect(car.body.data.unitId.code).toBe('A-101');
    expect((await post('/vehicles', m2, { number: 'KA-01-AB-1234' })).status).toBe(409);
    await post('/vehicles', m2, { number: 'KA05CD9999', type: 'BIKE' }).expect(201);
    expect((await get('/vehicles', m1)).body.data).toHaveLength(1);
    expect((await get('/vehicles', admin)).body.data).toHaveLength(2);
    expect((await api.patch(`/api/v1/vehicles/${carId}`).set(auth(m1)).send({ stickerNumber: 'S-1' })).body.data.stickerNumber).toBeUndefined(); // members cannot set stickers
    expect((await api.patch(`/api/v1/vehicles/${carId}`).set(auth(admin)).send({ stickerNumber: 'S-1' })).body.data.stickerNumber).toBe('S-1');
    const found = await get('/vehicles/lookup?q=ab1234', guard);
    expect(found.status).toBe(200);
    expect(found.body.data).toHaveLength(1);
    expect(found.body.data[0].unitCode).toBe('A-101');
    expect(found.body.data[0].owner).toBe('Asha Member'); // showVehicleOwnerToGuards defaults to true
    await api.put('/api/v1/society/settings/privacy.config').set(auth(admin)).send({ value: { showVehicleOwnerToGuards: false } });
    expect((await get('/vehicles/lookup?q=S-1', guard)).body.data[0].owner ?? undefined).toBeUndefined();
    expect((await get('/vehicles', otherAdmin)).body.data).toHaveLength(0);
  });

  it('creates slots in bulk, allocates to units and vehicles, releases and reports occupancy', async () => {
    const bulk = await post('/parking/bulk', admin, { prefix: 'B1-', from: 1, to: 10, level: 'B1', type: 'CAR' });
    expect(bulk.status).toBe(201);
    expect(bulk.body.data.created).toBe(10);
    expect((await post('/parking/bulk', admin, { prefix: 'B1-', from: 1, to: 3, type: 'CAR' })).body.data.skipped).toBe(3);
    await post('/parking', admin, { code: 'V-1', type: 'VISITOR' }).expect(201);
    const slots = await get('/parking', admin);
    expect(slots.body.data).toHaveLength(11);
    slotId = slots.body.data.find((x: any) => x.code === 'B1-1').id;
    expect((await post(`/parking/${slotId}/allocate`, admin, { unitId: unitA, vehicleId: carId })).body.data.status).toBe('ALLOCATED');
    expect((await post(`/parking/${slotId}/allocate`, admin, { unitId: unitB })).status).toBe(409);
    expect((await get(`/vehicles/${carId}`, m1)).body.data.parkingSlotId.code).toBe('B1-1');
    expect((await get(`/units/${unitA}`, admin)).body.data.parkingSlotIds).toHaveLength(1);
    const stats = await get('/parking/stats', admin);
    expect(stats.body.data).toMatchObject({ total: 11, allocated: 1, available: 10, occupancyPercent: 9 });
    expect((await api.delete(`/api/v1/parking/${slotId}`).set(auth(admin))).status).toBe(409);
    expect((await post(`/parking/${slotId}/release`, admin, {})).body.data.status).toBe('AVAILABLE');
    expect((await get(`/vehicles/${carId}`, m1)).body.data.parkingSlotId).toBeNull();
    expect((await api.delete(`/api/v1/parking/${slotId}`).set(auth(admin))).status).toBe(204);
    expect((await post('/parking', m1, { code: 'X' })).status).toBe(403);
    expect((await get('/parking', otherAdmin)).body.data).toHaveLength(0);
  });
});
