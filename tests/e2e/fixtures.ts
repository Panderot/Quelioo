import { test as base, expect } from '@playwright/test'
import type { ArchiveEntry } from '../../src/lib/archive'

// Harmless third-party console noise it's safe to ignore. Add an entry here only once you've
// confirmed a specific message is harmless — never use this to silence a real app error.
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  // Chromium's devtools logs this for ANY fetch/XHR that completes with a non-2xx status,
  // including deliberately-mocked error responses in tests (e.g. a mocked 400/blocked_address) —
  // it's not something the app logged, and the app handles the error correctly regardless.
  /Failed to load resource: the server responded with a status of \d+/,
]

interface MockHandle {
  requests: () => unknown[]
}

interface QuelioFixtures {
  mockGenerate: (response: unknown, options?: { status?: number }) => Promise<MockHandle>
  mockExtractUrl: (response: unknown, options?: { status?: number }) => Promise<MockHandle>
  mockGrade: (response: unknown, options?: { status?: number }) => Promise<MockHandle>
  seedArchive: (entries: ArchiveEntry[]) => Promise<void>
  seedLanguage: (lang: 'en' | 'tr' | 'hyw') => Promise<void>
}

export const test = base.extend<QuelioFixtures>({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return
      errors.push(text)
    })
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    await use(page)

    expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
  },

  mockGenerate: async ({ page }, use) => {
    await use(async (response, options = {}) => {
      const requests: unknown[] = []
      await page.route('**/api/generate', async (route) => {
        requests.push(route.request().postDataJSON())
        await route.fulfill({ status: options.status ?? 200, contentType: 'application/json', body: JSON.stringify(response) })
      })
      return { requests: () => requests }
    })
  },

  mockExtractUrl: async ({ page }, use) => {
    await use(async (response, options = {}) => {
      const requests: unknown[] = []
      await page.route('**/api/extract-url', async (route) => {
        requests.push(route.request().postDataJSON())
        await route.fulfill({ status: options.status ?? 200, contentType: 'application/json', body: JSON.stringify(response) })
      })
      return { requests: () => requests }
    })
  },

  mockGrade: async ({ page }, use) => {
    await use(async (response, options = {}) => {
      const requests: unknown[] = []
      await page.route('**/api/grade', async (route) => {
        requests.push(route.request().postDataJSON())
        await route.fulfill({ status: options.status ?? 200, contentType: 'application/json', body: JSON.stringify(response) })
      })
      return { requests: () => requests }
    })
  },

  seedArchive: async ({ page }, use) => {
    await use(async (entries) => {
      await page.addInitScript((data) => {
        window.localStorage.setItem('quelio.archive.v1', JSON.stringify(data))
      }, entries)
    })
  },

  seedLanguage: async ({ page }, use) => {
    await use(async (lang) => {
      await page.addInitScript((value) => {
        window.localStorage.setItem('quelio_lang', value)
      }, lang)
    })
  },
})

export { expect }
