import { expect, test } from '@playwright/test'

// The production bundle must hand out the canonical address, whatever address the user opened the app from.

const CANONICAL = 'https://quelio.vercel.app'

test('a deployment-specific vercel.app address moves to the canonical address, keeping path, query and hash', async ({ page }) => {
  const deployment = 'https://quelio-r1mfqxqi5-some-team.vercel.app'
  const seen: string[] = []
  await page.route(/https:\/\/quelio[^/]*\.vercel\.app\/.*/, async (route) => {
    const url = route.request().url()
    seen.push(url)
    if (url.startsWith(deployment)) {
      // Same file from the local preview server (the page itself, its scripts and styles).
      const { pathname, search } = new URL(url)
      await route.fulfill({ response: await route.fetch({ url: `http://localhost:5193${pathname}${search}` }) })
    } else {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>canonical</body></html>' })
    }
  })
  await page.goto(`${deployment}/solve?x=1#h`, { waitUntil: 'commit' }).catch(() => undefined)
  await page.waitForURL(`${CANONICAL}/solve?x=1#h`)
  expect(seen.some((url) => url.startsWith(CANONICAL))).toBe(true)
})
