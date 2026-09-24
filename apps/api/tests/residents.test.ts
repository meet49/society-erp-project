import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, login, auth, createSociety } from './helpers/app';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let admin: string;
let unitA: any;
let unitB: any;
let roles: any[];

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
  const b = (await api.post('/api/v1/buildings').set(auth(admin)).send({ name: 'Tower A', code: 'A', floors: 2 })).body.data;
  unitA = (await api.post('/api/v1/units').set(auth(admin)).send({ buildingId: b.id, floor: 1, number: '101' })).body.data;
  unitB = (await api.post('/api/v1/units').set(auth(admin)).send({ buildingId: b.id, floor: 1, number: '102' })).body.data;
  roles = (await api.get('/api/v1/society/roles').set(auth(admin))).body.data;
});
afterAll(teardownTestApp);

describe('residents & move workflows', () => {
  it('creates owner and tenant and keeps unit occupancy in sync', async () => {
    const owner = await api.post('/api/v1/residents').set(auth(admin)).send({ unitId: unitA.id, name: 'Owner One', phone: '9876543210', email: 'owner1@test.local', type: 'OWNER', isPrimary: true });
    expect(owner.status).toBe(201);
    let unit = (await api.get(`/api/v1/units/${unitA.id}`).set(auth(admin))).body.data;
    expect(unit.occupancyStatus).toBe('OWNER_OCCUPIED');
    expect(unit.ownerResidentId.name).toBe('Owner One');
    const tenant = await api.post('/api/v1/residents').set(auth(admin)).send({ unitId: unitA.id, name: 'Tenant One', phone: '9876500000', type: 'TENANT', tenancy: { rent: 25000 } });
    expect(tenant.status).toBe(201);
    unit = (await api.get(`/api/v1/units/${unitA.id}`).set(auth(admin))).body.data;
    expect(unit.occupancyStatus).toBe('TENANT_OCCUPIED');
    expect(unit.tenantResidentId.name).toBe('Tenant One');
    const stats = await api.get('/api/v1/residents/stats').set(auth(admin));
    expect(stats.body.data.total).toBe(2);
    expect(stats.body.data.byType.OWNER).toBe(1);
  });

  it('member sees only their own household with own-scope, and can add family', async () => {
    const memberRole = roles.find((r) => r.key === 'MEMBER').id;
    // create resident for unit B with a login
    const resident = (await api.post('/api/v1/residents').set(auth(admin)).send({ unitId: unitB.id, name: 'Member Two', email: `member2-${Date.now()}@test.local`, phone: '9000000002', type: 'OWNER' })).body.data;
    const invite = await api.post(`/api/v1/residents/${resident.id}/invite`).set(auth(admin)).send({ roleIds: [memberRole] });
    expect(invite.status).toBe(201);
    const token = invite.body.data.inviteUrl.split('token=')[1];
    const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token, password: 'Member@12345' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.context.resident.unitIds).toEqual([unitB.id]);
    const memberToken = accepted.body.data.accessToken;
    // own-scope list: only unit B residents
    const list = await api.get('/api/v1/residents').set(auth(memberToken));
    expect(list.status).toBe(200);
    expect(list.body.data.every((r: any) => (r.unitId.id ?? r.unitId._id ?? r.unitId) === unitB.id)).toBe(true);
    expect(list.body.data.some((r: any) => r.name === 'Owner One')).toBe(false);
    // cannot read another unit's resident
    const ownerOne = (await api.get('/api/v1/residents?search=Owner%20One').set(auth(admin))).body.data[0];
    expect((await api.get(`/api/v1/residents/${ownerOne.id}`).set(auth(memberToken))).status).toBe(404);
    // household + family
    const household = await api.get('/api/v1/residents/my').set(auth(memberToken));
    expect(household.body.data.units[0].code).toBe('A-102');
    const fam = await api.post('/api/v1/residents/my/family').set(auth(memberToken)).send({ name: 'Kid Two', relationship: 'Son', type: 'FAMILY' });
    expect(fam.status).toBe(201);
    expect(fam.body.data.unitId).toBe(unitB.id);
    // cannot create residents in other units
    expect((await api.post('/api/v1/residents').set(auth(memberToken)).send({ unitId: unitA.id, name: 'Intruder', type: 'FAMILY' })).status).toBe(403);
  });

  it('guards get a minimal directory lookup without contact details', async () => {
    const guardRole = roles.find((r) => r.key === 'SECURITY_GUARD').id;
    const email = `guard-${Date.now()}@test.local`;
    await api.post('/api/v1/society/users').set(auth(admin)).send({ name: 'Gate Guard', email, password: 'Guard@12345', roleIds: [guardRole] }).expect(201);
    const guard = (await login(api, email, 'Guard@12345')).accessToken;
    const lookup = await api.get('/api/v1/residents/lookup?q=101').set(auth(guard));
    expect(lookup.status).toBe(200);
    expect(lookup.body.data.length).toBeGreaterThan(0);
    expect(lookup.body.data[0]).not.toHaveProperty('phone');
    expect(lookup.body.data[0].unitCode).toBe('A-101');
    expect((await api.get('/api/v1/residents').set(auth(guard))).status).toBe(403);
  });

  it('masks contact details for roles without residents:view_contact', async () => {
    const role = (await api.post('/api/v1/society/roles').set(auth(admin)).send({ name: 'Viewer', permissions: ['residents:view'] })).body.data;
    const email = `viewer-${Date.now()}@test.local`;
    await api.post('/api/v1/society/users').set(auth(admin)).send({ name: 'Viewer', email, password: 'Viewer@12345', roleIds: [role.id] }).expect(201);
    const viewer = (await login(api, email, 'Viewer@12345')).accessToken;
    const list = await api.get('/api/v1/residents?search=Owner%20One').set(auth(viewer));
    expect(list.body.data[0].phone).toMatch(/^\*+10$/);
    const full = await api.get('/api/v1/residents?search=Owner%20One').set(auth(admin));
    expect(full.body.data[0].phone).toBe('9876543210');
  });

  it('move-in without approval permission creates a pending request that an approver applies', async () => {
    const role = (await api.post('/api/v1/society/roles').set(auth(admin)).send({ name: 'Office', permissions: ['residents:move', 'residents:view', 'units:view'] })).body.data;
    const email = `office-${Date.now()}@test.local`;
    await api.post('/api/v1/society/users').set(auth(admin)).send({ name: 'Office Staff', email, password: 'Office@12345', roleIds: [role.id] }).expect(201);
    const office = (await login(api, email, 'Office@12345')).accessToken;
    const unitC = (await api.post('/api/v1/units').set(auth(admin)).send({ number: '201' })).body.data;
    const req = await api.post('/api/v1/residents/moves').set(auth(office)).send({ type: 'MOVE_IN', unitId: unitC.id, residentType: 'TENANT', resident: { name: 'New Tenant', phone: '9111111111' }, notes: 'Agreement received' });
    expect(req.status).toBe(201);
    expect(req.body.data.approvalStatus).toBe('PENDING');
    // not applied yet
    expect((await api.get(`/api/v1/units/${unitC.id}`).set(auth(admin))).body.data.occupancyStatus).toBe('VACANT');
    expect((await api.post(`/api/v1/residents/moves/${req.body.data.id}/approve`).set(auth(office))).status).toBe(403);
    const approved = await api.post(`/api/v1/residents/moves/${req.body.data.id}/approve`).set(auth(admin));
    expect(approved.status).toBe(200);
    expect(approved.body.data.residentId).toBeTruthy();
    const unit = (await api.get(`/api/v1/units/${unitC.id}`).set(auth(admin))).body.data;
    expect(unit.occupancyStatus).toBe('TENANT_OCCUPIED');
    expect(unit.tenantResidentId.name).toBe('New Tenant');
    // move out (admin applies immediately) → vacant, resident MOVED_OUT
    const out = await api.post('/api/v1/residents/moves').set(auth(admin)).send({ type: 'MOVE_OUT', unitId: unitC.id, residentType: 'TENANT' });
    expect(out.status).toBe(201);
    expect(out.body.data.approvalStatus).toBe('APPROVED');
    expect((await api.get(`/api/v1/units/${unitC.id}`).set(auth(admin))).body.data.occupancyStatus).toBe('VACANT');
    const moved = await api.get(`/api/v1/residents/${approved.body.data.residentId}`).set(auth(admin));
    expect(moved.body.data.status).toBe('MOVED_OUT');
    const moves = await api.get('/api/v1/residents/moves').set(auth(admin));
    expect(moves.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('tenant change closes the previous tenant and links the new one', async () => {
    const change = await api.post('/api/v1/residents/moves').set(auth(admin)).send({ type: 'TENANT_CHANGE', unitId: unitA.id, residentType: 'TENANT', resident: { name: 'Tenant Two', phone: '9222222222' } });
    expect(change.status).toBe(201);
    const unit = (await api.get(`/api/v1/units/${unitA.id}`).set(auth(admin))).body.data;
    expect(unit.tenantResidentId.name).toBe('Tenant Two');
    const old = await api.get('/api/v1/residents?status=MOVED_OUT').set(auth(admin));
    expect(old.body.data.some((r: any) => r.name === 'Tenant One')).toBe(true);
  });

  it('CRITICAL: residents are isolated per society', async () => {
    const other = await createSociety();
    const otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
    const ownerOne = (await api.get('/api/v1/residents?search=Owner%20One').set(auth(admin))).body.data[0];
    expect((await api.get(`/api/v1/residents/${ownerOne.id}`).set(auth(otherAdmin))).status).toBe(404);
    expect((await api.patch(`/api/v1/residents/${ownerOne.id}`).set(auth(otherAdmin)).send({ name: 'Hacked' })).status).toBe(404);
    expect((await api.post('/api/v1/residents').set(auth(otherAdmin)).send({ unitId: unitA.id, name: 'X', type: 'OWNER' })).status).toBe(422);
  });
});
