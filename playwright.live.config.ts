import { defineConfig } from '@playwright/test'

// Live smoke check against a real deployment with the real provider keys — run only on request
// (`npm run test:live`) or after a production deploy that touched the API, never as part of
// test:e2e. Costs a few cents per run.
export default defineConfig({
  testDir: 'tests/live',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'https://quelio.vercel.app',
  },
})
