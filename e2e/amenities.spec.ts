import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Amenity bookings end-to-end: a resident books a free gym slot; a party-hall request goes through
 * committee approval and is paid online through the demo gateway; the committee sees the pipeline.
 */
const API = 'http://localhost:4100/api/v1';
const stamp = Date.now();
const admin = { name: 'Meera Admin', email: `meera-${stamp}@example.com`, password: 'Admin@12345' };
const member = { name: 'Rohan Resident', email: `rohan-${stamp}@example.com`, password: 'Resident@123' };
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

test.describe.serial('amenities & bookings', () => {
  test('setup: society, unit, resident, amenities and the demo gateway', async ({ request }) => {
    const cfg = await api(request, 'get', '/public/signup/config');
    const planId = cfg.body.data.plans.find((p: any) => p.slug === 'growth')?.id ?? cfg.body.data.defaultPlanId;
    const signup = await api(request, 'post', '/public/signup', undefined, { society: { name: `Sunrise Towers ${stamp}`, city: 'Hyderabad' }, admin, planId, billingCycle: 'MONTHLY', acceptTerms: true });
    expect(signup.status).toBe(201);
    adminToken = signup.body.data.accessToken;
    const building = await api(request, 'post', '/buildings', adminToken, { name: 'Tower A', code: 'A', floors: 2 });
    const unit = await api(request, 'post', '/units', adminToken, { buildingId: building.body.data.id, floor: 1, number: '101' });
    const roles = (await api(request, 'get', '/society/roles', adminToken)).body.data;
    const resident = await api(request, 'post', '/residents', adminToken, { unitId: unit.body.data.id, name: member.name, email: member.email, phone: '9000000601', type: 'OWNER', isPrimary: true });
    const invite = await api(request, 'post', `/residents/${resident.body.data.id}/invite`, adminToken, { roleIds: [roles.find((r: any) => r.key === 'MEMBER').id] });
    const accepted = await api(request, 'post', '/auth/invitations/accept', undefined, { token: invite.body.data.inviteUrl.split('token=')[1], password: member.password });
    expect(accepted.status).toBe(200);
    expect((await api(request, 'post', '/amenities', adminToken, { name: 'Gym', typeKey: 'GYM', capacity: 5, schedule: { openTime: '06:00', closeTime: '22:00', maxSlotsPerBooking: 2 } })).status).toBe(201);
    expect((await api(request, 'post', '/amenities', adminToken, { name: 'Party Hall', typeKey: 'HALL', bookingMode: 'FULL_DAY', requiresApproval: true, maxGuests: 100, pricing: { mode: 'PER_BOOKING', amount: 1500, deposit: 500 }, schedule: { openTime: '09:00', closeTime: '22:00' } })).status).toBe(201);
    const gw = await api(request, 'put', '/payments/gateway', adminToken, { provider: 'mock', enabled: true, keyId: 'mock_key', keySecret: 'mock-payment-secret', testMode: true });
    expect(gw.status).toBe(200);
  });

  test('resident books a free gym slot from My Amenities', async ({ page }) => {
    await login(page, member.email, member.password, /\/app/);
    await page.goto('/app/my/amenities');
    await expect(page.getByRole('heading', { name: 'Amenities' })).toBeVisible();
    await page.getByRole('button', { name: 'Book', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toContainText('Book Gym');
    await page.locator('[data-testid="slot"]:enabled').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Book', exact: true }).click();
    await expect(page.getByText('Booked!')).toBeVisible();
    await expect(page.getByText('My bookings')).toBeVisible();
    await expect(page.getByText(/^Confirmed$/).first()).toBeVisible();
    await expect(page.getByText('Free').first()).toBeVisible();
  });

  test('a hall request is approved by the committee and paid online through the demo gateway', async ({ page, request }) => {
    await login(page, member.email, member.password, /\/app/);
    await page.goto('/app/my/amenities');
    await page.getByRole('button', { name: 'Book', exact: true }).nth(1).click();
    await expect(page.getByRole('dialog')).toContainText('Book Party Hall');
    const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Date').fill(date);
    await page.locator('[data-testid="slot"]:enabled').first().click();
    await page.getByLabel(/Guests/).fill('40');
    await expect(page.getByRole('dialog')).toContainText('₹2,000');
    await page.getByRole('button', { name: 'Request booking' }).click();
    await expect(page.getByText('Request sent for approval')).toBeVisible();
    await expect(page.getByText(/pending approval/i).first()).toBeVisible();
    // the committee decides through the approvals API (the Approvals page itself is covered elsewhere)
    const pending = await api(request, 'get', '/approvals?entityType=AmenityBooking', adminToken);
    expect(pending.body.data).toHaveLength(1);
    expect((await api(request, 'post', `/approvals/${pending.body.data[0].id}/decide`, adminToken, { decision: 'APPROVED', note: 'Have fun' })).status).toBe(200);
    await page.reload();
    await page.getByRole('button', { name: /^Pay ₹/ }).first().click();
    await expect(page.getByRole('dialog')).toContainText('demo gateway');
    await page.getByRole('dialog').getByRole('button', { name: /^Pay ₹/ }).click();
    await expect(page.getByText('Payment successful')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(/Paid ₹2,000/).first()).toBeVisible();
    await expect(page.getByText(/^Confirmed$/).nth(1)).toBeVisible();
  });

  test('the committee sees the booking pipeline and the money trail', async ({ page }) => {
    await login(page, admin.email, admin.password, /\/app/);
    await page.goto('/app/amenities');
    await expect(page.getByRole('heading', { name: 'Amenities' })).toBeVisible();
    await expect(page.getByText(/BK\//).first()).toBeVisible();
    await page.getByText(/BK\//).first().click();
    await expect(page.getByRole('heading', { name: /Booking BK\// })).toBeVisible();
    await expect(page.getByText('Money')).toBeVisible();
    await expect(page.getByText(/INV\//).first()).toBeVisible();
  });
});
