import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, SUPER } from './helpers/app';
import { Subscription } from '../src/models/subscription.model';
import { subscriptionEngine } from '../src/core/subscription/subscription-engine.service';
import { configurationService } from '../src/core/configuration/configuration.service';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let superToken: string;

beforeAll(async () => {
  ({ api } = await setupTestApp());
  superToken = (await login(api, SUPER.email, SUPER.password)).accessToken;
});
afterAll(teardownTestApp);

describe('subscription engine', () => {
  it('trialing society has full access and sees trial info', async () => {
    const s = await createSociety();
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    const me = await api.get('/api/v1/auth/me').set(auth(admin));
    expect(me.body.data.subscription.status).toBe('TRIALING');
    expect(me.body.data.subscription.blocked).toBe(false);
    expect(me.body.data.subscription.daysRemaining).toBeGreaterThanOrEqual(13);
    expect((await api.post('/api/v1/units').set(auth(admin)).send({ number: '1' })).status).toBe(201);
  });

  it('CRITICAL: expired subscription blocks protected APIs but leaves recovery routes open', async () => {
    const s = await createSociety();
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    const sub = await subscriptionEngine.getBySociety(s.societyId);
    await subscriptionEngine.expire(sub, { note: 'test' });
    const res = await api.get('/api/v1/units').set(auth(admin));
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_EXPIRED');
    expect((await api.post('/api/v1/units').set(auth(admin)).send({ number: '2' })).status).toBe(402);
    expect((await api.get('/api/v1/society/users').set(auth(admin))).status).toBe(402);
    // still reachable: profile, subscription, support, me
    expect((await api.get('/api/v1/society/subscription').set(auth(admin))).status).toBe(200);
    expect((await api.get('/api/v1/society/profile').set(auth(admin))).status).toBe(200);
    expect((await api.get('/api/v1/auth/me').set(auth(admin))).body.data.subscription.blocked).toBe(true);
    // platform extends → access restored
    const extended = await api.post(`/api/v1/platform/subscriptions/${sub._id}/extend`).set(auth(superToken)).send({ days: 30 });
    expect(extended.status).toBe(200);
    expect(extended.body.data.status).toBe('ACTIVE');
    expect((await api.get('/api/v1/units').set(auth(admin))).status).toBe(200);
  });

  it('PAST_DUE is read-only when configured', async () => {
    await configurationService.setPlatformSetting('subscription.pastDueBehavior', 'READ_ONLY');
    const s = await createSociety({ startTrial: false });
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    const sub = await subscriptionEngine.getBySociety(s.societyId);
    sub.renewalDate = dayjs().subtract(1, 'day').toDate();
    await sub.save();
    const swept = await subscriptionEngine.runLifecycleCheck();
    expect(swept.pastDue).toBeGreaterThanOrEqual(1);
    expect((await api.get('/api/v1/units').set(auth(admin))).status).toBe(200);
    const write = await api.post('/api/v1/units').set(auth(admin)).send({ number: '3' });
    expect(write.status).toBe(402);
    expect(write.body.code).toBe('SUBSCRIPTION_READ_ONLY');
    // activation (payment) restores full access and pushes the renewal date one cycle
    const activated = await api.post(`/api/v1/platform/subscriptions/${sub._id}/activate`).set(auth(superToken)).send({ note: 'paid offline', reference: 'NEFT-1' });
    expect(activated.status).toBe(200);
    expect(activated.body.data.status).toBe('ACTIVE');
    expect(dayjs(activated.body.data.renewalDate).isAfter(dayjs())).toBe(true);
    expect((await api.post('/api/v1/units').set(auth(admin)).send({ number: '3' })).status).toBe(201);
    const payments = await api.get('/api/v1/platform/payments').set(auth(superToken));
    expect([200, 404]).toContain(payments.status);
  });

  it('lifecycle sweep: trial end → expired → suspended, with reminders', async () => {
    await configurationService.setPlatformSetting('subscription.trialEndBehavior', 'EXPIRE');
    await configurationService.setPlatformSetting('subscription.expiredToSuspendedDays', 0);
    const s = await createSociety();
    const sub = await subscriptionEngine.getBySociety(s.societyId);
    sub.trialEndDate = dayjs().subtract(1, 'hour').toDate();
    sub.renewalDate = sub.trialEndDate;
    await sub.save();
    await subscriptionEngine.runLifecycleCheck();
    expect((await Subscription.findById(sub._id).lean())!.status).toBe('EXPIRED');
    await subscriptionEngine.runLifecycleCheck(dayjs().add(1, 'day').toDate());
    expect((await Subscription.findById(sub._id).lean())!.status).toBe('SUSPENDED');
    await configurationService.setPlatformSetting('subscription.expiredToSuspendedDays', 30);
    // reminder: renewal in 7 days → one reminder, idempotent
    const s2 = await createSociety();
    const sub2 = await subscriptionEngine.getBySociety(s2.societyId);
    sub2.renewalDate = dayjs().add(7, 'day').toDate();
    sub2.trialEndDate = sub2.renewalDate;
    await sub2.save();
    const r1 = await subscriptionEngine.runLifecycleCheck();
    const r2 = await subscriptionEngine.runLifecycleCheck();
    expect(r1.reminders).toBeGreaterThanOrEqual(1);
    expect(r2.reminders).toBe(0);
  });

  it('suspended society admins cannot use the workspace; platform can reactivate', async () => {
    const s = await createSociety();
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    const sub = await subscriptionEngine.getBySociety(s.societyId);
    await api.post(`/api/v1/platform/subscriptions/${sub._id}/suspend`).set(auth(superToken)).send({ reason: 'non-payment' }).expect(200);
    const res = await api.get('/api/v1/units').set(auth(admin));
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_SUSPENDED');
    await api.post(`/api/v1/platform/subscriptions/${sub._id}/reactivate`).set(auth(superToken)).send({ days: 15 }).expect(200);
    expect((await api.get('/api/v1/units').set(auth(admin))).status).toBe(200);
  });

  it('invalid transitions are rejected and self-service plan change works', async () => {
    const s = await createSociety({ planSlug: 'starter' });
    const admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
    const view = await api.get('/api/v1/society/subscription').set(auth(admin));
    expect(view.status).toBe(200);
    expect(view.body.data.plan.slug).toBe('starter');
    const growth = view.body.data.availablePlans.find((p: any) => p.slug === 'growth');
    const changed = await api.post('/api/v1/society/subscription/change-plan').set(auth(admin)).send({ planId: growth._id ?? growth.id, billingCycle: 'ANNUAL' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.billingCycle).toBe('ANNUAL');
    const mods = await api.get('/api/v1/society/modules').set(auth(admin));
    expect(mods.body.data.find((m: any) => m.key === 'visitors').accessible).toBe(true);
    await api.post('/api/v1/society/subscription/cancel').set(auth(admin)).send({ reason: 'moving' }).expect(200);
    const twice = await api.post('/api/v1/society/subscription/cancel').set(auth(admin)).send({});
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('INVALID_STATE_TRANSITION');
    // cancelled → workspace blocked
    const blocked = await api.get('/api/v1/units').set(auth(admin));
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('SUBSCRIPTION_CANCELLED');
  });

  it('expiry radar buckets subscriptions by days remaining', async () => {
    const radar = await api.get('/api/v1/platform/subscriptions/expiry-radar').set(auth(superToken));
    expect(radar.status).toBe(200);
    expect(radar.body.data.map((b: any) => b.key)).toEqual(['expired', 'today', '1-3', '4-7', '8-15', '16-30']);
    const stats = await api.get('/api/v1/platform/dashboard').set(auth(superToken));
    expect(stats.body.data.societies.total).toBeGreaterThan(0);
  });
});
