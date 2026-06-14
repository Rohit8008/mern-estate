// Authentication flows — sign-in, forgot-password, route guards, sign-out.
// Runs WITHOUT saved auth state so we can test login/logout from scratch.
const { test, expect } = require('@playwright/test');

// Ensure no prior auth state bleeds in
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Sign In', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  });

  test('renders all sign-in form elements', async ({ page }) => {
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
    await expect(page.getByText(/forgot password/i)).toBeVisible();
  });

  test('shows validation error for empty form submission', async ({ page }) => {
    await page.getByRole('button', { name: /^sign in$/i }).click();
    // Browser native validation prevents submission — email field is required
    const emailInput = page.locator('#email');
    const validationMsg = await emailInput.evaluate((el) => el.validationMessage);
    expect(validationMsg).toBeTruthy();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.locator('#email').fill('nobody@example.com');
    await page.locator('#password').fill('wrongpassword123');
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(
      page.getByText(/invalid|incorrect|not found|wrong|credentials/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('successful login redirects away from sign-in page', async ({ page }) => {
    await page.locator('#email').fill(process.env.E2E_ADMIN_EMAIL);
    await page.locator('#password').fill(process.env.E2E_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).not.toHaveURL(/sign-in/, { timeout: 20_000 });
  });

  test('forgot password link navigates correctly', async ({ page }) => {
    await page.getByText(/forgot password/i).click();
    await expect(page).toHaveURL('/forgot-password');
  });
});

test.describe('Forgot Password', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password');
  });

  test('shows email step on load', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /forgot password/i })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.getByRole('button', { name: /send otp/i })).toBeVisible();
  });

  test('back to sign in link works', async ({ page }) => {
    await page.getByText(/back to sign in/i).click();
    await expect(page).toHaveURL('/sign-in');
  });

  test('shows OTP input after submitting a valid email', async ({ page }) => {
    await page.locator('#email').fill(process.env.E2E_ADMIN_EMAIL);
    await page.getByRole('button', { name: /send otp/i }).click();
    // Step 2 renders with the OTP input field
    await expect(page.locator('#otp')).toBeVisible({ timeout: 15_000 });
  });

  test('shows error for non-existent email', async ({ page }) => {
    await page.locator('#email').fill('doesnotexist_' + Date.now() + '@example.com');
    await page.getByRole('button', { name: /send otp/i }).click();
    await expect(
      page.getByText(/not found|no account|error|invalid/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Protected Route Guards', () => {
  test('redirects unauthenticated user from /dashboard to /sign-in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/sign-in/, { timeout: 10_000 });
  });

  test('redirects unauthenticated user from /properties to /sign-in', async ({ page }) => {
    await page.goto('/properties');
    await expect(page).toHaveURL(/sign-in/, { timeout: 10_000 });
  });

  test('redirects unauthenticated user from /clients to /sign-in', async ({ page }) => {
    await page.goto('/clients');
    await expect(page).toHaveURL(/sign-in/, { timeout: 10_000 });
  });

  test('redirects unauthenticated user from /admin to /sign-in', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/sign-in|unauthorized/, { timeout: 10_000 });
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-abc123');
    await expect(page.getByText(/not found|404/i)).toBeVisible();
  });
});

test.describe('Sign Out', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in first
    await page.goto('/sign-in');
    await page.locator('#email').fill(process.env.E2E_ADMIN_EMAIL);
    await page.locator('#password').fill(process.env.E2E_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).not.toHaveURL(/sign-in/, { timeout: 20_000 });
  });

  test('sign out from profile clears session and redirects', async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('button', { name: /sign out/i }).click();
    // After sign out, should be back on sign-in or home
    await expect(page).toHaveURL(/sign-in|\/$/, { timeout: 10_000 });
  });

  test('cannot access protected route after sign out', async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).not.toHaveURL(/profile/, { timeout: 10_000 });
    // Navigating back to protected route should redirect to sign-in
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/sign-in/, { timeout: 10_000 });
  });
});
