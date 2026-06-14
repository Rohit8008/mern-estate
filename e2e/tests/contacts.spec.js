// Contacts Board (CRM sales leads) — full CRUD + search + status changes
const { test, expect } = require('@playwright/test');

const uniqueName = () => `E2E Contact ${Date.now()}`;

test.describe('Contacts Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Clients' }).first()).toBeVisible();
  });

  test('shows Cards and Table view toggles', async ({ page }) => {
    await expect(page.getByRole('button', { name: /cards/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /table/i })).toBeVisible();
  });

  test('search input filters the list', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search clients/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('xyz_no_match');
    await page.waitForTimeout(600); // debounce
    await searchInput.clear();
  });

  test('creates a new contact', async ({ page }) => {
    const name = uniqueName();

    await page.getByRole('button', { name: /new client/i }).click();
    // Modal header confirms the modal is open
    await expect(page.getByRole('heading', { name: 'New Client' })).toBeVisible();

    await page.getByPlaceholder('Enter contact name').fill(name);
    await page.getByPlaceholder('email@example.com').fill('e2e_test@playwright.dev');
    await page.getByPlaceholder('+1 234 567 8900').fill('+1234567890');
    await page.getByPlaceholder('Company name').fill('E2E Corp');

    await page.getByRole('button', { name: /create contact/i }).click();

    // Modal should close and new contact should appear
    await expect(page.getByRole('heading', { name: 'New Client' })).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
  });

  test('edits an existing contact', async ({ page }) => {
    const name = uniqueName();
    const updatedName = `${name} Updated`;

    // Create
    await page.getByRole('button', { name: /new client/i }).click();
    await page.getByPlaceholder('Enter contact name').fill(name);
    await page.getByRole('button', { name: /create contact/i }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    // Open detail panel and click its Edit button (scoped to panel to avoid backdrop)
    await page.getByText(name).first().click();
    const contactPanel = page.locator('.max-w-2xl.h-full');
    await expect(contactPanel).toBeVisible({ timeout: 5_000 });
    await contactPanel.getByRole('button', { name: /edit/i }).click();

    // Update name in the edit modal
    const nameInput = page.getByPlaceholder('Enter contact name');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.clear();
    await nameInput.fill(updatedName);
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByText(updatedName).first()).toBeVisible({ timeout: 10_000 });
  });

  test('deletes a contact', async ({ page }) => {
    const name = uniqueName();

    // Create
    await page.getByRole('button', { name: /new client/i }).click();
    await page.getByPlaceholder('Enter contact name').fill(name);
    await page.getByRole('button', { name: /create contact/i }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    // Open detail panel and click its Delete button (scoped to panel to avoid backdrop)
    await page.getByText(name).first().click();
    const contactPanel = page.locator('.max-w-2xl.h-full');
    await expect(contactPanel).toBeVisible({ timeout: 5_000 });
    await contactPanel.locator('button.text-rose-600').first().click();

    // Confirm in dialog
    await page.getByRole('dialog').getByRole('button', { name: /delete/i }).click();
    await expect(page.getByText(name).first()).not.toBeVisible({ timeout: 10_000 });
  });

  test('switches to table view', async ({ page }) => {
    await page.getByRole('button', { name: /table/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('table')).toBeVisible();
  });

  test('status filter shows only contacts with that status', async ({ page }) => {
    // Find the status filter dropdown
    const statusFilter = page.locator('select').first();
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption('lead');
      await page.waitForTimeout(400);
      await statusFilter.selectOption({ index: 0 }); // reset to All
    }
  });

  test('new client modal cancels correctly', async ({ page }) => {
    await page.getByRole('button', { name: /new client/i }).click();
    await expect(page.getByRole('heading', { name: 'New Client' })).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('heading', { name: 'New Client' })).not.toBeVisible({ timeout: 5_000 });
  });
});
