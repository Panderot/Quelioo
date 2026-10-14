import { test, expect } from './fixtures'

test('@mobile the bottom tab bar has four tabs and there is no drawer', async ({ page }, testInfo) => {
  // The tab bar only exists below 640px — skip cleanly on the desktop project.
  test.skip(testInfo.project.name === 'desktop', 'mobile-only: the tab bar is hidden at desktop width')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?lng=en')

  const tabs = page.locator('[data-purpose="tab-bar"]')
  await expect(tabs.getByRole('link')).toHaveText(['Create', 'Solve', 'Flashcards', 'Archive'])
  await expect(tabs.getByRole('link', { name: 'Create' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: /navigation menu/i })).toHaveCount(0)
  // The slim top bar keeps the logo and the avatar; the desktop links are not shown.
  await expect(page.locator('[data-purpose="main-nav"]')).toBeHidden()
  await expect(page.locator('[data-purpose="user-menu"]')).toBeVisible()

  await page.locator('[data-purpose="tab-bar"]').getByRole('link', { name: 'Archive' }).click()
  await expect(page).toHaveURL(/\/archive/)
})

test('@mobile create and archive pages have no horizontal overflow', async ({ page }) => {
  await page.goto('/?lng=en')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

  await page.goto('/archive?lng=en')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
