import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Operations end-to-end: reports, spreadsheet import, incident logging, an SOS raised from the gate app
 * and answered by the office, and stock movements in the store.
 */
const API = 'http://localhost:4100/api/v1';
const stamp = Date.now();
const admin = { name: 'Meera Admin', email: `meera-${stamp}@example.com`, password: 'Admin@12345' };
const guard = { name: 'Suresh Guard', email: `suresh-${stamp}@example.com`, password: 'Guard@12345' };
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

test.describe.serial('reports, import, security, emergency & inventory', () => {
  test('setup: society, unit and a guard', async ({ request }) => {
    const cfg = await api(request, 'get', '/public/signup/config');
    const planId = cfg.body.data.plans.find((p: any) => p.slug === 'growth')?.id ?? cfg.body.data.defaultPlanId;
    const signup = await api(request, 'post', '/public/signup', undefined, { society: { name: `Cedar Court ${stamp}`, city: 'Pune' }, admin, planId, billingCycle: 'MONTHLY', acceptTerms: true });
    expect(signup.status).toBe(201);
    adminToken = signup.body.data.accessToken;
    const building = await api(request, 'post', '/buildings', adminToken, { name: 'Tower A', code: 'A', floors: 2 });
    expect((await api(request, 'post', '/units', adminToken, { buildingId: building.body.data.id, floor: 1, number: '101' })).status).toBe(201);
    const roles = (await api(request, 'get', '/society/roles', adminToken)).body.data;
    const g = await api(request, 'post', '/society/users', adminToken, { name: guard.name, email: guard.email, password: guard.password, roleIds: [roles.find((r: any) => r.key === 'SECURITY_GUARD').id] });
    expect(g.status).toBe(201);
  });

  test('admin opens the report catalogue and runs the occupancy report', async ({ page }) => {
    await login(page, admin.email, admin.password, /\/app/);
    await page.goto('/app/reports');
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await page.getByRole('link', { name: /Occupancy/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Occupancy' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Tower A' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  });

  test('admin imports units from a CSV through the wizard', async ({ page, request }) => {
    await login(page, admin.email, admin.password, /\/app/);
    await page.goto('/app/settings/import');
    await expect(page.getByRole('heading', { name: 'Data import' })).toBeVisible();
    await page.getByRole('button', { name: 'Import', exact: true }).first().click();
    const csv = 'Tower,Flat No,Floor,Area\nA,102,1,1200\nA,103,1,950\n';
    await page.locator('input[type=file]').setInputFiles({ name: 'units.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    await page.getByRole('button', { name: 'Upload and continue' }).click();
    await expect(page.getByText('Match your columns')).toBeVisible();
    await page.getByRole('button', { name: 'Check the file' }).click();
    await expect(page.getByText(/2 of 2 rows are ready/)).toBeVisible();
    await page.getByRole('button', { name: /Import 2 rows/ }).click();
    await expect(page.getByText(/2 imported/).first()).toBeVisible({ timeout: 30_000 });
    const units = await api(request, 'get', '/units?limit=50', adminToken);
    expect(units.body.data.map((u: any) => u.code).sort()).toEqual(['A-101', 'A-102', 'A-103']);
  });

  test('admin logs a security incident from the desk', async ({ page }) => {
    await login(page, admin.email, admin.password, /\/app/);
    await page.goto('/app/security');
    await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
    await page.getByRole('button', { name: 'Log incident' }).first().click();
    await page.getByLabel('Title *').fill('Broken CCTV camera near basement ramp');
    await page.locator('#in-type').click();
    await page.getByRole('option', { name: 'Property damage' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Log incident' }).click();
    await expect(page.getByText('Incident logged')).toBeVisible();
    await expect(page.getByRole('cell', { name: /Broken CCTV camera/ })).toBeVisible();
  });

  test('guard raises an SOS from the gate app', async ({ page }) => {
    await login(page, guard.email, guard.password, /\/guard/);
    await page.goto('/guard/emergency');
    await expect(page.getByRole('heading', { name: 'Emergency' })).toBeVisible();
    await page.getByRole('button', { name: 'Raise SOS' }).click();
    await page.getByRole('button', { name: 'Send SOS now' }).click();
    await expect(page.getByText(/SOS sent/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Security SOS').or(page.getByText('Medical SOS')).first()).toBeVisible();
  });

  test('admin sees the live SOS, responds and resolves it', async ({ page }) => {
    await login(page, admin.email, admin.password, /\/app/);
    await expect(page.getByRole('alert')).toContainText(/live SOS/);
    await page.goto('/app/emergency');
    await expect(page.getByRole('heading', { name: 'Emergency' })).toBeVisible();
    await page.getByRole('button', { name: /responding/ }).first().click();
    await expect(page.getByText('They know you are coming')).toBeVisible();
    await page.getByRole('button', { name: 'Resolve', exact: true }).first().click();
    await page.getByPlaceholder('What was done').fill('Guard checked the gate; false trigger.');
    await page.getByRole('button', { name: 'Resolved', exact: true }).click();
    await expect(page.getByText('No active SOS or emergency notice. Good.')).toBeVisible({ timeout: 15_000 });
  });

  test('admin adds a stock item and issues stock', async ({ page }) => {
    await login(page, admin.email, admin.password, /\/app/);
    await page.goto('/app/inventory');
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
    await page.getByRole('button', { name: 'New item' }).first().click();
    await page.getByLabel('Name *').fill('LED bulb 9W');
    await page.locator('#it-cat').click();
    await page.getByRole('option', { name: 'Electrical spares' }).click();
    await page.getByLabel('Opening stock').fill('10');
    await page.getByRole('button', { name: 'Add item' }).click();
    await expect(page.getByText('Item added')).toBeVisible();
    await page.getByRole('cell', { name: /LED bulb 9W/ }).click();
    await page.getByRole('button', { name: 'Issue' }).click();
    await page.getByLabel(/Quantity/).fill('3');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Stock now 7/)).toBeVisible();
  });
});
