// @ts-check
/**
 * Playwright config for recording a client demo video.
 * Always records video. Uses slowMo for clarity.
 *
 * Usage:
 *   npx playwright test --config=playwright.demo.config.js
 *
 * Video output: e2e/demo/demo-output/<test-name>/video.webm
 */
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config({ path: '.env.e2e' });

module.exports = defineConfig({
  testDir: './e2e/demo',
  fullyParallel: false,
  workers: 1,
  timeout: 5 * 60 * 1000, // 5 min — the tour is long
  reporter: [['list'], ['html', { outputFolder: 'e2e/demo/demo-report', open: 'never' }]],
  outputDir: 'e2e/demo/demo-output',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    video: 'on',
    screenshot: 'off',
    trace: 'off',
    actionTimeout: 30_000,
    navigationTimeout: 40_000,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'demo',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          slowMo: 550, // visible, not sluggish
          args: ['--start-maximized'],
        },
      },
    },
  ],
});
