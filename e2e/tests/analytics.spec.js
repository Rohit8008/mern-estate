// Analytics page — charts, filters, data rendering
const { test, expect } = require('@playwright/test');

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
  });

  test('renders Analytics heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /analytics/i }).first()
    ).toBeVisible();
  });

  test('shows chart sections', async ({ page }) => {
    // At least one chart title should be visible
    await expect(
      page.getByText(/listings|properties|revenue|pipeline|activity/i).first()
    ).toBeVisible();
  });

  test('shows date range / period filter', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /30 days|7 days|90 days|this month|period/i }).first()
        .or(page.locator('select').first())
    ).toBeVisible();
  });

  test('has summary KPI row', async ({ page }) => {
    // Analytics page should have KPI numbers at the top
    await expect(
      page.getByText(/total|count|average|revenue/i).first()
    ).toBeVisible();
  });
});
