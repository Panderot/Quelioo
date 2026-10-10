import { defineConfig, devices } from '@playwright/test'

// Production-mode specs: the real production bundle (import.meta.env.PROD) served by `vite preview` on port 5193,
// built with the fake backend so a teacher is signed in without Supabase. /api/live answers come from the specs.
const PORT = 5193
const BASE_URL = `http://localhost:${PORT}`
const vite = 'node node_modules/vite/bin/vite.js'

export default defineConfig({
  testDir: 'tests/prod',
  workers: Number(process.env.PW_WORKERS) || 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: 'dot',
  use: { baseURL: BASE_URL, headless: true, screenshot: 'only-on-failure', trace: 'off' },
  webServer: {
    command: `${vite} build --outDir dist-prod-test --emptyOutDir && ${vite} preview --outDir dist-prod-test --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    env: { VITE_QUELIO_FAKE_BACKEND: '1' },
    timeout: 240_000,
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1580, height: 900 } } }],
})
