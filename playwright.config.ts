import { defineConfig, devices } from '@playwright/test'

const PORT = 5190
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 15_000,
  expect: { timeout: 5_000 },
  retries: 0,
  reporter: 'dot',
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      grep: /@mobile/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    // Cross-engine coverage for the Solve crop/choice/result specs.
    {
      name: 'firefox',
      testMatch: /solve-(crop|archive|explain)\.spec\.ts/,
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'webkit',
      testMatch: /solve-(crop|archive|explain)\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
    },
  ],
})
