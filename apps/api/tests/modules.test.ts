import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, login, auth, createSociety, SUPER } from './helpers/app';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let superToken: string;

beforeAll(async () => {
  ({ api } = await setupTestApp());
  superToken = (await login(api, SUPER.email, SUPER.password)).accessToken;
});
afterAll(teardownTestApp);

async function createPlan(name: string, modules: string[]) {
  const res = await api.post('/api/v1/platform/plans').set(auth(superToken)).send({ name, slug: name.toLowerCase().replace(/\s+/g, '-'), monthlyPrice: 100, annualPrice: 1000, status: 'ACTIVE', modules, trialDays: 14 });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('module engine', () => {
  it('CRITICAL: disabled module API returns MODULE_DISABLED and re-enabling restores data', async () => {
    const s = await createSociety({ planSlug: 'growth' });
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    const unit = await api.post('/api/v1/units').set(auth(admin)).send({ number: '101' });
    expect(unit.status).toBe(201);
    // residents depends on units → must disable dependents first
    const blocked = await api.patch('/api/v1/society/modules/units').set(auth(admin)).send({ enabled: false });
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('MODULE_DEPENDENCY_MISSING');
    for (const key of ['visitors', 'delivery', 'domestic_help', 'residents', 'vehicles', 'parking', 'payments', 'billing']) {
      const r = await api.patch(`/api/v1/society/modules/${key}`).set(auth(admin)).send({ enabled: false });
      expect(r.status).toBe(200);
    }
    const disabled = await api.patch('/api/v1/society/modules/units').set(auth(admin)).send({ enabled: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.accessible).toBe(false);
    const res = await api.get('/api/v1/units').set(auth(admin));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MODULE_DISABLED');
    // navigation hides the module
    const me = await api.get('/api/v1/auth/me').set(auth(admin));
    expect(me.body.data.navigation.flatMap((g: any) => g.items.map((i: any) => i.module))).not.toContain('units');
    // re-enable → existing data intact
    await api.patch('/api/v1/society/modules/units').set(auth(admin)).send({ enabled: true }).expect(200);
    const list = await api.get('/api/v1/units').set(auth(admin));
    expect(list.status).toBe(200);
    expect(list.body.data.map((u: any) => u.id)).toContain(unit.body.data.id);
  });

  it('core modules cannot be disabled', async () => {
    const s = await createSociety();
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    const res = await api.patch('/api/v1/society/modules/society').set(auth(admin)).send({ enabled: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MODULE_CORE_LOCKED');
  });

  it('PLAN E2E: module availability follows the plan and updates dynamically', async () => {
    const planA = await createPlan('Plan A', ['units', 'residents', 'billing']);
    const planB = await createPlan('Plan B', ['units', 'residents', 'billing', 'visitors']);
    const socA = await createSociety({ planSlug: 'plan-a' });
    const socB = await createSociety({ planSlug: 'plan-b' });
    const tokA = (await login(api, socA.adminEmail, socA.adminPassword)).accessToken;
    const tokB = (await login(api, socB.adminEmail, socB.adminPassword)).accessToken;

    const modsA = (await api.get('/api/v1/society/modules').set(auth(tokA))).body.data;
    const modsB = (await api.get('/api/v1/society/modules').set(auth(tokB))).body.data;
    expect(modsA.find((m: any) => m.key === 'visitors').accessible).toBe(false);
    expect(modsA.find((m: any) => m.key === 'visitors').inPlan).toBe(false);
    expect(modsB.find((m: any) => m.key === 'visitors').accessible).toBe(true);
    // A cannot enable a module outside its plan
    const enable = await api.patch('/api/v1/society/modules/visitors').set(auth(tokA)).send({ enabled: true });
    expect(enable.status).toBe(403);
    expect(enable.body.code).toBe('MODULE_NOT_IN_PLAN');
    // permissions of unavailable modules are not granted even to the admin
    const meA = await api.get('/api/v1/auth/me').set(auth(tokA));
    expect(meA.body.data.permissions).not.toContain('visitors:view');
    expect(meA.body.data.permissions).toContain('billing:view');
    // modify Plan A → visitors becomes available without any code change
    await api.patch(`/api/v1/platform/plans/${planA.id}`).set(auth(superToken)).send({ modules: ['units', 'residents', 'billing', 'visitors'] }).expect(200);
    const modsA2 = (await api.get('/api/v1/society/modules').set(auth(tokA))).body.data;
    expect(modsA2.find((m: any) => m.key === 'visitors').accessible).toBe(true);
    const meA2 = await api.get('/api/v1/auth/me').set(auth(tokA));
    expect(meA2.body.data.permissions).toContain('visitors:view');
    // downgrade Plan B → visitors removed, no data deleted, access blocked
    await api.patch(`/api/v1/platform/plans/${planB.id}`).set(auth(superToken)).send({ modules: ['units', 'residents', 'billing'] }).expect(200);
    const modsB2 = (await api.get('/api/v1/society/modules').set(auth(tokB))).body.data;
    expect(modsB2.find((m: any) => m.key === 'visitors').accessible).toBe(false);
  });

  it('globally inactive module blocks every society with MODULE_INACTIVE', async () => {
    const s = await createSociety({ planSlug: 'growth' });
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    expect((await api.get('/api/v1/units').set(auth(admin))).status).toBe(200);
    await api.patch('/api/v1/platform/modules/units').set(auth(superToken)).send({ status: 'INACTIVE' }).expect(200);
    const res = await api.get('/api/v1/units').set(auth(admin));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MODULE_INACTIVE');
    await api.patch('/api/v1/platform/modules/units').set(auth(superToken)).send({ status: 'ACTIVE' }).expect(200);
    expect((await api.get('/api/v1/units').set(auth(admin))).status).toBe(200);
  });

  it('feature-flagged module respects platform flags with society overrides', async () => {
    const s = await createSociety({ planSlug: 'growth' });
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    const before = (await api.get('/api/v1/society/modules').set(auth(admin))).body.data.find((m: any) => m.key === 'emergency');
    expect(before.accessible).toBe(true);
    await api.patch('/api/v1/platform/feature-flags/emergency_module').set(auth(superToken)).send({ enabled: false }).expect(200);
    const off = (await api.get('/api/v1/society/modules').set(auth(admin))).body.data.find((m: any) => m.key === 'emergency');
    expect(off.accessible).toBe(false);
    expect(off.featureFlagBlocked).toBe(true);
    await api.patch('/api/v1/platform/feature-flags/emergency_module').set(auth(superToken)).send({ enabledForSocietyIds: [s.societyId] }).expect(200);
    const override = (await api.get('/api/v1/society/modules').set(auth(admin))).body.data.find((m: any) => m.key === 'emergency');
    expect(override.accessible).toBe(true);
    await api.patch('/api/v1/platform/feature-flags/emergency_module').set(auth(superToken)).send({ enabled: true, enabledForSocietyIds: [] }).expect(200);
  });
});
