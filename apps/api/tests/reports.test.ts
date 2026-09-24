import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety } from './helpers/app';
import { REPORTS } from '../src/modules/reports/reports.catalog';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let admin = '';
let member = '';
const post = (path: string, token: string, body: Record<string, unknown>) => api.post(`/api/v1${path}`).set(auth(token)).send(body);
const get = (path: string, token: string) => api.get(`/api/v1${path}`).set(auth(token));

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
  const b = (await post('/buildings', admin, { name: 'Tower A', code: 'A', floors: 2 })).body.data;
  const u1 = (await post('/units', admin, { buildingId: b.id, floor: 1, number: '101' })).body.data;
  await post('/units', admin, { buildingId: b.id, floor: 1, number: '102' });
  const roles = (await get('/society/roles', admin)).body.data;
  const resident = (await post('/residents', admin, { unitId: u1.id, name: 'Asha Member', email: `asha-${Date.now()}@test.local`, phone: `9400${Math.floor(Math.random() * 900000) + 100000}`, type: 'OWNER', isPrimary: true })).body.data;
  const invite = await post(`/residents/${resident.id}/invite`, admin, { roleIds: [roles.find((r: any) => r.key === 'MEMBER').id] });
  member = (await api.post('/api/v1/auth/invitations/accept').send({ token: invite.body.data.inviteUrl.split('token=')[1], password: 'Member@12345' })).body.data.accessToken;
  const vendorId = (await post('/vendors', admin, { name: 'Sparkle Housekeeping', categoryKey: 'housekeeping' })).body.data.id;
  await post('/expenses', admin, { title: 'Brooms', vendorId, categoryKey: 'housekeeping', amount: 800, billDate: new Date().toISOString(), submit: true });
  await post('/expenses', admin, { title: 'Mops', vendorId, categoryKey: 'housekeeping', amount: 600, billDate: new Date().toISOString(), submit: true });
  await post('/contracts', admin, { title: 'Housekeeping', vendorId, startDate: dayjs().subtract(1, 'month').toISOString(), endDate: dayjs().add(2, 'month').toISOString(), value: 120_000, activate: true });
  await post('/complaints', admin, { title: 'Leaking tap', categoryKey: 'plumbing', unitId: u1.id, description: 'Kitchen tap leaks' });
});
afterAll(teardownTestApp);

describe('reports engine', () => {
  it('lists only the reports whose module is accessible and the caller may see', async () => {
    const list = await get('/reports', admin);
    expect(list.status).toBe(200);
    const keys = list.body.data.map((r: any) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['collections-monthly', 'expense-by-category', 'occupancy', 'complaints-sla', 'contracts-expiry']));
    expect(list.body.data.every((r: any) => typeof r.run === 'undefined')).toBe(true);
    expect(list.body.data.find((r: any) => r.key === 'occupancy').columns.length).toBeGreaterThan(3);
    // members do not hold reports:view
    expect((await get('/reports', member)).status).toBe(403);
    expect(REPORTS.every((r) => r.key === r.key.toLowerCase() && r.columns.length > 0)).toBe(true);
  });

  it('runs reports with sensible defaults and explicit parameters', async () => {
    const occupancy = await get('/reports/occupancy', admin);
    expect(occupancy.status).toBe(200);
    expect(occupancy.body.data.report.key).toBe('occupancy');
    expect(occupancy.body.data.rows[0]).toMatchObject({ building: 'Tower A', units: 2 });
    expect(occupancy.body.data.totals.units).toBe(2);
    const expenses = await get('/reports/expense-by-category', admin);
    expect(expenses.body.data.rows).toEqual([expect.objectContaining({ category: 'HOUSEKEEPING', count: 2, total: 1400, share: 100 })]);
    const contracts = await get('/reports/contracts-expiry?months=3', admin);
    expect(contracts.body.data.rows).toHaveLength(1);
    expect(contracts.body.data.rows[0].daysRemaining).toBeGreaterThan(50);
    expect((await get('/reports/contracts-expiry?months=1', admin)).body.data.rows).toHaveLength(0);
    const sla = await get(`/reports/complaints-sla?from=${dayjs().subtract(1, 'day').format('YYYY-MM-DD')}&to=${dayjs().format('YYYY-MM-DD')}`, admin);
    expect(sla.body.data.rows[0]).toMatchObject({ category: 'PLUMBING', raised: 1, resolved: 0, open: 1 });
    expect(sla.body.data.params.from).toBeTruthy();
    const collections = await get('/reports/collections-monthly', admin);
    expect(collections.body.data.rows.length).toBeGreaterThanOrEqual(6);
    expect((await get('/reports/nope', admin)).status).toBe(404);
    expect((await get('/reports/occupancy?months=99', admin)).status).toBe(422);
  });

  it('exports CSV only with the export permission', async () => {
    const csv = await get('/reports/expense-by-category/export', admin);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('HOUSEKEEPING');
    expect(csv.text).toContain('TOTAL');
    const roles = (await get('/society/roles', admin)).body.data;
    const viewerEmail = `viewer-${Date.now()}@test.local`;
    const viewerRole = (await post('/society/roles', admin, { key: 'REPORT_VIEWER', name: 'Report viewer', permissions: ['reports:view', 'units:view', 'dashboard:view'] })).body.data;
    await post('/society/users', admin, { name: 'Viewer', email: viewerEmail, password: 'Viewer@12345', roleIds: [viewerRole?.id ?? roles[0].id] });
    const viewer = (await login(api, viewerEmail, 'Viewer@12345')).accessToken;
    expect((await get('/reports/occupancy', viewer)).status).toBe(200);
    expect((await get('/reports/expense-by-category', viewer)).status).toBe(404);
    expect((await get('/reports/occupancy/export', viewer)).status).toBe(403);
  });
});
