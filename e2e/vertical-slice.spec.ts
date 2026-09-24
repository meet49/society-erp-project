import { test, expect, type Page } from '@playwright/test';

const SUPER = { email: 'superadmin@societyerp.local', password: 'SuperAdmin@123' };
const stamp = Date.now();
const society = { name: `Palm Grove ${stamp}`, city: 'Pune' };
const admin = { name: 'Asha Owner', email: `asha-${stamp}@example.com`, password: 'Owner@12345' };
const manager = { name: 'Facility Person', email: `facility-${stamp}@example.com`, password: 'Facility@123' };

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // the session (refresh token) is stored once the app has navigated away from /login
  await expect(page).toHaveURL(/\/(app|admin)/);
}

test.describe.serial('vertical slice: landing → signup → society → role → user → login → navigation → authorization', () => {
  test('public landing and pricing come from the database', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/housing society/i);
    await page.goto('/pricing');
    await expect(page.getByText('Starter', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Growth', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Monthly' }).click();
    await expect(page.getByText(/1,499/).first()).toBeVisible();
    await page.getByRole('button', { name: /Annual/ }).click();
    await expect(page.getByText(/1,249/).first()).toBeVisible();
  });

  test('a society signs up, lands in the setup wizard and creates structure', async ({ page }) => {
    await page.goto('/signup?plan=growth');
    await page.getByLabel('Society name').fill(society.name);
    await page.getByLabel('City').fill(society.city);
    await page.getByLabel('Your name').fill(admin.name);
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password').fill(admin.password);
    await page.getByText('I agree to the terms').click();
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await expect(page).toHaveURL(/\/app\/onboarding/);
    await expect(page.getByRole('heading', { name: 'Society setup' })).toBeVisible();
    // step 1 → 2
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.getByRole('heading', { name: /Buildings, towers/ })).toBeVisible();
    await page.getByPlaceholder('Tower A').fill('Tower A');
    await page.getByPlaceholder('A', { exact: true }).fill('A');
    await page.getByRole('button', { name: 'Add building' }).click();
    await expect(page.getByText('Tower A (A)')).toBeVisible();
    await page.getByRole('button', { name: /Continue/ }).click();
    // step 3 generate units
    await expect(page.getByRole('heading', { name: 'Generate units' })).toBeVisible();
    await page.getByLabel('Floor to').fill('2');
    await page.getByLabel('Units per floor').fill('3');
    await page.getByRole('button', { name: 'Generate units' }).click();
    await expect(page.getByText('6 units created').first()).toBeVisible();
    // finish quickly
    for (const heading of ['Billing basics', 'Modules', 'Roles', 'Invite your committee', 'Notification channels']) {
      await page.getByRole('button', { name: /Continue/ }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByRole('button', { name: 'Go to dashboard' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('Units', { exact: true }).first()).toBeVisible();
  });

  test('admin creates a custom role and a user with that role', async ({ page }) => {
    await login(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/app/settings/roles');
    await page.getByRole('button', { name: 'New role' }).click();
    await page.getByPlaceholder('e.g. Treasurer').fill('Facility Manager');
    await page.getByLabel('All Units & Buildings permissions').check();
    await page.getByLabel('All Helpdesk & Complaints permissions').check();
    await page.getByRole('button', { name: 'Create role' }).click();
    await expect(page.getByText('Facility Manager').first()).toBeVisible();

    await page.goto('/app/settings/users');
    await page.getByRole('button', { name: 'Add user' }).click();
    await page.getByRole('tab', { name: 'Create directly' }).click();
    await page.getByLabel('Name *').fill(manager.name);
    await page.getByLabel('Email *').fill(manager.email);
    await page.getByLabel('Password (optional)').fill(manager.password);
    await page.getByText('Facility Manager', { exact: true }).click();
    await page.getByRole('button', { name: 'Create user' }).click();
    await expect(page.getByText(`Account created for ${manager.email}`)).toBeVisible();
  });

  test('the new user sees only permitted navigation and the API rejects the rest', async ({ page }) => {
    await login(page, manager.email, manager.password);
    await expect(page).toHaveURL(/\/app$/);
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByText('Units', { exact: true })).toBeVisible();
    await expect(nav.getByText('Billing', { exact: true })).toHaveCount(0);
    await expect(nav.getByText('Roles & Permissions')).toHaveCount(0);
    // UI gate for a manually entered admin route
    await page.goto('/app/settings/users');
    await expect(page.getByText('Access restricted')).toBeVisible();
    // API is the real boundary: a direct request with this user's own token is rejected with 403
    const loginRes = await page.request.post('http://localhost:4100/api/v1/auth/login', { data: { email: manager.email, password: manager.password } });
    const token = (await loginRes.json()).data.accessToken as string;
    const res = await page.request.get('http://localhost:4100/api/v1/society/users', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe('PERMISSION_DENIED');
    const ok = await page.request.get('http://localhost:4100/api/v1/units', { headers: { Authorization: `Bearer ${token}` } });
    expect(ok.status()).toBe(200);
    // units page works and lists generated units
    await page.goto('/app/units');
    await expect(page.getByText('A-101')).toBeVisible();
  });

  test('super admin edits the landing hero and the public site reflects it after publishing', async ({ page }) => {
    await login(page, SUPER.email, SUPER.password);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText('Total societies')).toBeVisible();
    await page.goto('/admin/website/landing');
    const heroRow = page.getByTestId('landing-section-hero');
    await heroRow.getByRole('button', { name: 'Edit' }).click();
    const title = `Run ${society.name} on autopilot`;
    await page.getByLabel('Title').first().fill(title);
    await page.getByRole('button', { name: 'Save & publish' }).click();
    await expect(page.getByText('Published to the live site')).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
  });

  test('super admin sees the new society and its trial subscription', async ({ page }) => {
    await login(page, SUPER.email, SUPER.password);
    await page.goto('/admin/societies');
    await page.getByPlaceholder('Search name, city, email…').fill(society.name);
    await expect(page.getByRole('link', { name: society.name })).toBeVisible();
    await page.getByRole('link', { name: society.name }).click();
    await page.getByRole('tab', { name: 'Subscription' }).click();
    await expect(page.locator('main').getByText('Trialing').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Modules' }).click();
    await expect(page.getByText('Visitors & Gate')).toBeVisible();
  });
});
