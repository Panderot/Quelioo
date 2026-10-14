import { expect } from '@playwright/test'

import { watchPage } from '../shared/strictPage'
import type { StrictPage } from '../shared/strictPage'
import { test as fixtureTest } from './fixtures'

/**
 * The fixture of the full-coverage specs (tests/e2e/full-*.spec.ts): on top of the shared fixtures,
 * any console error, uncaught page error or unexpected 4xx/5xx request of the app turns the test red.
 * A test that exercises an error path declares it with `strict.allow(/api\/generate/, 500)`.
 */
export const test = fixtureTest.extend<{ strict: StrictPage }>({
  strict: [
    async ({ page }, use) => {
      const { handle, check } = watchPage(page, ['http://localhost:5190'])
      await use(handle)
      check()
    },
    { auto: true },
  ],
})

export { expect }
