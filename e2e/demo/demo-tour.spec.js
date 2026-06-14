/**
 * Client Demo Tour
 * ─────────────────────────────────────────────────────────────────────────
 * Records a full walkthrough of the CRM platform for a client presentation.
 * Run with: npm run demo:video
 *
 * Prerequisites:
 *   1. Backend running on :3000   (cd backend && npm run dev)
 *   2. Frontend running on :5173  (cd frontend && npm run dev)
 *   3. Demo data seeded           (cd backend && node scripts/seedDemo.js)
 *
 * The video lands in: e2e/demo/demo-output/
 */
const { test, expect } = require('@playwright/test');

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    || 'mittalrohit701@gmail.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Admin@123';

// ── helpers ───────────────────────────────────────────────────────────────

async function pause(page, ms = 2000) {
  await page.waitForTimeout(ms);
}

async function scrollDown(page, px = 400) {
  await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), px);
  await pause(page, 1200);
}

async function scrollTop(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await pause(page, 800);
}

// Scroll an element into view and give it a visual moment
async function spotlight(page, locator) {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 });
    await pause(page, 600);
  } catch (_) { /* element might be gone, ignore */ }
}

// ── MAIN TOUR ─────────────────────────────────────────────────────────────

test('CRM Platform — Full Demo Tour', async ({ page }) => {

  // ════════════════════════════════════════════════════════════════
  // 1. SIGN IN
  // ════════════════════════════════════════════════════════════════
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible({ timeout: 15_000 });
  await pause(page, 1500);

  await page.locator('#email').fill(ADMIN_EMAIL);
  await pause(page, 600);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await pause(page, 600);

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/sign-in/, { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  await pause(page, 2000);

  // ════════════════════════════════════════════════════════════════
  // 2. DASHBOARD — KPIs, charts, recent activity
  // ════════════════════════════════════════════════════════════════
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await pause(page, 3000); // let charts render

  // Hover over KPI cards
  const kpiCards = page.locator('[class*="border-t-2"]');
  const kpiCount = await kpiCards.count();
  for (let i = 0; i < Math.min(kpiCount, 4); i++) {
    await kpiCards.nth(i).hover();
    await pause(page, 500);
  }

  await scrollDown(page, 350);
  await pause(page, 2500); // charts section

  await scrollDown(page, 350);
  await pause(page, 2000); // recent activity / pipeline summary

  await scrollTop(page);
  await pause(page, 1000);

  // ════════════════════════════════════════════════════════════════
  // 3. PROPERTIES — Table → Pipeline → Cards → Map
  // ════════════════════════════════════════════════════════════════
  await page.goto('/properties');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000);

  // Quick search demo
  const searchBox = page.getByPlaceholder(/search properties/i);
  if (await searchBox.isVisible()) {
    await searchBox.fill('Bandra');
    await pause(page, 1500);
    await searchBox.fill('');
    await pause(page, 1000);
  }

  // Scroll table to show results
  await scrollDown(page, 300);
  await pause(page, 1500);
  await scrollTop(page);

  // ── Pipeline (kanban) view
  await page.getByRole('button', { name: /pipeline/i }).click();
  await page.waitForLoadState('networkidle');
  await pause(page, 2500);

  // Scroll right to show all 3 kanban columns
  const pipelineArea = page.locator('[class*="overflow-x-auto"]').first();
  if (await pipelineArea.isVisible()) {
    await pipelineArea.evaluate((el) => el.scrollBy({ left: 400, behavior: 'smooth' }));
    await pause(page, 1500);
    await pipelineArea.evaluate((el) => el.scrollTo({ left: 0, behavior: 'smooth' }));
    await pause(page, 1000);
  }

  // Hover over a pipeline card
  try {
    const firstCard = page.locator('[class*="rounded-xl"][class*="border"]').first();
    await firstCard.hover();
    await pause(page, 1000);
  } catch (_) {}

  // ── Cards view
  await page.getByRole('button', { name: /cards/i }).click();
  await page.waitForLoadState('networkidle');
  await pause(page, 2000);

  await scrollDown(page, 450);
  await pause(page, 1500);
  await scrollTop(page);

  // ── Map view
  await page.getByRole('button', { name: /map/i }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 18_000 });
  await pause(page, 3000); // let markers settle

  // Click a map marker if any are visible
  try {
    const marker = page.locator('.leaflet-marker-icon').first();
    if (await marker.isVisible({ timeout: 3000 })) {
      await marker.click({ force: true });
      await pause(page, 2000);
      // Close popup
      const closeBtn = page.locator('.leaflet-popup-close-button');
      if (await closeBtn.isVisible({ timeout: 1000 })) await closeBtn.click();
    }
  } catch (_) {}

  await pause(page, 1000);

  // Back to table view
  await page.getByRole('button', { name: /main table/i }).click();
  await page.waitForLoadState('networkidle');
  await pause(page, 1500);

  // ════════════════════════════════════════════════════════════════
  // 4. CLIENTS BOARD — contact cards, detail panel, pipeline stages
  // ════════════════════════════════════════════════════════════════
  await page.goto('/clients');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000);

  // Show status filter
  try {
    const statusFilter = page.locator('select').first();
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption('negotiation');
      await pause(page, 1200);
      await statusFilter.selectOption({ index: 0 });
      await pause(page, 800);
    }
  } catch (_) {}

  await scrollDown(page, 350);
  await pause(page, 1500);
  await scrollTop(page);

  // Open first client detail panel
  try {
    const firstClientName = page.locator('h3').first();
    if (await firstClientName.isVisible({ timeout: 3000 })) {
      await firstClientName.click();
      const panel = page.locator('.max-w-2xl.h-full');
      await expect(panel).toBeVisible({ timeout: 8_000 });
      await pause(page, 2500);

      // Scroll panel to show more
      await panel.evaluate((el) => el.scrollBy({ top: 300, behavior: 'smooth' }));
      await pause(page, 1500);
      await panel.evaluate((el) => el.scrollTo({ top: 0, behavior: 'smooth' }));
      await pause(page, 800);

      // Close the panel
      const closeBtn = panel.getByRole('button', { name: /close/i }).first();
      if (await closeBtn.isVisible({ timeout: 2000 })) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await pause(page, 1000);
    }
  } catch (_) {}

  // Switch to table view
  try {
    const tableBtn = page.getByRole('button', { name: /table/i });
    if (await tableBtn.isVisible()) {
      await tableBtn.click();
      await page.waitForLoadState('networkidle');
      await pause(page, 1500);
    }
  } catch (_) {}

  // ════════════════════════════════════════════════════════════════
  // 5. OWNERS BOARD — property owners
  // ════════════════════════════════════════════════════════════════
  await page.goto('/owners');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000);

  await scrollDown(page, 350);
  await pause(page, 1500);
  await scrollTop(page);

  // ════════════════════════════════════════════════════════════════
  // 6. TASKS BOARD — task cards, open a task panel
  // ════════════════════════════════════════════════════════════════
  await page.goto('/tasks');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000);

  // Show priority filter
  try {
    const priorityFilter = page.locator('select').nth(1);
    if (await priorityFilter.isVisible()) {
      await priorityFilter.selectOption('urgent');
      await pause(page, 1200);
      await priorityFilter.selectOption({ index: 0 });
      await pause(page, 800);
    }
  } catch (_) {}

  // Open first task panel
  try {
    const firstTask = page.locator('h3').first();
    if (await firstTask.isVisible({ timeout: 3000 })) {
      await firstTask.click();
      const taskPanel = page.locator('.max-w-xl.h-full');
      await expect(taskPanel).toBeVisible({ timeout: 8_000 });
      await pause(page, 2500);

      // Scroll panel
      await taskPanel.evaluate((el) => el.scrollBy({ top: 200, behavior: 'smooth' }));
      await pause(page, 1200);

      // Close
      const closeBtn = taskPanel.getByRole('button', { name: /close/i }).first();
      if (await closeBtn.isVisible({ timeout: 2000 })) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await pause(page, 1000);
    }
  } catch (_) {}

  await scrollDown(page, 400);
  await pause(page, 1500);
  await scrollTop(page);

  // ════════════════════════════════════════════════════════════════
  // 7. PIPELINE / DEALS BOARD
  // ════════════════════════════════════════════════════════════════
  await page.goto('/pipeline');
  await page.waitForLoadState('networkidle');
  await pause(page, 2500);

  await scrollDown(page, 300);
  await pause(page, 1500);
  await scrollTop(page);

  // ════════════════════════════════════════════════════════════════
  // 8. BUYER REQUIREMENTS
  // ════════════════════════════════════════════════════════════════
  await page.goto('/buyers');
  await page.waitForLoadState('networkidle');
  await pause(page, 2000);

  await scrollDown(page, 400);
  await pause(page, 1500);
  await scrollTop(page);

  // ════════════════════════════════════════════════════════════════
  // 9. ANALYTICS — charts and performance metrics
  // ════════════════════════════════════════════════════════════════
  await page.goto('/analytics');
  await page.waitForLoadState('networkidle');
  await pause(page, 3000); // charts need to load

  await scrollDown(page, 400);
  await pause(page, 2000);

  await scrollDown(page, 400);
  await pause(page, 2000);

  await scrollTop(page);
  await pause(page, 1000);

  // ════════════════════════════════════════════════════════════════
  // 10. CALENDAR
  // ════════════════════════════════════════════════════════════════
  await page.goto('/calendar');
  await page.waitForLoadState('networkidle');
  await pause(page, 2500);

  // Click next month
  try {
    const nextBtn = page.getByRole('button', { name: /next|forward|›|>/i }).first();
    if (await nextBtn.isVisible({ timeout: 2000 })) {
      await nextBtn.click();
      await pause(page, 1200);
    }
  } catch (_) {}

  await pause(page, 1500);

  // ════════════════════════════════════════════════════════════════
  // 11. BACK TO DASHBOARD — final wide shot
  // ════════════════════════════════════════════════════════════════
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await pause(page, 4000); // hold the final frame

});
