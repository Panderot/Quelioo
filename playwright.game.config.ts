import { defineConfig, devices } from '@playwright/test'

import { testEnv } from './tests/supabase/env'

// Live Game specs (api/live + the board and phone screens). Like playwright.supabase.config.ts they run ONLY
// against the TEST Supabase project, on their own dev server (port 5192), never next to another suite.
const PORT = 5192
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'tests/game',
  fullyParallel: true,
  workers: Number(process.env.PW_WORKERS) || 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: 'dot',
  use: { baseURL: BASE_URL, headless: true, screenshot: 'only-on-failure', trace: 'off' },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    env: {
      QUELIO_NO_HMR: '1',
      VITE_SUPABASE_URL: testEnv.url,
      VITE_SUPABASE_PUBLISHABLE_KEY: testEnv.publishableKey,
      SUPABASE_SECRET_KEY: testEnv.secretKey,
      CRON_SECRET: 'quelio-test-cron-secret',
    },
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop', grep: /^(?!.*@mobile)/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', grep: /@mobile/, use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
    // iPhone Safari matters for the student screen: the whole flow (incl. its own 360px phone context) runs in WebKit on request.
    { name: 'webkit', testMatch: /live-flow\.spec\.ts/, use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
  ],
})
