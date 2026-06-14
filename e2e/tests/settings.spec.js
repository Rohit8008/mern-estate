// Settings page — notification toggles, privacy settings, appearance, security
const { test, expect } = require('@playwright/test');

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  });

  test('renders settings page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /settings/i }).first()
    ).toBeVisible();
  });

  test('shows Notifications menu item', async ({ page }) => {
    await expect(page.getByText(/notifications/i).first()).toBeVisible();
  });

  test('shows Privacy menu item', async ({ page }) => {
    await expect(page.getByText(/privacy/i).first()).toBeVisible();
  });

  test('shows Security menu item', async ({ page }) => {
    await expect(page.getByText(/security/i)).toBeVisible();
  });

  test('shows Appearance menu item', async ({ page }) => {
    await expect(page.getByText(/appearance/i)).toBeVisible();
  });

  test('notifications section shows email toggles', async ({ page }) => {
    // Click Notifications if it's a sidebar link
    const notifLink = page.getByText(/notifications/i).first();
    await notifLink.click();

    await expect(
      (page.getByText(/email.*messages|messages.*email/i)
        .or(page.getByText(/email notifications/i)))
        .first()
    ).toBeVisible();
  });

  test('can toggle a notification setting', async ({ page }) => {
    const notifLink = page.getByText(/notifications/i).first();
    await notifLink.click();

    // Find first toggle/checkbox
    const toggle = page.locator('input[type="checkbox"]').first();
    if (await toggle.isVisible()) {
      const initialState = await toggle.isChecked();
      await toggle.click();
      // State should change
      await expect(toggle).toHaveChecked(!initialState, { timeout: 3_000 });
      // Revert
      await toggle.click();
    }
  });

  test('privacy section is navigable', async ({ page }) => {
    await page.getByText(/privacy/i).first().click();
    await expect(
      page.getByText(/show email|show phone|online status|allow messages/i).first()
    ).toBeVisible();
  });

  test('appearance section shows theme options', async ({ page }) => {
    await page.getByText(/appearance/i).click();
    await expect(
      page.getByText(/theme|dark|light|system/i).first()
    ).toBeVisible();
  });

  test('save settings button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /save settings|save/i })
    ).toBeVisible();
  });

  test('sign out all devices button is present in security section', async ({ page }) => {
    await page.getByText(/security/i).click();
    await expect(
      page.getByRole('button', { name: /sign out all|sign out.*devices/i })
    ).toBeVisible();
  });
});
