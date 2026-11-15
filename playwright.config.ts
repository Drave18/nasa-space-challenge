import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_USE_CHROME ? 'chrome' : undefined, baseURL: 'http://127.0.0.1:3100' },
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
