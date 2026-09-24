import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Communication end-to-end: the committee publishes a notice from the UI, a resident reads and
 * acknowledges it, posts to the community feed and answers a poll.
 */
const API = 'http://localhost:4100/api/v1';
const stamp = Date.now();
const admin = { name: 'Kavita Admin', email: `kavita-${stamp}@example.com`, password: 'Admin@12345' };
const member = { name: 'Nikhil Resident', email: `nikhil-${stamp}@example.com`, password: 'Resident@123' };
let adminToken = '';

async function api(request: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch', path: string, token?: string, data?: unknown) {
  const res = await request[method](`${API}${path}`, { data, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

async function login(page: Page, email: string, password: string, expectPath: RegExp) {
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* about:blank */ } }).catch(() => undefined);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(expectPath);
}

test.describe.serial('notices, feed & polls', () => {
  test('setup: society, unit, resident and an open poll', async ({ request }) => {
    const cfg = await api(request, 'get', '/public/signup/config');
    const planId = cfg.body.data.plans.find((p: any) => p.slug === 'growth')?.id ?? cfg.body.data.defaultPlanId;
    const signup = await api(request, 'post', '/public/signup', undefined, { society: { name: `Maple Heights ${stamp}`, city: 'Mumbai' }, admin, planId, billingCycle: 'MONTHLY', acceptTerms: true });
    expect(signup.status).toBe(201);
    adminToken = signup.body.data.accessToken;
    const building = await api(request, 'post', '/buildings', adminToken, { name: 'Tower A', code: 'A', floors: 2 });
    const unit = await api(request, 'post', '/units', adminToken, { buildingId: building.body.data.id, floor: 1, number: '101' });
    const roles = (await api(request, 'get', '/society/roles', adminToken)).body.data;
    const resident = await api(request, 'post', '/residents', adminToken, { unitId: unit.body.data.id, name: member.name, email: member.email, phone: '9000000701', type: 'OWNER', isPrimary: true });
    const invite = await api(request, 'post', `/residents/${resident.body.data.id}/invite`, adminToken, { roleIds: [roles.find((r: any) => r.key === 'MEMBER').id] });
    const accepted = await api(request, 'post', '/auth/invitations/accept', undefined, { token: invite.body.data.inviteUrl.split('token=')[1], password: member.password });
    expect(accepted.status).toBe(200);
    expect((await api(request, 'post', '/polls', adminToken, { question: 'Should we repaint the lobby this year?', options: ['Yes', 'No'], openNow: true })).status).toBe(201);
  });

  test('committee publishes a notice that asks for acknowledgement', async ({ page }) => {
    await login(page, admin.email, admin.password, /\/app/);
    await page.goto('/app/notices');
    await expect(page.getByRole('heading', { name: 'Notices', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'New notice' }).click();
    await page.getByLabel('Title *').fill('Water supply interruption on Saturday');
    await page.getByLabel('Notice *').fill('Tanks will be cleaned between 10:00 and 14:00. Please store water.');
    await expect(page.getByText(/Reaches \d+ (person|people)/)).toBeVisible();
    await page.getByText('Ask residents to acknowledge').click();
    await page.getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByText('Notice published')).toBeVisible();
    await expect(page.getByText('Water supply interruption on Saturday', { exact: true })).toBeVisible();
    await expect(page.getByText('Published').first()).toBeVisible();
  });

  test('resident reads and acknowledges the notice, posts to the feed and votes', async ({ page }) => {
    await login(page, member.email, member.password, /\/app/);
    await page.goto('/app/my/notices');
    await expect(page.getByRole('heading', { name: 'Notices', exact: true })).toBeVisible();
    await expect(page.getByText('New').first()).toBeVisible();
    await page.getByRole('link', { name: /Water supply interruption on Saturday/ }).click();
    await expect(page.getByText('Tanks will be cleaned between 10:00 and 14:00')).toBeVisible();
    await page.getByRole('button', { name: 'I have read this' }).click();
    await expect(page.getByText('You acknowledged this notice.')).toBeVisible();
    await page.goto('/app/my/community');
    await page.getByLabel('Post').fill('Anyone up for a badminton game this weekend?');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText('Anyone up for a badminton game this weekend?')).toBeVisible();
    await page.goto('/app/my/polls');
    await expect(page.getByText('Should we repaint the lobby this year?')).toBeVisible();
    await page.getByText('Yes', { exact: true }).click();
    await page.getByRole('button', { name: 'Vote', exact: true }).click();
    await expect(page.getByText('Vote recorded')).toBeVisible();
    await expect(page.getByText('Your vote')).toBeVisible();
  });

  test('the committee sees the read receipt', async ({ page }) => {
    await login(page, admin.email, admin.password, /\/app/);
    await page.goto('/app/notices');
    await page.getByText('Water supply interruption on Saturday', { exact: true }).first().click();
    await expect(page.getByText('Nikhil Resident')).toBeVisible();
    await expect(page.getByText('Acknowledged').first()).toBeVisible();
  });
});
