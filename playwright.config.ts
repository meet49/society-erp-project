import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a fresh API (ephemeral embedded MongoDB, NODE_ENV=test) and the Vite dev server.
 * Both are started automatically; set E2E_REUSE=1 to reuse already running servers.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: './apps/api',
      url: 'http://localhost:4100/api/v1/health',
      reuseExistingServer: Boolean(process.env.E2E_REUSE),
      timeout: 240_000,
      env: {
        NODE_ENV: 'test',
        PORT: '4100',
        LOG_LEVEL: 'silent',
        MONGODB_URI: '',
        MONGODB_DB_NAME: 'society_erp_e2e',
        REDIS_URL: '',
        JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdef',
        JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef',
        SIGNED_URL_SECRET: 'e2e-signed-url-secret-0123456789',
        ENCRYPTION_KEY: 'e2e-encryption-key-0123456789abcdef0123456789',
        BCRYPT_ROUNDS: '4',
        APP_URL: 'http://localhost:5174',
        CORS_ORIGINS: 'http://localhost:5174',
        SEED_SUPER_ADMIN_EMAIL: 'superadmin@societyerp.local',
        SEED_SUPER_ADMIN_PASSWORD: 'SuperAdmin@123',
        EMAIL_DRIVER: 'console',
        PAYMENT_DRIVER: 'mock',
      },
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      cwd: './apps/web',
      url: 'http://localhost:5174',
      reuseExistingServer: Boolean(process.env.E2E_REUSE),
      timeout: 120_000,
    },
  ],
});
