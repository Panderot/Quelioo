import type { Page } from '@playwright/test'

import { SAMPLE_QUIZ } from '../fixtures/quiz'
import { test, expect } from './fixtures'
import { seed } from './flashcardHelpers'

const bar = (page: Page) => page.locator('[data-purpose="top-nav"]')
const strip = (page: Page) => page.locator('[data-purpose="resume-strip"]')

const QUIZ_ENTRY = {
  id: 'resume-quiz-1',
  title: SAMPLE_QUIZ.title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: String(SAMPLE_QUIZ.questions.length),
  optionsCount: null,
  outputLanguage: 'en',
  sourceText: 'Seeded source text for the archived quiz.',
  quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
}

const DUE_DECK = { id: 'deck-r', name: 'R', cards: [{ id: 'r1', front: 'a', back: 'b' }, { id: 'r2', front: 'c', back: 'd' }] }

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector('[data-purpose="top-nav"] > div')
    const rowOverflows = row ? row.scrollWidth > row.clientWidth : false
    return rowOverflows || document.documentElement.scrollWidth > document.documentElement.clientWidth
  })
}

test.describe('Top bar (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Create, Solve and Flashcards on the left; Archive and the profile on the right; the current page is marked', async ({ page }) => {
    await page.goto('/?lng=en')
    const main = bar(page).locator('[data-purpose="main-nav"]')
    await expect(main.getByRole('link')).toHaveText(['Create', 'Solve', 'Flashcards'])
    await expect(main.getByRole('link', { name: 'Create' })).toHaveAttribute('aria-current', 'page')
    await expect(bar(page).getByRole('link', { name: 'Archive' })).toBeVisible()
    await expect(bar(page).locator('[data-purpose="user-menu"]')).toBeVisible()
    // Left to right: the nav, then Archive, then the profile.
    const x = async (selector: string) => (await bar(page).locator(selector).first().boundingBox())!.x
    expect(await x('[data-purpose="main-nav"]')).toBeLessThan(await x('a[href="/archive"]'))
    expect(await x('a[href="/archive"]')).toBeLessThan(await x('[data-purpose="user-menu"]'))
    // The bar is about 64px tall and navy.
    const box = (await bar(page).boundingBox())!
    expect(box.height).toBe(64)
    expect(await bar(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(14, 19, 48)')

    await main.getByRole('link', { name: 'Solve' }).click()
    await expect(main.getByRole('link', { name: 'Solve' })).toHaveAttribute('aria-current', 'page')
    await expect(main.getByRole('link', { name: 'Create' })).not.toHaveAttribute('aria-current', 'page')
    await bar(page).getByRole('link', { name: 'Archive' }).click()
    await expect(bar(page).getByRole('link', { name: 'Archive' })).toHaveAttribute('aria-current', 'page')
  })

  test('the bar stays at the top while the page scrolls, and no side menu or tab bar exists', async ({ page }) => {
    await page.goto('/?lng=en')
    await expect(page.locator('[data-purpose="sidebar-navigation"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="tab-bar"]')).toBeHidden()
    await page.evaluate(() => {
      document.body.style.minHeight = '3000px'
      window.scrollTo(0, 800)
    })
    await expect.poll(async () => (await bar(page).boundingBox())!.y).toBe(0)
  })

  test('the slogan shows at 1280px and not at 1024px', async ({ page }) => {
    await page.goto('/?lng=en')
    await expect(bar(page).getByText('Questions that shine.')).toBeVisible()
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(bar(page).getByText('Questions that shine.')).toBeHidden()
  })

  test('Tab reaches every menu item', async ({ page }) => {
    await page.goto('/?lng=en')
    await expect(bar(page)).toBeVisible()
    const seen = new Set<string>()
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab')
      const id = await page.evaluate(() => {
        const el = document.activeElement
        return el ? (el.getAttribute('href') ?? el.getAttribute('aria-label') ?? el.tagName) : ''
      })
      seen.add(id)
    }
    for (const href of ['/', '/solve', '/flashcards', '/archive']) expect(seen, href).toContain(href)
    expect([...seen].some((value) => /Change language/.test(value))).toBe(true)
    expect([...seen].some((value) => /Account menu/.test(value))).toBe(true)
  })

  test('keyboard focus shows one amber ring; a mouse click on a link leaves no ring', async ({ page }) => {
    await page.goto('/?lng=en')
    const solve = bar(page).locator('[data-purpose="main-nav"]').getByRole('link', { name: 'Solve' })
    await solve.hover()
    await page.mouse.down()
    await page.mouse.up()
    await expect(solve).toBeFocused()
    expect(await solve.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(solve).toBeFocused()
    // The colour transition runs for a moment: wait for the final amber.
    await expect.poll(() => solve.evaluate((el) => getComputedStyle(el).outlineColor)).toBe('rgb(245, 165, 36)')
  })

  test('the profile menu opens; sign out and the language switch work', async ({ page }) => {
    await page.goto('/?lng=en')
    const profile = bar(page).locator('[data-purpose="user-menu"]').getByRole('button').first()
    await profile.click()
    await expect(page.getByRole('menuitem', { name: 'Account' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: 'Account' })).toHaveCount(0)
    await profile.click()
    await page.getByRole('menuitem', { name: 'Account' }).click()
    await expect(page).toHaveURL(/\/account$/)
    await profile.click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toHaveCount(0)

    await bar(page).getByRole('button', { name: 'Change language' }).click()
    await page.getByRole('option', { name: 'Türkçe' }).click()
    await expect(bar(page).locator('[data-purpose="main-nav"]').getByRole('link')).toHaveText(['Oluştur', 'Çöz', 'Kartlar'])
  })

  for (const lng of ['tr', 'en', 'hyw']) {
    for (const width of [1024, 1280, 1920]) {
      test(`no overflow or line break in ${lng} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(`/?lng=${lng}`)
        await expect(bar(page).locator('[data-purpose="main-nav"]').getByRole('link')).toHaveCount(3)
        expect(await hasHorizontalOverflow(page)).toBe(false)
        for (const link of await bar(page).getByRole('link').all()) {
          const box = await link.boundingBox()
          if (box) expect(box.height, await link.innerText()).toBeLessThanOrEqual(64)
        }
        expect(await bar(page).evaluate((el) => el.getBoundingClientRect().height)).toBe(64)
      })
    }
  }
})

test.describe('Phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('four tabs, no drawer; the page is not hidden behind the tab bar', async ({ page }) => {
    await page.goto('/?lng=en')
    const tabs = page.locator('[data-purpose="tab-bar"]')
    await expect(tabs.getByRole('link')).toHaveText(['Create', 'Solve', 'Flashcards', 'Archive'])
    await expect(page.getByRole('button', { name: /navigation menu/i })).toHaveCount(0)
    await expect(bar(page).locator('[data-purpose="main-nav"]')).toBeHidden()
    await expect(bar(page).locator('[data-purpose="user-menu"]')).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const tabsTop = (await tabs.boundingBox())!.y
    const lastBottom = await page.locator('[data-purpose="main-layout"]').evaluate((el) => el.getBoundingClientRect().bottom)
    expect(lastBottom).toBeGreaterThanOrEqual(tabsTop)
    expect(await hasHorizontalOverflow(page)).toBe(false)
  })

  test('in Armenian the tab labels fit', async ({ page }) => {
    await page.goto('/?lng=hyw')
    expect(await hasHorizontalOverflow(page)).toBe(false)
    await expect(page.locator('[data-purpose="tab-bar"]').getByRole('link')).toHaveCount(4)
  })
})

test.describe('Screens without the menu', () => {
  test('quiz study mode hides both bars', async ({ page, seedArchive }) => {
    await seedArchive([QUIZ_ENTRY])
    await page.goto(`/archive/${QUIZ_ENTRY.id}?mode=study&lng=en`)
    await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
    await expect(bar(page)).toHaveCount(0)
    await expect(page.locator('[data-purpose="tab-bar"]')).toHaveCount(0)
  })
})

test('text typed on Create survives a visit to another page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?lng=en')
  const text = page.locator('textarea').first()
  await text.fill('Photosynthesis turns light into sugar.')
  await bar(page).locator('[data-purpose="main-nav"]').getByRole('link', { name: 'Solve' }).click()
  await expect(page).toHaveURL(/\/solve$/)
  await bar(page).locator('[data-purpose="main-nav"]').getByRole('link', { name: 'Create' }).click()
  await expect(page.locator('textarea').first()).toHaveValue('Photosynthesis turns light into sugar.')
})

test.describe('Resume strip on Create', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('a new user sees no strip at all', async ({ page }) => {
    await page.goto('/?lng=en')
    await expect(page.locator('textarea').first()).toBeVisible()
    await expect(strip(page)).toHaveCount(0)
    await expect(page.getByText(/to review today|Your last quiz/)).toHaveCount(0)
  })

  test('due cards: the right count, linking to the review', async ({ page }) => {
    await page.goto('/?lng=en')
    await seed(page, [DUE_DECK], '/?lng=en')
    const link = strip(page).locator('[data-purpose="resume-due"]')
    await expect(link).toHaveText('2 cards to review today')
    await expect(strip(page).locator('[data-purpose="resume-quiz"]')).toHaveCount(0)
    await link.click()
    await expect(page).toHaveURL(/\/flashcards\/deck-r\/study$/)
  })

  test('one due card uses the singular', async ({ page }) => {
    await page.goto('/?lng=en')
    await seed(page, [{ id: 'deck-one', name: 'One', cards: [{ id: 'o1', front: 'a', back: 'b' }] }], '/?lng=en')
    await expect(strip(page).locator('[data-purpose="resume-due"]')).toHaveText('1 card to review today')
  })

  test('several decks with due cards link to the deck list', async ({ page }) => {
    await page.goto('/?lng=en')
    await seed(page, [DUE_DECK, { id: 'deck-s', name: 'S', cards: [{ id: 's1', front: 'a', back: 'b' }] }], '/?lng=en')
    const link = strip(page).locator('[data-purpose="resume-due"]')
    await expect(link).toHaveText('3 cards to review today')
    await link.click()
    await expect(page).toHaveURL(/\/flashcards$/)
  })

  test('a saved quiz: the last quiz opens in study mode', async ({ page, seedArchive }) => {
    await seedArchive([QUIZ_ENTRY])
    await page.goto('/?lng=en')
    const link = strip(page).locator('[data-purpose="resume-quiz"]')
    await expect(link).toHaveText(`Your last quiz: ${SAMPLE_QUIZ.title}`)
    await expect(strip(page).locator('[data-purpose="resume-due"]')).toHaveCount(0)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/archive/${QUIZ_ENTRY.id}\\?mode=study`))
    await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
  })

  test('both items, one amber primary button, and the form does not wait for the strip', async ({ page, seedArchive }) => {
    await seedArchive([QUIZ_ENTRY])
    await page.goto('/?lng=en')
    await seed(page, [DUE_DECK], '/?lng=en')
    await expect(strip(page).getByRole('link')).toHaveCount(2)
    await expect(page.locator('textarea').first()).toBeVisible()
    for (const link of await strip(page).getByRole('link').all()) {
      expect(await link.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgb(245, 165, 36)')
    }
  })

  for (const { lng, due, quiz } of [
    { lng: 'tr', due: 'Bugün tekrar edilecek 2 kart', quiz: 'Son quizin:' },
    { lng: 'hyw', due: 'Այսօր կրկնելիք 2 քարտ', quiz: 'Վերջին քուիզդ՝' },
  ]) {
    test(`the strip is localized in ${lng}`, async ({ page, seedArchive }) => {
      await seedArchive([QUIZ_ENTRY])
      await page.goto(`/?lng=${lng}`)
      await seed(page, [DUE_DECK], `/?lng=${lng}`)
      await expect(strip(page).locator('[data-purpose="resume-due"]')).toHaveText(due)
      await expect(strip(page).locator('[data-purpose="resume-quiz"]')).toContainText(quiz)
    })
  }
})
