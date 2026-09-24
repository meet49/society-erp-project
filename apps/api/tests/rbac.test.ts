import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, login, auth, createSociety } from './helpers/app';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let admin: string;
let roles: any[];

const roleId = (key: string) => roles.find((r) => r.key === key).id;

async function createUser(name: string, roleIds: string[], password = 'User@12345') {
  const email = `${name.toLowerCase()}-${Date.now()}@test.local`;
  const res = await api.post('/api/v1/society/users').set(auth(admin)).send({ name, email, password, roleIds });
  expect(res.status).toBe(201);
  const token = (await login(api, email, password)).accessToken;
  return { id: res.body.data.user.id as string, email, token };
}

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety();
  admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
  roles = (await api.get('/api/v1/society/roles').set(auth(admin))).body.data;
});
afterAll(teardownTestApp);

describe('database-driven RBAC', () => {
  it('creates a custom Accountant role and enforces it at the API', async () => {
    const created = await api.post('/api/v1/society/roles').set(auth(admin)).send({ name: 'Accountant', permissions: ['billing:view', 'billing:create', 'payments:view', 'accounting:view', 'units:view'] });
    expect(created.status).toBe(201);
    expect(created.body.data.key).toBe('ACCOUNTANT');
    const acc = await createUser('Accountant', [created.body.data.id]);
    // allowed
    expect((await api.get('/api/v1/units').set(auth(acc.token))).status).toBe(200);
    // CRITICAL: not allowed even if the UI route were entered manually
    const denied = await api.post('/api/v1/units').set(auth(acc.token)).send({ number: '999' });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
    expect((await api.get('/api/v1/society/users').set(auth(acc.token))).status).toBe(403);
    // navigation reflects permissions dynamically
    const me = await api.get('/api/v1/auth/me').set(auth(acc.token));
    const items = me.body.data.navigation.flatMap((g: any) => g.items.map((i: any) => i.key));
    expect(items).toContain('billing.billing');
    expect(items).not.toContain('society.users');
  });

  it('updating a role changes effective access without re-login', async () => {
    const role = (await api.post('/api/v1/society/roles').set(auth(admin)).send({ name: 'Auditor', permissions: ['units:view'] })).body.data;
    const user = await createUser('Auditor', [role.id]);
    expect((await api.get('/api/v1/units/stats').set(auth(user.token))).status).toBe(200);
    expect((await api.get('/api/v1/units/export').set(auth(user.token))).status).toBe(403);
    await api.patch(`/api/v1/society/roles/${role.id}`).set(auth(admin)).send({ permissions: ['units:view', 'units:export'] }).expect(200);
    expect((await api.get('/api/v1/units/export').set(auth(user.token))).status).toBe(200);
    await api.patch(`/api/v1/society/roles/${role.id}`).set(auth(admin)).send({ permissions: [] }).expect(200);
    expect((await api.get('/api/v1/units/stats').set(auth(user.token))).status).toBe(403);
  });

  it('applies direct permission allow / deny overrides', async () => {
    const user = await createUser('Direct', [roleId('MEMBER')]);
    expect((await api.get('/api/v1/units/stats').set(auth(user.token))).status).toBe(403);
    await api.put(`/api/v1/society/users/${user.id}/permissions`).set(auth(admin)).send({ allow: ['units:view'], deny: [] }).expect(200);
    expect((await api.get('/api/v1/units/stats').set(auth(user.token))).status).toBe(200);
    await api.put(`/api/v1/society/users/${user.id}/permissions`).set(auth(admin)).send({ allow: ['units:view'], deny: ['units:view'] }).expect(200);
    expect((await api.get('/api/v1/units/stats').set(auth(user.token))).status).toBe(403);
  });

  it('rejects unknown permissions when editing roles', async () => {
    const res = await api.post('/api/v1/society/roles').set(auth(admin)).send({ name: 'Broken', permissions: ['billing:launch_rockets'] });
    expect(res.status).toBe(422);
  });

  it('protects system roles and the last administrator', async () => {
    const adminRole = roleId('SOCIETY_ADMIN');
    expect((await api.patch(`/api/v1/society/roles/${adminRole}`).set(auth(admin)).send({ permissions: ['units:view'] })).status).toBe(400);
    expect((await api.delete(`/api/v1/society/roles/${roleId('MEMBER')}`).set(auth(admin))).status).toBe(400);
    const me = await api.get('/api/v1/auth/me').set(auth(admin));
    const myId = me.body.data.user.id;
    const demote = await api.put(`/api/v1/society/users/${myId}/roles`).set(auth(admin)).send({ roleIds: [roleId('COMMITTEE')] });
    expect(demote.status).toBe(409);
    expect(demote.body.code).toBe('LAST_ADMIN_PROTECTED');
    const deactivate = await api.patch(`/api/v1/society/users/${myId}/status`).set(auth(admin)).send({ status: 'INACTIVE' });
    expect(deactivate.status).toBe(400);
  });

  it('guard role cannot reach billing, members, settings or platform APIs', async () => {
    const guard = await createUser('Guard', [roleId('SECURITY_GUARD')]);
    const me = await api.get('/api/v1/auth/me').set(auth(guard.token));
    expect(me.body.data.landing).toBe('GUARD');
    expect((await api.get('/api/v1/units').set(auth(guard.token))).status).toBe(403);
    expect((await api.get('/api/v1/society/users').set(auth(guard.token))).status).toBe(403);
    expect((await api.get('/api/v1/society/settings').set(auth(guard.token))).status).toBe(403);
    expect((await api.get('/api/v1/society/subscription').set(auth(guard.token))).status).toBe(403);
    expect((await api.get('/api/v1/platform/dashboard').set(auth(guard.token))).status).toBe(403);
    const groups = me.body.data.navigation.map((g: any) => g.key);
    expect(groups).toContain('gate');
    expect(groups).not.toContain('finance');
  });

  it('member sees only self-service navigation and own-scope data', async () => {
    const member = await createUser('Member', [roleId('MEMBER')]);
    const me = await api.get('/api/v1/auth/me').set(auth(member.token));
    expect(me.body.data.landing).toBe('MEMBER');
    expect(me.body.data.navigation.every((g: any) => g.audience === 'MEMBER' || g.audience === 'GUARD')).toBe(true);
    // own scope: no linked unit → empty list, not the whole society
    await api.post('/api/v1/units').set(auth(admin)).send({ number: 'M1' }).expect(201);
    const units = await api.get('/api/v1/units').set(auth(member.token));
    expect(units.status).toBe(200);
    expect(units.body.data).toEqual([]);
  });

  it('role deletion reassigns members when requested', async () => {
    const tmp = (await api.post('/api/v1/society/roles').set(auth(admin)).send({ name: 'Temporary', permissions: ['units:view'] })).body.data;
    const user = await createUser('Reassign', [tmp.id]);
    const blocked = await api.delete(`/api/v1/society/roles/${tmp.id}`).set(auth(admin)).send({});
    expect(blocked.status).toBe(409);
    await api.delete(`/api/v1/society/roles/${tmp.id}`).set(auth(admin)).send({ reassignToRoleId: roleId('COMMITTEE') }).expect(204);
    const detail = await api.get(`/api/v1/society/users/${user.id}`).set(auth(admin));
    expect(detail.body.data.roles.map((r: any) => r.key)).toEqual(['COMMITTEE']);
  });
});
