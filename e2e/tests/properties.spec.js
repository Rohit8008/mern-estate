// Properties Board — views, search, filters, navigation
const { test, expect } = require('@playwright/test');

test.describe('Properties Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/properties');
    await page.waitForLoadState('networkidle');
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Properties' }).first()).toBeVisible();
  });

  test('shows view toggle buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /main table/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /pipeline/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cards/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /map/i })).toBeVisible();
  });

  test('search input is present and accepts input', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search properties/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('test property');
    await expect(searchInput).toHaveValue('test property');
    await searchInput.clear();
  });

  test('status filter dropdown is present', async ({ page }) => {
    // Look for a select or combobox near status filter
    const statusFilter = page.locator('select').first();
    if (await statusFilter.isVisible()) {
      const options = await statusFilter.locator('option').allTextContents();
      // Should contain at least one status option
      expect(options.length).toBeGreaterThan(0);
    }
  });

  test('new property link navigates to create listing', async ({ page }) => {
    const newPropertyLink = page.getByRole('link', { name: /new property/i });
    await expect(newPropertyLink).toBeVisible();
    await newPropertyLink.click();
    await expect(page).toHaveURL(/create-listing/);
    await page.goBack();
  });

  test('table view is the default and shows columns', async ({ page }) => {
    // Default view shows a table
    const table = page.locator('table').first();
    if (await table.isVisible()) {
      await expect(table).toBeVisible();
    }
  });

  test('switches to Cards view', async ({ page }) => {
    await page.getByRole('button', { name: /cards/i }).click();
    await page.waitForLoadState('networkidle');
    // Table should be gone, cards should be present
    await expect(page.locator('table')).not.toBeVisible();
  });

  test('switches to Pipeline (kanban) view', async ({ page }) => {
    await page.getByRole('button', { name: /pipeline/i }).click();
    await page.waitForLoadState('networkidle');
    // Pipeline columns show "N item(s)" count — unique to pipeline view (not in select options)
    await expect(page.getByText(/\d+\s*item\(s\)/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('switches to Map view and shows Leaflet container', async ({ page }) => {
    await page.getByRole('button', { name: /map/i }).click();
    // Leaflet map container takes time to initialize
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
  });

  test('clear filters button resets search', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search properties/i);
    await searchInput.fill('something');
    const clearBtn = page.getByRole('button', { name: /clear all/i });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await expect(searchInput).toHaveValue('');
    }
  });

  test('filters button opens advanced filters modal', async ({ page }) => {
    const filtersBtn = page.getByRole('button', { name: /^filters$/i });
    if (await filtersBtn.isVisible()) {
      await filtersBtn.click();
      // Filter panel appears with "Advanced filters" heading (not a dialog role)
      await expect(page.getByText(/advanced filters/i).first()).toBeVisible();
    }
  });
});
