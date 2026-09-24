import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Visitor & gate end-to-end: a resident pre-approves a guest and gets a passcode; the guard (mobile-first
 * app) finds the pass and checks the guest in; a walk-in registered at the gate is approved by the
 * resident in real time; the guard never sees finance screens.
 */
const API = 'http://localhost:4100/api/v1';
const stamp = Date.now();
const admin = { name: 'Sunil Secretary', email: `sunil-${stamp}@example.com`, password: 'Secretary@123' };
const member = { name: 'Rekha Resident', email: `rekha-${stamp}@example.com`, password: 'Resident@123' };
const guard = { name: 'Bahadur Guard', email: `bahadur-${stamp}@example.com`, password: 'Guard@12345' };
let adminToken = '';
let memberToken = '';
let passcode = '';

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

test.describe.serial('visitors & gate', () => {
  test('setup: society, unit, resident and guard logins', async ({ request }) => {
    const cfg = await api(request, 'get', '/public/signup/config');
    const planId = cfg.body.data.plans.find((p: any) => p.slug === 'growth')?.id ?? cfg.body.data.defaultPlanId;
    const signup = await api(request, 'post', '/public/signup', undefined, { society: { name: `Green Meadows ${stamp}`, city: 'Pune' }, admin, planId, billingCycle: 'MONTHLY', acceptTerms: true });
    expect(signup.status).toBe(201);
    adminToken = signup.body.data.accessToken;
    const building = await api(request, 'post', '/buildings', adminToken, { name: 'Block A', code: 'A', floors: 2 });
    const unit = await api(request, 'post', '/units', adminToken, { buildingId: building.body.data.id, floor: 1, number: '101' });
    const roles = (await api(request, 'get', '/society/roles', adminToken)).body.data;
    const resident = await api(request, 'post', '/residents', adminToken, { unitId: unit.body.data.id, name: member.name, email: member.email, phone: '9000000501', type: 'OWNER', isPrimary: true });
    const invite = await api(request, 'post', `/residents/${resident.body.data.id}/invite`, adminToken, { roleIds: [roles.find((r: any) => r.key === 'MEMBER').id] });
    const accepted = await api(request, 'post', '/auth/invitations/accept', undefined, { token: invite.body.data.inviteUrl.split('token=')[1], password: member.password });
    expect(accepted.status).toBe(200);
    memberToken = accepted.body.data.accessToken;
    const g = await api(request, 'post', '/society/users', adminToken, { name: guard.name, email: guard.email, password: guard.password, roleIds: [roles.find((r: any) => r.key === 'SECURITY_GUARD').id] });
    expect(g.status).toBe(201);
  });

  test('resident pre-approves a guest and gets a shareable passcode', async ({ page }) => {
    await login(page, member.email, member.password, /\/app/);
    await page.goto('/app/my/visitors');
    await expect(page.getByRole('heading', { name: 'My visitors' })).toBeVisible();
    await page.getByRole('button', { name: 'Pre-approve visitor' }).first().click();
    await page.getByLabel('Visitor name').fill('Anil Guest');
    await page.getByLabel('Vehicle number').fill('MH12AB1234');
    await page.getByRole('button', { name: 'Create pass' }).click();
    await expect(page.getByRole('dialog').getByText('Visitor pass')).toBeVisible();
    const code = await page.locator('.tracking-\\[0\\.3em\\]').first().textContent();
    expect(code).toMatch(/^\d{6}$/);
    passcode = code!.trim();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(page.getByText('Anil Guest').first()).toBeVisible();
  });

  test('guard lands on the gate app, finds the pass by passcode and checks the guest in', async ({ page }) => {
    await login(page, guard.email, guard.password, /\/guard/);
    await expect(page.getByRole('link', { name: 'Scan pass', exact: true })).toBeVisible();
    // finance / settings are not in the guard navigation
    await expect(page.getByRole('link', { name: 'Billing' })).toHaveCount(0);
    await page.goto('/guard/scan');
    await page.getByPlaceholder('6-digit passcode').fill(passcode);
    await page.getByRole('button', { name: 'Find' }).click();
    await expect(page.getByText('Anil Guest', { exact: true })).toBeVisible();
    await expect(page.getByText(/A-101/).first()).toBeVisible();
    await page.getByRole('button', { name: /Check in Anil Guest/ }).click();
    await expect(page.getByText('Anil Guest checked in')).toBeVisible();
    await page.goto('/guard');
    await expect(page.getByText('Inside now')).toBeVisible();
    await expect(page.locator('main').getByText('Anil Guest', { exact: true }).first()).toBeVisible();
  });

  test('walk-in at the gate is approved by the resident and the API blocks the guard from finance', async ({ page, request }) => {
    await login(page, guard.email, guard.password, /\/guard/);
    await page.goto('/guard/walk-in');
    await page.getByRole('combobox').first().click();
    await page.getByPlaceholder('Type flat number').fill('101');
    await page.getByRole('option', { name: /A-101/ }).click();
    await page.getByLabel('Visitor name').fill('Courier Kumar');
    await page.getByRole('button', { name: 'Delivery' }).click();
    await page.getByRole('button', { name: 'Ask resident to approve' }).click();
    await expect(page.getByText(/Waiting for unit A-101/)).toBeVisible();
    // the resident approves through the API (their app would show the same request)
    const pending = await api(request, 'get', '/visitors?status=PENDING', memberToken);
    expect(pending.body.data).toHaveLength(1);
    const approved = await api(request, 'post', `/visitors/${pending.body.data[0].id}/approve`, memberToken, {});
    expect(approved.status).toBe(200);
    await expect(page.getByText(/Approved/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Check in Courier Kumar' }).click();
    await expect(page).toHaveURL(/\/guard$/);
    // guard token cannot reach finance or settings APIs
    const guardToken = (await api(request, 'post', '/auth/login', undefined, { email: guard.email, password: guard.password })).body.data.accessToken;
    for (const path of ['/billing/invoices', '/payments', '/accounting/summary', '/society/users', '/society/subscription']) expect((await api(request, 'get', path, guardToken)).status, path).toBe(403);
  });
});
