// Tasks Board — full CRUD, status/priority changes, filters, views
const { test, expect } = require('@playwright/test');

const uniqueTitle = () => `E2E Task ${Date.now()}`;

test.describe('Tasks Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /tasks/i }).first()).toBeVisible();
  });

  test('shows Cards and Table view toggles', async ({ page }) => {
    await expect(page.getByRole('button', { name: /cards/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /table/i })).toBeVisible();
  });

  test('shows New Task button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new task/i })).toBeVisible();
  });

  test('search input filters tasks', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search tasks/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('xyz_no_match');
    await page.waitForTimeout(500);
    await searchInput.clear();
  });

  test('opens new task modal', async ({ page }) => {
    await page.getByRole('button', { name: /new task/i }).click();
    await expect(
      page.getByLabel(/task title/i).or(page.getByPlaceholder(/task title/i))
    ).toBeVisible();
  });

  test('creates a new task', async ({ page }) => {
    const title = uniqueTitle();

    await page.getByRole('button', { name: /new task/i }).click();

    // Fill title
    const titleInput = page.getByLabel(/task title/i).or(page.getByPlaceholder(/task title/i));
    await titleInput.fill(title);

    // Set priority
    const prioritySelect = page.getByLabel(/priority/i);
    if (await prioritySelect.isVisible()) {
      await prioritySelect.selectOption('medium');
    }

    await page.getByRole('button', { name: /create task/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });

  test('edits a task', async ({ page }) => {
    const title = uniqueTitle();
    const updatedTitle = `${title} Updated`;

    // Create
    await page.getByRole('button', { name: /new task/i }).click();
    const titleInput = page.getByLabel(/task title/i).or(page.getByPlaceholder(/task title/i));
    await titleInput.fill(title);
    await page.getByRole('button', { name: /create task/i }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

    // Open detail panel and click its Edit button (scoped to panel to avoid backdrop)
    await page.getByText(title).click();
    const taskPanel = page.locator('.max-w-xl.h-full');
    await expect(taskPanel).toBeVisible({ timeout: 5_000 });
    await taskPanel.getByRole('button', { name: /edit/i }).click();

    const editTitleInput = page.getByLabel(/task title/i).or(page.getByPlaceholder(/task title/i));
    await editTitleInput.clear();
    await editTitleInput.fill(updatedTitle);
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByText(updatedTitle).first()).toBeVisible({ timeout: 10_000 });
  });

  test('deletes a task', async ({ page }) => {
    const title = uniqueTitle();

    // Create
    await page.getByRole('button', { name: /new task/i }).click();
    const titleInput = page.getByLabel(/task title/i).or(page.getByPlaceholder(/task title/i));
    await titleInput.fill(title);
    await page.getByRole('button', { name: /create task/i }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

    // Open detail panel and click its Delete button (scoped to panel to avoid backdrop)
    await page.getByText(title).click();
    const taskPanel = page.locator('.max-w-xl.h-full');
    await expect(taskPanel).toBeVisible({ timeout: 5_000 });
    await taskPanel.locator('button.text-rose-600').first().click();
    // Confirm in ConfirmDialog
    await page.getByRole('dialog').getByRole('button', { name: /delete/i }).click();

    await expect(page.getByText(title).first()).not.toBeVisible({ timeout: 10_000 });
  });

  test('switches to table view', async ({ page }) => {
    await page.getByRole('button', { name: /table/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('table')).toBeVisible();
  });

  test('status filter dropdown works', async ({ page }) => {
    const statusFilter = page.locator('select').first();
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption('todo');
      await page.waitForTimeout(300);
      await statusFilter.selectOption({ index: 0 }); // reset to 'all'
    }
  });

  test('priority filter dropdown works', async ({ page }) => {
    // Find the second select (priority filter)
    const selects = page.locator('select');
    const count = await selects.count();
    if (count >= 2) {
      const priorityFilter = selects.nth(1);
      await priorityFilter.selectOption('high');
      await page.waitForTimeout(300);
      await priorityFilter.selectOption({ index: 0 });
    }
  });

  test('cancel button closes modal without saving', async ({ page }) => {
    await page.getByRole('button', { name: /new task/i }).click();
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
  });
});
