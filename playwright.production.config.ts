import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

/** Production build/serve evidence only; no timing budgets are asserted here. */
export default defineConfig({
  testDir: './tests/browser',
  testMatch: /mount-isolation\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-production-browser' }],
  ],
  outputDir: 'test-results-production-browser',
  use: {
    baseURL: 'http://localhost:4100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'node scripts/build-test-apps.mjs && node scripts/serve-test-apps-production.mjs',
    url: 'http://localhost:4100/index.html',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium-production', use: { ...devices['Desktop Chrome'] } }],
});
