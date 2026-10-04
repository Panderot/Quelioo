import { defineConfig, devices } from '@playwright/test'

const PORT = 5190
const BASE_URL = `http://localhost:${PORT}`
const isCI = !!process.env.CI
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // This PC has 16 GB RAM: 2 workers locally; override with PW_WORKERS (or --workers).
  workers: Number(process.env.PW_WORKERS) || 2,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: isCI ? 1 : 0,
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
    env: { QUELIO_NO_HMR: '1' },
    timeout: 30_000,
  },
  // test:e2e runs desktop + mobile (Chromium); test:cross runs @cross specs (image decode/crop,
  // IndexedDB, clipboard paste, print, audio) in Firefox and WebKit; test:all runs everything.
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: DESKTOP_VIEWPORT },
    },
    {
      name: 'mobile',
      grep: /@mobile/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'firefox',
      grep: /@cross/,
      grepInvert: /@mobile/,
      use: { ...devices['Desktop Firefox'], viewport: DESKTOP_VIEWPORT },
    },
    {
      name: 'webkit',
      grep: /@cross/,
      grepInvert: /@mobile/,
      use: { ...devices['Desktop Safari'], viewport: DESKTOP_VIEWPORT },
    },
  ],
})
