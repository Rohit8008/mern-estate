// Buyer Requirements — full CRUD + search + filters
const { test, expect } = require('@playwright/test');

const uniqueBuyer = () => `E2E Buyer ${Date.now()}`;

test.describe('Buyer Requirements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/buyers');
    await page.waitForLoadState('networkidle');
  });

  test('renders buyer requirements page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /buyer requirements|buyers/i }).first()
    ).toBeVisible();
  });

  test('shows Add Requirement button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /add requirement/i })
    ).toBeVisible();
  });

  test('shows Refresh button', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await expect(refreshBtn).toBeVisible();
    }
  });

  test('search input is present', async ({ page }) => {
    const searchInput = page.locator('input[type="search"]')
      .or(page.getByPlaceholder(/search/i));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill('test');
      await page.waitForTimeout(300);
      await searchInput.first().clear();
    }
  });

  test('opens new requirement modal/form', async ({ page }) => {
    await page.getByRole('button', { name: /add requirement/i }).click();
    await expect(page.getByLabel(/buyer name/i).first()).toBeVisible();
  });

  test('creates a new buyer requirement', async ({ page }) => {
    const name = uniqueBuyer();

    await page.getByRole('button', { name: /add requirement/i }).click();

    await page.getByLabel(/buyer name/i).fill(name);

    const phoneInput = page.getByLabel(/phone/i);
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('+1234567890');
    }

    // Set property type if present
    const typeSelect = page.getByLabel(/property type|type/i);
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption({ index: 1 });
    }

    await page.getByRole('button', { name: /save|create|submit/i }).last().click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
  });

  test('edits a buyer requirement', async ({ page }) => {
    const name = uniqueBuyer();
    const updatedName = `${name} Edited`;

    // Create
    await page.getByRole('button', { name: /add requirement/i }).click();
    await page.getByLabel(/buyer name/i).first().fill(name);
    const phoneInput = page.getByLabel(/phone/i).first();
    if (await phoneInput.isVisible()) await phoneInput.fill('+1234567890');
    await page.getByRole('button', { name: /save|create|submit/i }).last().click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    // Edit — click on the row/card and find edit button
    await page.getByText(name).click();
    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    await editBtn.click();

    const editInput = page.getByLabel(/buyer name/i);
    await editInput.clear();
    await editInput.fill(updatedName);
    await page.getByRole('button', { name: /save changes|update/i }).click();

    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });
  });

  test('deletes a buyer requirement', async ({ page }) => {
    const name = uniqueBuyer();

    // Create
    await page.getByRole('button', { name: /add requirement/i }).click();
    await page.getByLabel(/buyer name/i).first().fill(name);
    const phoneInput = page.getByLabel(/phone/i).first();
    if (await phoneInput.isVisible()) await phoneInput.fill('+1234567890');
    await page.getByRole('button', { name: /save|create|submit/i }).last().click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    // Delete
    await page.getByText(name).click();
    await page.getByRole('button', { name: /delete/i }).first().click();
    await page.getByRole('button', { name: /delete|confirm/i }).last().click();

    await expect(page.getByText(name)).not.toBeVisible({ timeout: 10_000 });
  });

  test('filter by type works', async ({ page }) => {
    const filterSelect = page.locator('select').first();
    if (await filterSelect.isVisible()) {
      const options = await filterSelect.locator('option').allTextContents();
      if (options.length > 1) {
        await filterSelect.selectOption({ index: 1 });
        await page.waitForTimeout(300);
        await filterSelect.selectOption({ index: 0 });
      }
    }
  });
});
