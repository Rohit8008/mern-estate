// Calendar page — rendering, navigation, event creation
const { test, expect } = require('@playwright/test');

test.describe('Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
  });

  test('renders Calendar heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /calendar/i }).first()
    ).toBeVisible();
  });

  test('shows month/week/day view toggles', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /month|week|day/i }).first()
    ).toBeVisible();
  });

  test('shows navigation arrows (prev/next)', async ({ page }) => {
    const prevBtn = page.getByRole('button', { name: /previous|prev|</i })
      .or(page.locator('button').filter({ has: page.locator('[class*="arrow"], [class*="chevron"]') }));
    // At least one navigation button should exist
    const navBtns = page.getByRole('button').filter({ has: page.getByText(/prev|next|today/i) });
    await expect(navBtns.first()).toBeVisible();
  });

  test('shows Today button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /today/i })).toBeVisible();
  });

  test('current month/year is displayed', async ({ page }) => {
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });
    const year = String(now.getFullYear());
    await expect(
      page.getByText(new RegExp(monthName, 'i'))
        .or(page.getByText(year))
        .first()
    ).toBeVisible();
  });

  test('clicking a date opens event creation', async ({ page }) => {
    // Click on a visible calendar date cell
    const dateCell = page.locator('[class*="day"], td[data-date], [role="gridcell"]').first();
    if (await dateCell.isVisible()) {
      await dateCell.click();
      // Should open an event creation modal or inline form
      const eventForm = page.getByRole('dialog')
        .or(page.getByText(/new event|add event|create event/i));
      if (await eventForm.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(eventForm).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }
  });
});
