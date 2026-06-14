// Messages / Chat — rendering, conversation list, message sending
const { test, expect } = require('@playwright/test');

test.describe('Messages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/messages');
    await page.waitForLoadState('networkidle');
  });

  test('renders Messages page', async ({ page }) => {
    await expect(
      (page.getByRole('heading', { name: /messages|chat/i })
        .or(page.getByText(/conversations|no conversations/i)))
        .first()
    ).toBeVisible();
  });

  test('shows conversation list panel', async ({ page }) => {
    // Left panel with conversations or "No conversations yet"
    await expect(
      page.getByText(/conversations|chats|no conversations|start a new/i).first()
    ).toBeVisible();
  });

  test('shows empty state or conversation list', async ({ page }) => {
    // Either conversations exist and are shown, or empty state is shown
    const hasContent = await page.locator('[class*="conversation"], [class*="chat-item"]').count();
    const hasEmptyState = await page.getByText(/no messages|no conversations|start/i).first().isVisible();
    expect(hasContent > 0 || hasEmptyState).toBeTruthy();
  });

  test('message input is present when conversation is open', async ({ page }) => {
    // If a conversation is open, input should be present
    const conversationItems = page.locator('[class*="conversation-item"], [class*="chat-item"]');
    const count = await conversationItems.count();

    if (count > 0) {
      await conversationItems.first().click();
      await expect(
        page.getByRole('textbox', { name: /message/i })
          .or(page.getByPlaceholder(/type a message|write a message/i))
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});
