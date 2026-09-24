import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, login, auth, SUPER } from './helpers/app';
import { Invitation } from '../src/models/invitation.model';
import { sha256, randomToken } from '../src/lib/crypto';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];

beforeAll(async () => {
  ({ api } = await setupTestApp());
});
afterAll(teardownTestApp);

describe('END-TO-END: landing → plan → signup → society → roles → users → login → navigation → authorization', () => {
  it('runs the full vertical slice through the public API', async () => {
    // 1. public landing + pricing come from the database
    const landing = await api.get('/api/v1/public/landing');
    expect(landing.status).toBe(200);
    expect(landing.body.data.plans.length).toBeGreaterThanOrEqual(3);
    const config = await api.get('/api/v1/public/signup/config');
    expect(config.body.data.enabled).toBe(true);
    const plan = landing.body.data.plans.find((p: any) => p.slug === 'growth');

    // 2. signup creates society + admin + trial atomically and logs the admin in
    const email = `owner-${Date.now()}@test.local`;
    const signup = await api.post('/api/v1/public/signup').send({
      society: { name: 'Sunrise Heights', city: 'Hyderabad', type: 'APARTMENT', totalUnits: 120 },
      admin: { name: 'Owner One', email, phone: '9999999999', password: 'Owner@12345' },
      planId: plan.id,
      billingCycle: 'MONTHLY',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    const adminToken = signup.body.data.accessToken as string;
    const ctx = signup.body.data.context;
    expect(ctx.society.name).toBe('Sunrise Heights');
    expect(ctx.subscription.status).toBe('TRIALING');
    expect(ctx.landing).toBe('ADMIN');
    expect(ctx.roles.map((r: any) => r.key)).toEqual(['SOCIETY_ADMIN']);
    expect(ctx.permissions).toContain('society:manage_roles');
    expect(ctx.modules.find((m: any) => m.key === 'visitors').accessible).toBe(true);
    expect(ctx.society.onboardingCompleted).toBe(false);

    // duplicate email cannot sign up again
    const dup = await api.post('/api/v1/public/signup').send({ society: { name: 'Dup Society', city: 'Pune' }, admin: { name: 'Dup', email, password: 'Owner@12345' }, planId: plan.id, acceptTerms: true });
    expect(dup.status).toBe(409);

    // 3. society appears in the platform console as a trial
    const superToken = (await login(api, SUPER.email, SUPER.password)).accessToken;
    const societies = await api.get('/api/v1/platform/societies?subscriptionStatus=TRIALING&search=Sunrise').set(auth(superToken));
    expect(societies.body.data.length).toBe(1);
    expect(societies.body.data[0].admin.email).toBe(email);

    // 4. setup wizard: buildings + bulk units + onboarding progress
    const tower = await api.post('/api/v1/buildings').set(auth(adminToken)).send({ name: 'Tower A', code: 'A', floors: 3 });
    expect(tower.status).toBe(201);
    const bulk = await api.post('/api/v1/units/bulk').set(auth(adminToken)).send({ buildingId: tower.body.data.id, floorFrom: 1, floorTo: 3, unitsPerFloor: 4, numberPattern: '{floor}{seq2}' });
    expect(bulk.status).toBe(201);
    expect(bulk.body.data.created).toBe(12);
    const units = await api.get('/api/v1/units?limit=50').set(auth(adminToken));
    expect(units.body.meta.total).toBe(12);
    expect(units.body.data[0].code).toBe('A-101');
    await api.patch('/api/v1/society/onboarding').set(auth(adminToken)).send({ step: 4 }).expect(200);

    // 5. create a custom role with a specific permission set
    const catalog = await api.get('/api/v1/society/roles/permission-catalog').set(auth(adminToken));
    expect(catalog.body.data.find((m: any) => m.module === 'visitors').accessible).toBe(true);
    const role = await api.post('/api/v1/society/roles').set(auth(adminToken)).send({ name: 'Facility Manager', permissions: ['units:view', 'units:update', 'complaints:view', 'complaints:assign', 'visitors:view'], landing: 'ADMIN' });
    expect(role.status).toBe(201);

    // 6. create a user with that role and log in as them
    const fmEmail = `fm-${Date.now()}@test.local`;
    const user = await api.post('/api/v1/society/users').set(auth(adminToken)).send({ name: 'Facility Person', email: fmEmail, password: 'Facility@123', roleIds: [role.body.data.id] });
    expect(user.status).toBe(201);
    const fm = await login(api, fmEmail, 'Facility@123');
    expect(fm.context.society.id).toBe(ctx.society.id);
    expect(fm.context.roles.map((r: any) => r.key)).toEqual(['FACILITY_MANAGER']);

    // 7. dynamic navigation: only permitted modules appear
    const navModules = fm.context.navigation.flatMap((g: any) => g.items.map((i: any) => i.module));
    expect(navModules).toContain('units');
    expect(navModules).not.toContain('billing');
    expect(navModules).not.toContain('society');

    // 8. API authorization mirrors it
    expect((await api.get('/api/v1/units').set(auth(fm.accessToken))).status).toBe(200);
    expect((await api.patch(`/api/v1/units/${units.body.data[0].id}`).set(auth(fm.accessToken)).send({ areaSqft: 1200 })).status).toBe(200);
    expect((await api.delete(`/api/v1/units/${units.body.data[0].id}`).set(auth(fm.accessToken))).status).toBe(403);
    expect((await api.get('/api/v1/society/users').set(auth(fm.accessToken))).status).toBe(403);
    expect((await api.get('/api/v1/society/roles').set(auth(fm.accessToken))).status).toBe(403);

    // 9. invitation flow: invite → accept → login into the society
    const roles = (await api.get('/api/v1/society/roles').set(auth(adminToken))).body.data;
    const memberRole = roles.find((r: any) => r.key === 'MEMBER');
    const inviteEmail = `resident-${Date.now()}@test.local`;
    const invite = await api.post('/api/v1/society/users/invite').set(auth(adminToken)).send({ email: inviteEmail, name: 'New Resident', roleIds: [memberRole.id] });
    expect(invite.status).toBe(201);
    expect(invite.body.data.inviteUrl).toContain('/accept-invite?token=');
    const token = invite.body.data.inviteUrl.split('token=')[1];
    const info = await api.get(`/api/v1/auth/invitations/${token}`);
    expect(info.body.data.society.name).toBe('Sunrise Heights');
    const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token, password: 'Resident@123' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.context.landing).toBe('MEMBER');
    const reuse = await api.post('/api/v1/auth/invitations/accept').send({ token, password: 'Resident@123' });
    expect(reuse.status).toBe(400);
    // expired invitations are rejected
    const raw = randomToken(32);
    await Invitation.create({ societyId: ctx.society.id, email: 'x@y.z', roleIds: [memberRole.id], tokenHash: sha256(raw), expiresAt: new Date(Date.now() - 1000), invitedBy: ctx.user.id });
    expect((await api.get(`/api/v1/auth/invitations/${raw}`)).status).toBe(400);

    // 10. audit trail captured the journey
    const audit = await api.get('/api/v1/society/audit?limit=100').set(auth(adminToken));
    const actions = audit.body.data.map((a: any) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['society.created', 'role.created', 'user.created', 'user.invited', 'unit.bulk_created']));
  });
});
