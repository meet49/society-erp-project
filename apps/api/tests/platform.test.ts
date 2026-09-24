import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, login, auth, createSociety, SUPER, flush } from './helpers/app';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let superToken: string;

beforeAll(async () => {
  ({ api } = await setupTestApp());
  superToken = (await login(api, SUPER.email, SUPER.password)).accessToken;
});
afterAll(teardownTestApp);

describe('super admin console', () => {
  it('creates a society with admin, lists and inspects it', async () => {
    const res = await api.post('/api/v1/platform/societies').set(auth(superToken)).send({
      society: { name: 'Console Created', city: 'Pune' },
      admin: { name: 'Console Admin', email: `console-${Date.now()}@test.local` },
      planId: (await api.get('/api/v1/platform/plans').set(auth(superToken))).body.data.find((p: any) => p.slug === 'growth').id,
      billingCycle: 'ANNUAL',
      startTrial: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.tempPassword).toBeTruthy();
    const list = await api.get('/api/v1/platform/societies?search=Console').set(auth(superToken));
    expect(list.body.data.length).toBe(1);
    expect(list.body.data[0].subscription.status).toBe('ACTIVE');
    expect(list.body.data[0].plan.slug).toBe('growth');
    const detail = await api.get(`/api/v1/platform/societies/${res.body.data.society.id}`).set(auth(superToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.modules.length).toBeGreaterThan(10);
    expect(detail.body.data.limits.find((l: any) => l.key === 'maxUnits').limit).toBe(500);
    expect(detail.body.data.adminCount).toBe(1);
    // temp password login works and must change password flag is set
    const login1 = await api.post('/api/v1/auth/login').send({ email: res.body.data.admin.email, password: res.body.data.tempPassword });
    expect(login1.status).toBe(200);
    expect(login1.body.data.context.user.mustChangePassword).toBe(true);
  });

  it('suspends a society and blocks its users', async () => {
    const s = await createSociety();
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    await api.patch(`/api/v1/platform/societies/${s.societyId}/status`).set(auth(superToken)).send({ status: 'SUSPENDED', reason: 'abuse' }).expect(200);
    const res = await api.get('/api/v1/units').set(auth(admin));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SOCIETY_SUSPENDED');
    await api.patch(`/api/v1/platform/societies/${s.societyId}/status`).set(auth(superToken)).send({ status: 'ACTIVE' }).expect(200);
    expect((await api.get('/api/v1/units').set(auth(admin))).status).toBe(200);
  });

  it('manages plans dynamically and exposes public pricing from the database', async () => {
    const created = await api.post('/api/v1/platform/plans').set(auth(superToken)).send({ name: 'Custom', slug: 'custom', monthlyPrice: 777, annualPrice: 7770, status: 'ACTIVE', modules: ['units', 'residents'], limits: { maxUnits: 42 }, features: [{ key: 'x', label: 'Forty-two units' }] });
    expect(created.status).toBe(201);
    const pub = await api.get('/api/v1/public/plans');
    const custom = pub.body.data.find((p: any) => p.slug === 'custom');
    expect(custom.monthlyPrice).toBe(777);
    expect(custom.limits.maxUnits).toBe(42);
    await api.patch(`/api/v1/platform/plans/${created.body.data.id}`).set(auth(superToken)).send({ monthlyPrice: 888, publicVisibility: false }).expect(200);
    const pub2 = await api.get('/api/v1/public/plans');
    expect(pub2.body.data.find((p: any) => p.slug === 'custom')).toBeUndefined();
    const dup = await api.post('/api/v1/platform/plans').set(auth(superToken)).send({ name: 'Custom 2', slug: 'custom', monthlyPrice: 1, annualPrice: 1 });
    expect(dup.status).toBe(409);
    const badModule = await api.post('/api/v1/platform/plans').set(auth(superToken)).send({ name: 'Bad', slug: 'bad', monthlyPrice: 1, annualPrice: 1, modules: ['teleportation'] });
    expect(badModule.status).toBe(422);
  });

  it('LANDING E2E: CMS edits publish to the public site without code changes', async () => {
    const sections = (await api.get('/api/v1/platform/landing/sections').set(auth(superToken))).body.data;
    const hero = sections.find((s: any) => s.key === 'hero');
    const faq = sections.find((s: any) => s.key === 'faq');
    // draft does not change the public site
    await api.patch(`/api/v1/platform/landing/sections/${hero.id}`).set(auth(superToken)).send({ title: 'New hero title', cta: { label: 'Try now', href: '/signup' } }).expect(200);
    let pub = await api.get('/api/v1/public/landing');
    expect(pub.body.data.sections.find((s: any) => s.key === 'hero').title).toBe(hero.title);
    const preview = await api.get('/api/v1/platform/landing/preview').set(auth(superToken));
    expect(preview.body.data.sections.find((s: any) => s.key === 'hero').title).toBe('New hero title');
    // publish → public reflects
    await api.post(`/api/v1/platform/landing/sections/${hero.id}/publish`).set(auth(superToken)).expect(200);
    pub = await api.get('/api/v1/public/landing');
    const pubHero = pub.body.data.sections.find((s: any) => s.key === 'hero');
    expect(pubHero.title).toBe('New hero title');
    expect(pubHero.cta.label).toBe('Try now');
    // FAQ items + unpublish
    await api.patch(`/api/v1/platform/landing/sections/${faq.id}`).set(auth(superToken)).send({ content: { items: [{ question: 'Q1', answer: 'A1' }] } }).expect(200);
    await api.post(`/api/v1/platform/landing/sections/${faq.id}/publish`).set(auth(superToken)).expect(200);
    pub = await api.get('/api/v1/public/landing');
    expect(pub.body.data.sections.find((s: any) => s.key === 'faq').content.items).toEqual([{ question: 'Q1', answer: 'A1' }]);
    await api.post(`/api/v1/platform/landing/sections/${faq.id}/unpublish`).set(auth(superToken)).expect(200);
    pub = await api.get('/api/v1/public/landing');
    expect(pub.body.data.sections.find((s: any) => s.key === 'faq')).toBeUndefined();
    // brand settings flow to the public payload
    await api.put('/api/v1/platform/settings').set(auth(superToken)).send({ settings: [{ key: 'brand.name', value: 'Acme Society Cloud' }] }).expect(204);
    pub = await api.get('/api/v1/public/landing');
    expect(pub.body.data.settings['brand.name']).toBe('Acme Society Cloud');
    // new custom section + reorder
    const custom = await api.post('/api/v1/platform/landing/sections').set(auth(superToken)).send({ type: 'CUSTOM', key: 'partners', title: 'Partners', content: { items: [] } });
    expect(custom.status).toBe(201);
    await api.put('/api/v1/platform/landing/sections/reorder').set(auth(superToken)).send({ page: 'home', orderedIds: [custom.body.data.id, hero.id] }).expect(204);
    await api.post(`/api/v1/platform/landing/sections/${custom.body.data.id}/publish`).set(auth(superToken)).expect(200);
    pub = await api.get('/api/v1/public/landing');
    expect(pub.body.data.sections[0].key).toBe('partners');
  });

  it('captures leads from the public site into the CRM', async () => {
    const lead = await api.post('/api/v1/public/leads').send({ type: 'DEMO_REQUEST', name: 'Prospect One', email: 'prospect@example.com', phone: '9876543210', societyName: 'Lake View', city: 'Mumbai', message: 'Need a demo' });
    expect(lead.status).toBe(201);
    await flush();
    const list = await api.get('/api/v1/platform/leads?status=NEW').set(auth(superToken));
    expect(list.body.data.some((l: any) => l.email === 'prospect@example.com')).toBe(true);
    const id = list.body.data.find((l: any) => l.email === 'prospect@example.com').id;
    await api.patch(`/api/v1/platform/leads/${id}`).set(auth(superToken)).send({ status: 'CONTACTED' }).expect(200);
    const noted = await api.post(`/api/v1/platform/leads/${id}/notes`).set(auth(superToken)).send({ body: 'Called, follow up Monday' });
    expect(noted.body.data.notes.length).toBe(1);
    const csv = await api.get('/api/v1/platform/leads/export').set(auth(superToken));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('prospect@example.com');
    const notif = await api.get('/api/v1/notifications').set(auth(superToken));
    expect(notif.body.data.some((n: any) => n.type === 'lead.created')).toBe(true);
  });

  it('runs a threaded support conversation between a society admin and the platform', async () => {
    const s = await createSociety();
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    const created = await api.post('/api/v1/society/support').set(auth(admin)).send({ subject: 'Invoice PDF broken', message: 'The PDF shows blank', priority: 'HIGH' });
    expect(created.status).toBe(201);
    const ticketId = created.body.data.id;
    expect(created.body.data.ticketNumber).toMatch(/^SUP\//);
    const inbox = await api.get('/api/v1/platform/support?status=OPEN_ALL').set(auth(superToken));
    expect(inbox.body.data.some((t: any) => t.id === ticketId)).toBe(true);
    await api.post(`/api/v1/platform/support/${ticketId}/reply`).set(auth(superToken)).send({ body: 'Internal: check renderer', internal: true }).expect(200);
    await api.post(`/api/v1/platform/support/${ticketId}/reply`).set(auth(superToken)).send({ body: 'We are looking into it' }).expect(200);
    const societyView = await api.get(`/api/v1/society/support/${ticketId}`).set(auth(admin));
    expect(societyView.body.data.messages.length).toBe(2); // requester + public reply, internal hidden
    expect(societyView.body.data.status).toBe('WAITING');
    await api.post(`/api/v1/society/support/${ticketId}/reply`).set(auth(admin)).send({ body: 'Thanks, still broken' }).expect(200);
    const platformView = await api.get(`/api/v1/platform/support/${ticketId}`).set(auth(superToken));
    expect(platformView.body.data.messages.length).toBe(4);
    expect(platformView.body.data.status).toBe('OPEN');
    await api.patch(`/api/v1/platform/support/${ticketId}`).set(auth(superToken)).send({ status: 'RESOLVED' }).expect(200);
    await api.patch(`/api/v1/platform/support/${ticketId}`).set(auth(superToken)).send({ status: 'CLOSED' }).expect(200);
    const closedReply = await api.post(`/api/v1/society/support/${ticketId}/reply`).set(auth(admin)).send({ body: 'again' });
    expect(closedReply.status).toBe(409);
    // members of another society cannot see it
    const other = await createSociety();
    const otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
    expect((await api.get(`/api/v1/society/support/${ticketId}`).set(auth(otherAdmin))).status).toBe(404);
  });

  it('records platform audit logs for sensitive actions', async () => {
    const audit = await api.get('/api/v1/platform/audit?action=plan.').set(auth(superToken));
    expect(audit.status).toBe(200);
    expect(audit.body.data.length).toBeGreaterThan(0);
    expect(audit.body.data[0].actorType).toBe('PLATFORM_ADMIN');
    expect(JSON.stringify(audit.body.data)).not.toMatch(/passwordHash|SuperAdmin@123/);
  });

  it('protects the last SUPER_ADMIN', async () => {
    const me = await api.get('/api/v1/auth/me').set(auth(superToken));
    const res = await api.put(`/api/v1/platform/users/${me.body.data.user.id}/roles`).set(auth(superToken)).send({ roleKeys: [] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LAST_ADMIN_PROTECTED');
  });
});
