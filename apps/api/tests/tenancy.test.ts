import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, login, auth, createSociety } from './helpers/app';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let a: Awaited<ReturnType<typeof createSociety>>;
let b: Awaited<ReturnType<typeof createSociety>>;
let tokenA: string;
let tokenB: string;
let unitA: any;
let unitB: any;

beforeAll(async () => {
  ({ api } = await setupTestApp());
  a = await createSociety({ name: 'Society A' });
  b = await createSociety({ name: 'Society B' });
  tokenA = (await login(api, a.adminEmail, a.adminPassword)).accessToken;
  tokenB = (await login(api, b.adminEmail, b.adminPassword)).accessToken;
  unitA = (await api.post('/api/v1/units').set(auth(tokenA)).send({ number: '101', type: 'FLAT', areaSqft: 1000 })).body.data;
  unitB = (await api.post('/api/v1/units').set(auth(tokenB)).send({ number: '202', type: 'FLAT', areaSqft: 900 })).body.data;
});
afterAll(teardownTestApp);

describe('tenant isolation', () => {
  it('CRITICAL: society A cannot read, update or delete society B records', async () => {
    expect((await api.get(`/api/v1/units/${unitB.id}`).set(auth(tokenA))).status).toBe(404);
    expect((await api.patch(`/api/v1/units/${unitB.id}`).set(auth(tokenA)).send({ areaSqft: 1 })).status).toBe(404);
    expect((await api.delete(`/api/v1/units/${unitB.id}`).set(auth(tokenA))).status).toBe(404);
    const listA = await api.get('/api/v1/units').set(auth(tokenA));
    expect(listA.body.data.map((u: any) => u.id)).toEqual([unitA.id]);
    const listB = await api.get('/api/v1/units').set(auth(tokenB));
    expect(listB.body.data.map((u: any) => u.id)).toEqual([unitB.id]);
    // unit B is untouched
    expect((await api.get(`/api/v1/units/${unitB.id}`).set(auth(tokenB))).body.data.areaSqft).toBe(900);
  });

  it('CRITICAL: client-supplied societyId is ignored for authorization', async () => {
    const res = await api.post('/api/v1/units').set(auth(tokenA)).send({ number: '303', societyId: b.societyId });
    expect(res.status).toBe(201);
    const inB = await api.get('/api/v1/units').set(auth(tokenB));
    expect(inB.body.data.some((u: any) => u.number === '303')).toBe(false);
    const viaQuery = await api.get(`/api/v1/units?societyId=${b.societyId}`).set(auth(tokenA));
    expect(viaQuery.body.data.some((u: any) => u.id === unitB.id)).toBe(false);
    const rolesB = await api.get(`/api/v1/society/roles?societyId=${b.societyId}`).set(auth(tokenA));
    expect(rolesB.status).toBe(200);
    expect(rolesB.body.data.every((r: any) => r.societyId === a.societyId)).toBe(true);
  });

  it('cannot switch into a society without membership', async () => {
    const res = await api.post('/api/v1/auth/switch').set(auth(tokenA)).send({ societyId: b.societyId });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEMBERSHIP_INACTIVE');
    const res2 = await api.post('/api/v1/auth/login').send({ email: a.adminEmail, password: a.adminPassword, societyId: b.societyId });
    expect(res2.status).toBe(403);
  });

  it('society users cannot access the platform console', async () => {
    const res = await api.get('/api/v1/platform/dashboard').set(auth(tokenA));
    expect(res.status).toBe(403);
    const soc = await api.get('/api/v1/platform/societies').set(auth(tokenA));
    expect(soc.status).toBe(403);
  });

  it('society-scoped tokens are required for society routes', async () => {
    const res = await api.get('/api/v1/units');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('deactivated membership loses access immediately', async () => {
    const user = await api.post('/api/v1/society/users').set(auth(tokenA)).send({ name: 'Temp', email: `temp-${Date.now()}@test.local`, password: 'Temp@12345', roleIds: [(await api.get('/api/v1/society/roles').set(auth(tokenA))).body.data.find((r: any) => r.key === 'COMMITTEE').id] });
    expect(user.status).toBe(201);
    const tok = (await login(api, user.body.data.user.email, 'Temp@12345')).accessToken;
    expect((await api.get('/api/v1/units').set(auth(tok))).status).toBe(200);
    await api.patch(`/api/v1/society/users/${user.body.data.user.id}/status`).set(auth(tokenA)).send({ status: 'INACTIVE' }).expect(200);
    const after = await api.get('/api/v1/units').set(auth(tok));
    expect(after.status).toBe(401);
  });
});
