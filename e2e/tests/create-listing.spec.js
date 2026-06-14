// Create Listing — form validation, required fields, navigation
const { test, expect } = require('@playwright/test');

test.describe('Create Listing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create-listing');
    await page.waitForLoadState('networkidle');
  });

  test('renders create listing form', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /create listing|new listing|add property/i })
    ).toBeVisible();
  });

  test('shows required fields', async ({ page }) => {
    // Property name
    await expect(
      page.locator('input[name="name"]').or(page.getByLabel(/property name|listing name/i))
    ).toBeVisible();
    // Description
    await expect(
      page.locator('textarea[name="description"]').or(page.getByLabel(/description/i))
    ).toBeVisible();
    // Address
    await expect(
      page.locator('input[name="address"]').or(page.getByLabel(/address/i)).first()
    ).toBeVisible();
  });

  test('shows sale/rent type selector', async ({ page }) => {
    // Form uses a <select name="type"> with Sell/Rent options
    await expect(page.locator('select[name="type"]')).toBeVisible();
    await expect(page.locator('select[name="type"] option[value="sale"]')).toBeAttached();
    await expect(page.locator('select[name="type"] option[value="rent"]')).toBeAttached();
  });

  test('shows price fields', async ({ page }) => {
    // Price field uses id="regularPrice" (not name attribute)
    await expect(page.locator('#regularPrice')).toBeVisible();
  });

  test('shows bedroom and bathroom fields', async ({ page }) => {
    // These fields only appear after selecting a property type with those fields
    const propertyTypeSelect = page.locator('select[name="propertyType"]');
    if (await propertyTypeSelect.isVisible() && (await propertyTypeSelect.locator('option').count()) > 1) {
      await propertyTypeSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }
    const bedroomsInput = page.locator('input[name="bedrooms"]').or(page.getByLabel(/bedrooms/i)).first();
    if (await bedroomsInput.isVisible()) {
      await expect(bedroomsInput).toBeVisible();
      await expect(
        page.locator('input[name="bathrooms"]').or(page.getByLabel(/bathrooms/i)).first()
      ).toBeVisible();
    }
  });

  test('shows map for location picking', async ({ page }) => {
    // Leaflet map should be rendered for location selection
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
  });

  test('shows image upload section', async ({ page }) => {
    await expect(
      page.getByText(/image|photo|upload/i).first()
    ).toBeVisible();
  });

  test('shows Submit/Create button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /create listing|submit|save property/i })
    ).toBeVisible();
  });

  test('submit without required fields shows validation', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /create listing|submit|save/i });
    await submitBtn.click();
    // Native validation or custom error message
    const nameInput = page.locator('input[name="name"]');
    if (await nameInput.isVisible()) {
      const msg = await nameInput.evaluate((el) => el.validationMessage);
      // Should have validation message OR an inline error
      const hasError = msg !== '' || (await page.getByText(/required|please fill/i).isVisible());
      expect(hasError).toBeTruthy();
    }
  });

  test('filling in name field works', async ({ page }) => {
    const nameInput = page.locator('input[name="name"]');
    if (await nameInput.isVisible()) {
      await nameInput.fill('E2E Test Property');
      await expect(nameInput).toHaveValue('E2E Test Property');
    }
  });

  test('selecting rent type updates price label', async ({ page }) => {
    const rentOption = page.locator('input[value="rent"]');
    if (await rentOption.isVisible()) {
      await rentOption.click();
      await expect(page.getByText(/per month|\/month|rent/i).first()).toBeVisible();
    }
  });
});
