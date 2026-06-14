// Admin panel — access control, admin-only UI, user management, categories
const { test, expect } = require('@playwright/test');

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
  });

  test('admin user can access /admin', async ({ page }) => {
    // Should NOT be redirected to unauthorized/sign-in
    await expect(page).toHaveURL('/admin');
  });

  test('renders Admin panel heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /admin/i }).first()
    ).toBeVisible();
  });

  test('shows User Management section', async ({ page }) => {
    // Users tab exists in admin navigation
    await expect(
      page.getByRole('button', { name: /^users$/i })
    ).toBeVisible();
  });

  test('shows user list with actions', async ({ page }) => {
    // Navigate to Users tab first, then check for user management content
    await page.getByRole('button', { name: /^users$/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(
      (page.getByText(/create employee/i)
        .or(page.locator('table').first())
        .or(page.getByRole('list').first()))
        .first()
    ).toBeVisible();
  });

  test('shows categories / property types section', async ({ page }) => {
    await expect(
      page.getByText(/categor|property type/i).first()
    ).toBeVisible();
  });

  test('shows Import section', async ({ page }) => {
    // Import button is on the Listings tab
    await page.getByRole('button', { name: /listings/i }).first().click();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('button', { name: /import/i })
    ).toBeVisible();
  });

  test('admin-only: user invite or create user button exists', async ({ page }) => {
    // Navigate to Users tab to find Create Employee form
    await page.getByRole('button', { name: /^users$/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByText(/create employee/i).first()
    ).toBeVisible();
  });
});

test.describe('Admin Access Control', () => {
  test('non-admin role should be redirected from /admin', async ({ browser }) => {
    // This test uses a fresh context (no auth state — acts as unauthenticated)
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('http://localhost:5173/admin');
    await expect(page).toHaveURL(/sign-in|unauthorized/, { timeout: 10_000 });
    await context.close();
  });
});

test.describe('Admin Category Fields', () => {
  test('admin/categories/:slug/fields route is accessible', async ({ page }) => {
    // First, get a real category slug from the categories page
    await page.goto('/categories');
    await page.waitForLoadState('networkidle');

    const firstCategoryLink = page.getByRole('link').first();
    if (await firstCategoryLink.isVisible()) {
      const href = await firstCategoryLink.getAttribute('href');
      if (href) {
        // Try navigating to admin category fields with the slug
        const slug = href.split('/').pop();
        await page.goto(`/admin/categories/${slug}/fields`);
        // Should either load the page or redirect to admin
        await expect(page).not.toHaveURL(/sign-in/, { timeout: 10_000 });
      }
    }
  });
});

test.describe('Property Type Management', () => {
  test('/admin/property-types is accessible to admin', async ({ page }) => {
    await page.goto('/admin/property-types');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL('/admin/property-types');
    await expect(
      page.getByRole('heading', { name: /property type/i }).first()
    ).toBeVisible();
  });
});
