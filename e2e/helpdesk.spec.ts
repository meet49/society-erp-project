import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Helpdesk end-to-end: a resident raises a complaint from the app, the admin assigns and resolves it,
 * the resident confirms and rates it. SLA settings are read from the society configuration.
 */
const API = 'http://localhost:4100/api/v1';
const stamp = Date.now();
const admin = { name: 'Hema Secretary', email: `hema-${stamp}@example.com`, password: 'Secretary@123' };
const member = { name: 'Kiran Resident', email: `kiran-${stamp}@example.com`, password: 'Resident@123' };
let adminToken = '';

async function api(request: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch', path: string, token?: string, data?: unknown) {
  const res = await request[method](`${API}${path}`, { data, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

async function login(page: Page, email: string, password: string) {
  // drop any existing session first, otherwise /login redirects straight to the landing page
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* about:blank */ } }).catch(() => undefined);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app/);
}

test.describe.serial('helpdesk', () => {
  test('setup: society, unit and a resident login', async ({ request }) => {
    const cfg = await api(request, 'get', '/public/signup/config');
    const planId = cfg.body.data.plans.find((p: any) => p.slug === 'growth')?.id ?? cfg.body.data.defaultPlanId;
    const signup = await api(request, 'post', '/public/signup', undefined, { society: { name: `Sunrise Enclave ${stamp}`, city: 'Hyderabad' }, admin, planId, billingCycle: 'MONTHLY', acceptTerms: true });
    expect(signup.status).toBe(201);
    adminToken = signup.body.data.accessToken;
    const building = await api(request, 'post', '/buildings', adminToken, { name: 'Block A', code: 'A', floors: 3 });
    const unit = await api(request, 'post', '/units', adminToken, { buildingId: building.body.data.id, floor: 2, number: '201' });
    const roles = (await api(request, 'get', '/society/roles', adminToken)).body.data;
    const resident = await api(request, 'post', '/residents', adminToken, { unitId: unit.body.data.id, name: member.name, email: member.email, phone: '9000000201', type: 'OWNER', isPrimary: true });
    const invite = await api(request, 'post', `/residents/${resident.body.data.id}/invite`, adminToken, { roleIds: [roles.find((r: any) => r.key === 'MEMBER').id] });
    const accepted = await api(request, 'post', '/auth/invitations/accept', undefined, { token: invite.body.data.inviteUrl.split('token=')[1], password: member.password });
    expect(accepted.status).toBe(200);
  });

  test('resident raises a complaint from My complaints', async ({ page }) => {
    await login(page, member.email, member.password);
    await page.goto('/app/my/complaints');
    await expect(page.getByRole('heading', { name: 'My complaints' })).toBeVisible();
    await page.getByRole('button', { name: 'Raise a complaint' }).first().click();
    await page.getByLabel('What is the issue?').fill('Kitchen tap leaking continuously');
    await page.getByRole('dialog').getByText('Choose category').click();
    await page.getByRole('option', { name: 'Plumbing' }).click();
    await page.getByLabel('Details').fill('Started yesterday evening, water pooling under the sink.');
    await page.getByRole('button', { name: 'Raise complaint' }).click();
    await expect(page.getByRole('heading', { name: /TKT\// })).toBeVisible();
    await expect(page.getByText('Kitchen tap leaking continuously', { exact: true })).toBeVisible();
    await expect(page.getByText(/Due /).first()).toBeVisible();
  });

  test('admin assigns, replies and resolves; resident confirms and rates', async ({ page }) => {
    await login(page, admin.email, admin.password);
    await page.goto('/app/complaints');
    await expect(page.getByRole('heading', { name: 'Complaints' })).toBeVisible();
    await page.getByText('Kitchen tap leaking continuously').click();
    await expect(page.getByRole('heading', { name: /TKT\// })).toBeVisible();
    await page.getByRole('button', { name: 'Assign' }).click();
    await page.getByRole('dialog').getByText('Select user').click();
    await page.getByRole('option', { name: admin.name }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Assign' }).click();
    await expect(page.getByText('In Progress').first()).toBeVisible();
    await page.getByLabel('Reply').fill('Plumber scheduled for 10am tomorrow.');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Plumber scheduled for 10am tomorrow.')).toBeVisible();
    await page.getByRole('button', { name: 'Resolve' }).click();
    await page.getByLabel('What was done?').fill('Replaced the washer and tightened the joint.');
    await page.getByRole('dialog').getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByText('Resolved').first()).toBeVisible();

    await login(page, member.email, member.password);
    await page.goto('/app/my/complaints');
    await page.getByText('Kitchen tap leaking continuously').click();
    await expect(page.getByText('Replaced the washer and tightened the joint.').first()).toBeVisible();
    await page.getByRole('button', { name: 'Confirm resolved' }).click();
    await expect(page.getByText('Closed').first()).toBeVisible();
    await page.getByLabel('4 star').click();
    await page.getByRole('button', { name: 'Submit rating' }).click();
    await expect(page.getByText('Thanks for the feedback')).toBeVisible();
  });
});
