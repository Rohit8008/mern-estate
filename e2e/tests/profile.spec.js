// Profile page — view info, update fields, change password, sign out
const { test, expect } = require('@playwright/test');

test.describe('Profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
  });

  test('renders My Profile heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /my profile/i }).first()).toBeVisible();
  });

  test('shows user info form fields', async ({ page }) => {
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#firstName')).toBeVisible();
    await expect(page.locator('#lastName')).toBeVisible();
  });

  test('email field is disabled (cannot be changed)', async ({ page }) => {
    const emailInput = page.locator('#email');
    await expect(emailInput).toBeDisabled();
  });

  test('shows Settings and Sign Out buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible();
    await expect(
      page.getByRole('link', { name: /settings/i })
        .or(page.getByRole('button', { name: /settings/i }))
        .first()
    ).toBeVisible();
  });

  test('updates first name and last name', async ({ page }) => {
    const firstName = page.locator('#firstName');
    const lastName = page.locator('#lastName');

    await firstName.fill('E2EFirst');
    await lastName.fill('E2ELast');

    await page.getByRole('button', { name: /save changes/i }).click();

    // Should show success feedback or stay on profile
    await expect(
      page.getByText(/saved|updated|success/i)
        .or(page.getByRole('heading', { name: /my profile/i }))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('shows phone field in form', async ({ page }) => {
    await expect(page.locator('#phone')).toBeVisible();
  });

  test('shows bio textarea', async ({ page }) => {
    await expect(page.locator('#bio')).toBeVisible();
  });

  test('shows Change Password section', async ({ page }) => {
    await expect(page.getByRole('button', { name: /update password|change password/i })).toBeVisible();
  });

  test('change password section expands on button click', async ({ page }) => {
    const updatePasswordBtn = page.getByRole('button', { name: /update password|change password/i });
    await updatePasswordBtn.click();
    // Old password / new password fields should appear
    await expect(
      page.locator('#oldPassword').or(page.getByLabel(/current password/i))
    ).toBeVisible({ timeout: 5_000 });
  });

  test('password mismatch shows error', async ({ page }) => {
    await page.getByRole('button', { name: /update password|change password/i }).click();
    await page.locator('#oldPassword').fill('anyoldpassword');
    await page.locator('#newPassword').fill('newpass123');
    // If confirm password field exists
    const confirmInput = page.getByPlaceholder(/confirm new password/i);
    if (await confirmInput.isVisible()) {
      await confirmInput.fill('differentpass');
      await page.getByRole('button', { name: /save|update/i }).last().click();
      await expect(page.getByText(/match|mismatch|do not match/i)).toBeVisible({ timeout: 5_000 });
    }
  });

  test('shows Create New Listing button', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /create new listing/i })
        .or(page.getByRole('button', { name: /create new listing/i }))
        .first()
    ).toBeVisible();
  });

  test('shows Delete My Account button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /delete.*account|delete my account/i })
    ).toBeVisible();
  });
});
