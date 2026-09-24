import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Billing & payments end-to-end: charge heads → billing run → issued invoice → member pays online
 * through the demo gateway (server-verified) → receipt; guard is blocked from finance at the API.
 * Data is created through the public/authenticated API to keep the browser part focused.
 */
const API = 'http://localhost:4100/api/v1';
const stamp = Date.now();
const admin = { name: 'Bina Treasurer', email: `bina-${stamp}@example.com`, password: 'Treasurer@123' };
const member = { name: 'Manoj Resident', email: `manoj-${stamp}@example.com`, password: 'Resident@123' };
const guard = { name: 'Gopal Guard', email: `gopal-${stamp}@example.com`, password: 'Guard@12345' };

let adminToken = '';
let memberToken = '';
let guardToken = '';
let unitId = '';
let invoiceNumber = '';

async function api(request: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch', path: string, token?: string, data?: unknown) {
  const res = await request[method](`${API}${path}`, { data, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // wait for the session to be stored before navigating elsewhere
  await expect(page).toHaveURL(/\/app/);
}

test.describe.serial('billing & payments', () => {
  test('setup: society, structure, resident logins, charge heads, billing run', async ({ request }) => {
    const cfg = await api(request, 'get', '/public/signup/config');
    const planId = cfg.body.data.plans.find((p: any) => p.slug === 'growth')?.id ?? cfg.body.data.defaultPlanId;
    const signup = await api(request, 'post', '/public/signup', undefined, { society: { name: `Lake View ${stamp}`, city: 'Pune' }, admin, planId, billingCycle: 'MONTHLY', acceptTerms: true });
    expect(signup.status).toBe(201);
    adminToken = signup.body.data.accessToken;
    const building = await api(request, 'post', '/buildings', adminToken, { name: 'Tower A', code: 'A', floors: 2 });
    const u1 = await api(request, 'post', '/units', adminToken, { buildingId: building.body.data.id, floor: 1, number: '101', areaSqft: 1000 });
    await api(request, 'post', '/units', adminToken, { buildingId: building.body.data.id, floor: 1, number: '102', areaSqft: 1200 });
    unitId = u1.body.data.id;
    const roles = (await api(request, 'get', '/society/roles', adminToken)).body.data;
    const memberRole = roles.find((r: any) => r.key === 'MEMBER').id;
    const guardRole = roles.find((r: any) => r.key === 'SECURITY_GUARD').id;
    // resident with a login on unit 101
    const resident = await api(request, 'post', '/residents', adminToken, { unitId, name: member.name, email: member.email, phone: '9000000101', type: 'OWNER', isPrimary: true });
    const invite = await api(request, 'post', `/residents/${resident.body.data.id}/invite`, adminToken, { roleIds: [memberRole] });
    const token = invite.body.data.inviteUrl.split('token=')[1];
    const accepted = await api(request, 'post', '/auth/invitations/accept', undefined, { token, password: member.password });
    expect(accepted.status).toBe(200);
    memberToken = accepted.body.data.accessToken;
    // guard user
    const guardUser = await api(request, 'post', '/society/users', adminToken, { name: guard.name, email: guard.email, password: guard.password, roleIds: [guardRole] });
    expect(guardUser.status).toBe(201);
    guardToken = (await api(request, 'post', '/auth/login', undefined, { email: guard.email, password: guard.password })).body.data.accessToken;
    // billing configuration through the API (the UI for this is covered by unit-level pages)
    await api(request, 'post', '/billing/charge-heads', adminToken, { name: 'Maintenance', code: 'MAINT', type: 'AREA_BASED', rate: 2 });
    await api(request, 'post', '/billing/charge-heads', adminToken, { name: 'Sinking fund', code: 'SINK', type: 'FIXED', amount: 500 });
    const run = await api(request, 'post', '/billing/runs', adminToken, { periodFrom: new Date(Date.UTC(2026, 6, 1)).toISOString(), periodTo: new Date(Date.UTC(2026, 6, 31)).toISOString(), issueImmediately: true });
    expect(run.status).toBe(201);
    expect(run.body.data.invoiceCount).toBe(2);
    const invoices = await api(request, 'get', `/billing/invoices?unitId=${unitId}`, adminToken);
    invoiceNumber = invoices.body.data[0].invoiceNumber;
    expect(invoices.body.data[0].total).toBe(2500);
    // enable the demo gateway
    const gw = await api(request, 'put', '/payments/gateway', adminToken, { provider: 'mock', enabled: true, keyId: 'mock_key', keySecret: 'mock-payment-secret', testMode: true });
    expect(gw.status).toBe(200);
  });

  test('admin sees outstanding dues and the issued invoice', async ({ page }) => {
    await login(page, admin.email, admin.password);
    await page.goto('/app/billing');
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
    await expect(page.getByText(invoiceNumber)).toBeVisible();
    await page.getByText(invoiceNumber).click();
    await expect(page.getByRole('heading', { name: new RegExp(invoiceNumber) })).toBeVisible();
    await expect(page.getByText('Balance due')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record payment' })).toBeVisible();
  });

  test('member pays the bill online through the demo gateway and gets a receipt', async ({ page }) => {
    await login(page, member.email, member.password);
    await page.goto('/app/my/bills');
    await expect(page.getByRole('heading', { name: 'My bills' })).toBeVisible();
    await expect(page.getByRole('link', { name: invoiceNumber })).toBeVisible();
    await page.getByRole('button', { name: /^Pay / }).click();
    await expect(page.getByRole('dialog')).toContainText('demo gateway');
    await page.getByRole('dialog').getByRole('button', { name: /^Pay ₹/ }).click();
    await expect(page.getByText('Payment successful')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('All settled')).toBeVisible();
    await page.goto('/app/my/payments');
    await expect(page.getByRole('heading', { name: 'My payments' })).toBeVisible();
    await expect(page.getByText(/RCP\//).first()).toBeVisible();
    await page.getByText(/RCP\//).first().click();
    await expect(page.getByText('Payment receipt')).toBeVisible();
    await expect(page.getByText('Gateway-verified online payment')).toBeVisible();
  });

  test('a forged gateway callback is rejected and the guard cannot reach finance APIs', async ({ request }) => {
    const order = await api(request, 'post', '/payments/orders', memberToken, { amount: 300 });
    expect(order.status).toBe(201);
    const forged = await api(request, 'post', `/payments/orders/${order.body.data.orderId}/verify`, memberToken, { paymentId: 'pay_forged', signature: 'ab'.repeat(20) });
    expect(forged.status).toBe(400);
    expect(forged.body.code).toBe('PAYMENT_VERIFICATION_FAILED');
    for (const path of ['/billing/invoices', '/billing/stats', '/payments', '/payments/stats', '/society/subscription', '/society/users']) {
      const res = await api(request, 'get', path, guardToken);
      expect(res.status, path).toBe(403);
    }
    const me = await api(request, 'get', '/auth/me', guardToken);
    const paths = me.body.data.navigation.flatMap((g: any) => g.items.map((i: any) => i.path));
    expect(paths.some((p: string) => p.startsWith('/app/billing') || p.startsWith('/app/payments'))).toBe(false);
  });
});
