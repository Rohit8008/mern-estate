// Global auth setup — logs in as admin once and saves the session.
// All CRM test files reuse this state via storageState in playwright.config.js.
const { test: setup, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.join(__dirname, '.auth');
const adminFile = path.join(AUTH_DIR, 'admin.json');

setup.beforeAll(() => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

setup('authenticate as admin', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set.\n' +
      'Copy .env.e2e.example → .env.e2e and fill in credentials.'
    );
  }

  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // Successful login redirects away from /sign-in
  await expect(page).not.toHaveURL(/sign-in/, { timeout: 20_000 });

  // Save the authenticated cookie state
  await page.context().storageState({ path: adminFile });
  console.log(`Admin auth state saved to ${adminFile}`);
});
