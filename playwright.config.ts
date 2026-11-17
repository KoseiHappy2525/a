import { defineConfig, devices } from '@playwright/test';

// UI の E2E テスト。engine の単体テスト（vitest, *.test.ts）とは *.spec.ts で分ける。
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4319',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --port 4319 --strictPort',
    url: 'http://localhost:4319',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
