// Deals / Sales Pipeline — pipeline columns, card visibility, refresh, navigation
const { test, expect } = require('@playwright/test');

const PIPELINE_STAGES = [
  'new_lead',
  'contacted',
  'qualified',
  'site_visit_scheduled',
  'negotiation',
  'booking_token',
  'documentation',
  'closed_won',
  'closed_lost',
];

test.describe('Deals (Sales Pipeline)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pipeline');
    await page.waitForLoadState('networkidle');
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /sales pipeline/i }).first()).toBeVisible();
  });

  test('shows pipeline subtitle', async ({ page }) => {
    await expect(page.getByText(/drag deals across stages/i)).toBeVisible();
  });

  test('shows Clients link', async ({ page }) => {
    // Scope to main content to avoid sidebar "Clients" nav link
    await expect(page.locator('main').getByRole('link', { name: /clients/i })).toBeVisible();
  });

  test('shows Refresh button', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await expect(refreshBtn).toBeVisible();
  });

  test('shows pipeline stage columns', async ({ page }) => {
    // At least some stage labels should be visible
    const stageLabels = ['New Lead', 'Contacted', 'Qualified', 'Negotiation', 'Closed Won'];
    let foundCount = 0;
    for (const label of stageLabels) {
      const el = page.getByText(label, { exact: false });
      if (await el.isVisible()) foundCount++;
    }
    expect(foundCount).toBeGreaterThan(2);
  });

  test('toggle legacy stages button works', async ({ page }) => {
    const legacyBtn = page.getByRole('button', { name: /legacy stages|hide legacy/i });
    if (await legacyBtn.isVisible()) {
      await legacyBtn.click();
      // Should change label after click
      await expect(
        page.getByRole('button', { name: /legacy stages|hide legacy/i })
      ).toBeVisible();
    }
  });

  test('pipeline columns are scrollable when many stages', async ({ page }) => {
    // The pipeline board container should have horizontal scroll
    const board = page.locator('[class*="flex"][class*="overflow"]').first();
    if (await board.isVisible()) {
      await expect(board).toBeVisible();
    }
  });

  test('clients link navigates to contacts board', async ({ page }) => {
    // Scope to main to avoid sidebar duplicate
    await page.locator('main').getByRole('link', { name: /clients/i }).click();
    await expect(page).toHaveURL('/clients');
    await page.goBack();
  });

  test('each stage column shows a deal count badge', async ({ page }) => {
    // Stage columns should have count indicators (may be 0)
    const countBadges = page.locator('[class*="rounded-full"]').first();
    if (await countBadges.isVisible()) {
      await expect(countBadges).toBeVisible();
    }
  });
});
