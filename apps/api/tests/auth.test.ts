import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, login, auth, createSociety, SUPER } from './helpers/app';
import { Token } from '../src/models/token.model';
import { User } from '../src/models/user.model';
import { sha256, randomToken } from '../src/lib/crypto';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let society: Awaited<ReturnType<typeof createSociety>>;

beforeAll(async () => {
  ({ api } = await setupTestApp());
  society = await createSociety();
});
afterAll(teardownTestApp);

describe('authentication', () => {
  it('rejects invalid credentials without revealing account existence', async () => {
    const unknown = await api.post('/api/v1/auth/login').send({ email: 'nobody@test.local', password: 'Whatever@123' });
    const wrong = await api.post('/api/v1/auth/login').send({ email: society.adminEmail, password: 'Wrong@12345' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('validates the login payload', async () => {
    const res = await api.post('/api/v1/auth/login').send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.fields.email).toBeDefined();
  });

  it('logs in a society admin and returns a society-bound access context', async () => {
    const data = await login(api, society.adminEmail, society.adminPassword);
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(data.context.society.id).toBe(society.societyId);
    expect(data.context.landing).toBe('ADMIN');
    expect(data.context.permissions).toContain('units:create');
    expect(data.context.navigation.length).toBeGreaterThan(0);
    expect(data.context.user.isPlatformAdmin).toBe(false);
  });

  it('logs in the super admin into the platform context', async () => {
    const data = await login(api, SUPER.email, SUPER.password);
    expect(data.context.landing).toBe('PLATFORM');
    expect(data.context.permissions).toContain('platform_societies:create');
    const me = await api.get('/api/v1/auth/me').set(auth(data.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.user.isPlatformAdmin).toBe(true);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const first = await login(api, society.adminEmail, society.adminPassword);
    const r1 = await api.post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.data.refreshToken).not.toBe(first.refreshToken);
    // reusing the consumed token revokes the whole family
    const reuse = await api.post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('TOKEN_REUSED');
    const afterReuse = await api.post('/api/v1/auth/refresh').send({ refreshToken: r1.body.data.refreshToken });
    expect(afterReuse.status).toBe(401);
    expect(afterReuse.body.code).toBe('SESSION_REVOKED');
    const me = await api.get('/api/v1/auth/me').set(auth(r1.body.data.accessToken));
    expect(me.status).toBe(401);
  });

  it('logout revokes the session family', async () => {
    const data = await login(api, society.adminEmail, society.adminPassword);
    const out = await api.post('/api/v1/auth/logout').set(auth(data.accessToken)).send({ refreshToken: data.refreshToken });
    expect(out.status).toBe(204);
    const me = await api.get('/api/v1/auth/me').set(auth(data.accessToken));
    expect(me.status).toBe(401);
    expect(me.body.code).toBe('SESSION_REVOKED');
  });

  it('locks the account after repeated failures', async () => {
    const s = await createSociety();
    for (let i = 0; i < 8; i += 1) await api.post('/api/v1/auth/login').send({ email: s.adminEmail, password: 'Wrong@12345' });
    const locked = await api.post('/api/v1/auth/login').send({ email: s.adminEmail, password: s.adminPassword });
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('changes password and revokes other sessions', async () => {
    const s = await createSociety();
    const a = await login(api, s.adminEmail, s.adminPassword);
    const b = await login(api, s.adminEmail, s.adminPassword);
    const res = await api.post('/api/v1/auth/change-password').set(auth(a.accessToken)).send({ currentPassword: s.adminPassword, newPassword: 'NewPass@12345' });
    expect(res.status).toBe(204);
    expect((await api.get('/api/v1/auth/me').set(auth(a.accessToken))).status).toBe(200);
    expect((await api.get('/api/v1/auth/me').set(auth(b.accessToken))).status).toBe(401);
    await login(api, s.adminEmail, 'NewPass@12345');
  });

  it('resets password through a one-time token', async () => {
    const s = await createSociety();
    await api.post('/api/v1/auth/forgot-password').send({ email: s.adminEmail }).expect(200);
    const user = await User.findOne({ email: s.adminEmail }).lean();
    const raw = randomToken(32);
    await Token.create({ userId: user!._id, type: 'PASSWORD_RESET', tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 60000) });
    const res = await api.post('/api/v1/auth/reset-password').send({ token: raw, password: 'Reset@12345' });
    expect(res.status).toBe(204);
    const again = await api.post('/api/v1/auth/reset-password').send({ token: raw, password: 'Reset@12345' });
    expect(again.status).toBe(400);
    await login(api, s.adminEmail, 'Reset@12345');
  });

  it('lists and revokes sessions', async () => {
    const s = await createSociety();
    const a = await login(api, s.adminEmail, s.adminPassword);
    await login(api, s.adminEmail, s.adminPassword);
    const list = await api.get('/api/v1/auth/sessions').set(auth(a.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(2);
    const other = list.body.data.find((x: any) => !x.current);
    await api.delete(`/api/v1/auth/sessions/${other.familyId}`).set(auth(a.accessToken)).expect(204);
    const after = await api.get('/api/v1/auth/sessions').set(auth(a.accessToken));
    expect(after.body.data.length).toBe(1);
  });
});
