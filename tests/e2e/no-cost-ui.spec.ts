import { expect, test } from './fixtures'

// Students never see a dollar amount, a cost, a token count or cache/provider details anywhere in the
// app (CLAUDE.md). Spend lives only on /owner, which needs the owner code in production.

const FORBIDDEN = /\$|maliyet|\bcosts?\b|\btokens?\b|önbellek|cached|provider|դոլար|ծախս/i
const PAGES = ['/', '/solve', '/archive', '/songs', '/flashcards', '/lessons']

for (const lang of ['en', 'tr', 'hyw'] as const) {
  test(`no cost, token or cache wording on any page in ${lang}`, async ({ page, seedLanguage }) => {
    await seedLanguage(lang)
    for (const path of PAGES) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      const text = await page.locator('body').innerText()
      expect(text, `${path} (${lang})`).not.toMatch(FORBIDDEN)
    }
  })
}

test('the owner page shows spend and is the only place that does', async ({ page }) => {
  await page.route('**/api/lesson', (route) => route.fulfill({ json: { requiresAccessCode: false, monthlyBudgetUsd: 5 } }))
  await page.goto('/owner')
  await expect(page.locator('[data-purpose="owner-month-spend"]')).toContainText('This month: $0.000 of $5.00')
  await expect(page.getByRole('link', { name: /owner/i })).toHaveCount(0) // no navigation link to it
})
