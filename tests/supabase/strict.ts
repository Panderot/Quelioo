import { test as base, expect } from '@playwright/test'

import { watchPage } from '../shared/strictPage'
import type { StrictPage } from '../shared/strictPage'
import { testEnv } from './env'

/**
 * The fixture of the full-coverage Supabase specs: any console error, uncaught page error or unexpected
 * 4xx/5xx request (the app and the TEST Supabase project) turns the test red. A test that exercises an error
 * path declares it with `strict.allow(/token\?grant_type=password/, 400)`.
 */
export const test = base.extend<{ strict: StrictPage }>({
  strict: [
    async ({ page }, use) => {
      const { handle, check } = watchPage(page, ['http://localhost:5191', testEnv.url])
      await use(handle)
      check()
    },
    { auto: true },
  ],
})

export { expect }
