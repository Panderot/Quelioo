import { test, expect } from './fixtures'

test('@mobile sidebar drawer opens and closes', async ({ page }, testInfo) => {
  // The hamburger nav trigger is only rendered below the md breakpoint (768px) — skip cleanly on
  // the desktop project (1280x800) instead of failing/timing out on an element that can't exist there.
  test.skip(testInfo.project.name === 'desktop', 'mobile-only: nav drawer trigger is hidden at desktop width')

  await page.goto('/?lng=en')

  await expect(page.getByRole('button', { name: 'Close navigation menu' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  const closeOverlay = page.getByRole('button', { name: 'Close navigation menu' })
  await expect(closeOverlay).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create' })).toBeInViewport()

  // The overlay spans the full viewport but the drawer (higher z-index) covers its left 256px —
  // click a point in the visibly-uncovered backdrop area instead of the element's obscured center.
  await closeOverlay.click({ position: { x: 350, y: 400 } })
  await expect(page.getByRole('button', { name: 'Close navigation menu' })).toHaveCount(0)
})

test('@mobile create and archive pages have no horizontal overflow', async ({ page }) => {
  await page.goto('/?lng=en')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

  await page.goto('/archive?lng=en')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
