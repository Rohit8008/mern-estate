// @ts-check
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config({ path: '.env.e2e' });

module.exports = defineConfig({
  testDir: './e2e/tests',
  // Run all tests in sequence — prevents race conditions on shared DB
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    process.env.CI ? ['github'] : ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // 1. Auth setup — logs in as admin, saves cookie state
    {
      name: 'setup',
      testDir: './e2e',
      testMatch: /auth\.setup\.js/,
    },
    // 2. CRM tests — run with saved admin auth state
    {
      name: 'crm',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.spec\.js/,
    },
    // 3. Auth tests — run WITHOUT saved state (test login/logout flows)
    {
      name: 'auth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /auth\.spec\.js/,
    },
  ],
});
