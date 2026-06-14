// Owners Board (property owners) — full CRUD + search
const { test, expect } = require('@playwright/test');

const uniqueName = () => `E2E Owner ${Date.now()}`;

test.describe('Owners Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/owners');
    await page.waitForLoadState('networkidle');
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /property owners/i }).first()).toBeVisible();
  });

  test('shows Add Owner button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add owner/i })).toBeVisible();
  });

  test('search input is present', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search by name/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('test');
    await expect(searchInput).toHaveValue('test');
    await searchInput.clear();
  });

  test('owners table shows expected columns', async ({ page }) => {
    const table = page.locator('table');
    if (await table.isVisible()) {
      // Check for header labels
      await expect(page.getByText(/name/i).first()).toBeVisible();
      await expect(page.getByText(/contact/i)).toBeVisible();
    }
  });

  test('opens Add Owner modal', async ({ page }) => {
    await page.getByRole('button', { name: /add owner/i }).click();
    await expect(page.getByPlaceholder('John Smith')).toBeVisible();
  });

  test('creates a new owner', async ({ page }) => {
    const name = uniqueName();

    await page.getByRole('button', { name: /add owner/i }).click();
    await page.getByPlaceholder('John Smith').fill(name);
    await page.getByPlaceholder('owner@example.com').fill('e2e_owner@playwright.dev');
    await page.getByPlaceholder('+91 98765 43210').fill('+9876543210');
    await page.getByPlaceholder('Acme Realty Ltd.').fill('E2E Realty');

    await page.getByRole('button', { name: /add owner|save/i }).last().click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
  });

  test('edits an existing owner', async ({ page }) => {
    const name = uniqueName();
    const updatedName = `${name} Edited`;

    // Create first
    await page.getByRole('button', { name: /add owner/i }).click();
    await page.getByPlaceholder('John Smith').fill(name);
    await page.getByRole('button', { name: /add owner|save/i }).last().click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    // Find edit button for this row
    const row = page.getByRole('row').filter({ hasText: name });
    await row.getByRole('button', { name: /edit/i }).click();

    const nameInput = page.getByPlaceholder('John Smith');
    await nameInput.clear();
    await nameInput.fill(updatedName);
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });
  });

  test('deletes an owner with confirmation', async ({ page }) => {
    const name = uniqueName();

    // Create
    await page.getByRole('button', { name: /add owner/i }).click();
    await page.getByPlaceholder('John Smith').fill(name);
    await page.getByRole('button', { name: /add owner|save/i }).last().click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    // Delete
    const row = page.getByRole('row').filter({ hasText: name });
    await row.getByRole('button', { name: /delete/i }).click();
    // Confirm
    await page.getByRole('button', { name: /delete|confirm/i }).last().click();
    await expect(page.getByText(name)).not.toBeVisible({ timeout: 10_000 });
  });

  test('cancel button closes the modal without saving', async ({ page }) => {
    await page.getByRole('button', { name: /add owner/i }).click();
    await page.getByPlaceholder('John Smith').fill('Should Not Be Saved');
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Should Not Be Saved')).not.toBeVisible();
  });
});
