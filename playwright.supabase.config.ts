import { defineConfig, devices } from '@playwright/test'

import { testEnv } from './tests/supabase/env'

// Real-Supabase specs: sign-up/sign-in, Row Level Security attacks, cross-device data, import and
// account deletion. They run ONLY against the TEST project (SUPABASE_TEST_* in .env.local), on their own
// dev server (port 5191), never at the same time as the UI-logic suite (playwright.config.ts, port 5190).
const PORT = 5191
const BASE_URL = `http://localhost:${PORT}`
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

export default defineConfig({
  testDir: 'tests/supabase',
  fullyParallel: true,
  workers: Number(process.env.PW_WORKERS) || 2,
  timeout: 60_000,
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
    },
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: DESKTOP_VIEWPORT } },
    { name: 'mobile', grep: /@mobile/, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
})
