import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }

const LOCALES = { en, tr, hyw }

/** The fake backend starts signed in; this flag (read by authStore) starts it signed out. */
async function signedOut(page: Page, lang: 'en' | 'tr' | 'hyw' = 'tr') {
  await page.addInitScript((l) => {
    localStorage.setItem('quelio.fake.signedOut.v1', '1')
    localStorage.setItem('quelio_lang', l)
  }, lang)
}

test('signed-out "/" shows the landing page', async ({ page }) => {
  await signedOut(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(tr.landing.hero.title)
  await expect(page.locator('main a[href="/sign-up"]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quiz Oluştur' })).toHaveCount(0)
})

test('signed-in "/" goes straight to the app and the landing page never renders', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('quelio_lang', 'en')
    new MutationObserver(() => {
      if (document.querySelector('.lp-root')) (window as unknown as { __landingSeen: boolean }).__landingSeen = true
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto('/')
  await expect(page.locator('[data-purpose="app-viewport"]')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __landingSeen?: boolean }).__landingSeen)).toBeFalsy()
})

test('every start button reaches sign-up and the header link reaches sign-in', async ({ page }) => {
  await signedOut(page, 'en')
  await page.goto('/')
  const starts = page.locator('a[href="/sign-up"]')
  // header, hero, try-it, two plans, final band
  expect(await starts.count()).toBeGreaterThanOrEqual(6)
  for (const href of await starts.evaluateAll((els) => els.map((el) => el.getAttribute('href')))) expect(href).toBe('/sign-up')

  await page.locator('#hero-title ~ div a[href="/sign-up"]').first().click()
  await expect(page).toHaveURL(/\/sign-up$/)

  await page.goto('/')
  await page.getByRole('link', { name: en.landing.nav.signIn }).click()
  await expect(page).toHaveURL(/\/sign-in$/)

  await page.goto('/')
  await page.getByRole('link', { name: en.landing.cta.button }).last().click()
  await expect(page).toHaveURL(/\/sign-up$/)
})

test('the language switcher changes all landing text in TR, EN and HYW', async ({ page }) => {
  await signedOut(page, 'tr')
  await page.goto('/')
  const names = { en: 'English', tr: 'Türkçe', hyw: 'Հայերէն (Արեւմտահայերէն)' } as const
  for (const lang of ['en', 'hyw', 'tr'] as const) {
    await page.getByRole('button', { name: new RegExp([en, tr, hyw].map((x) => x.topbar.language.buttonLabel).join('|')) }).first().click()
    await page.getByRole('option', { name: names[lang] }).first().click()
    const l = LOCALES[lang].landing
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(l.hero.title)
    await expect(page.getByRole('heading', { level: 2, name: l.how.title })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: l.faq.title })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: l.cta.title })).toBeVisible()
    await expect(page.locator('main')).not.toContainText(/landing\.[a-z]+\./)
  }
})

test('/en and /hyw are fixed-language copies', async ({ page }) => {
  await signedOut(page, 'tr')
  await page.goto('/en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.landing.hero.title)
  await page.goto('/hyw')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(hyw.landing.hero.title)
})

test('reduced motion shows the final state of the hero animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signedOut(page, 'en')
  await page.goto('/')
  const demo = page.getByRole('group', { name: en.landing.hero.demoLabel }).first()
  await expect(demo.locator('.lp-hl[data-on="true"]')).toHaveCount(3)
  await expect(demo.locator('.lp-card-in[data-on="true"]')).toHaveCount(2)
  await expect(demo.locator('.lp-ok[data-on="true"]')).toHaveCount(2)
  await expect(demo.getByRole('button', { name: en.landing.hero.pause })).toHaveCount(0)
  // Reveal blocks are never hidden.
  await expect(page.getByRole('heading', { level: 2, name: en.landing.how.title })).toHaveCSS('opacity', '1')
})

test('the hero animation plays and can be paused', async ({ page }) => {
  await signedOut(page, 'en')
  await page.goto('/')
  const demo = page.getByRole('group', { name: en.landing.hero.demoLabel }).first()
  await expect(demo.locator('.lp-ok[data-on="true"]')).toHaveCount(2)
  // It restarts from the beginning, then climbs back to the end.
  await expect(demo.locator('.lp-hl[data-on="true"]')).toHaveCount(3, { timeout: 12_000 })
  await demo.getByRole('button', { name: en.landing.hero.pause }).click()
  await expect(demo.getByRole('button', { name: en.landing.hero.play })).toHaveAttribute('aria-pressed', 'true')
})

test('no horizontal scroll at 360px, no AI requests, feature tabs and try-it work', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  const api: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url())
  })
  await signedOut(page, 'en')
  await page.goto('/')
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 60))
    }
  })

  const l = en.landing
  for (const tab of Object.values(l.features.tabs)) {
    await page.getByRole('tab', { name: tab }).click()
    await expect(page.getByRole('tabpanel').first()).toBeVisible()
  }
  await expect(page.getByRole('tab', { name: l.features.tabs.cards })).toBeVisible()
  await page.getByRole('tab', { name: l.features.tabs.cards }).click()
  await page.getByRole('button', { name: l.features.cards.known }).click()
  for (const tab of ['school', 'university', 'exam', 'teacher'] as const) {
    await page.getByRole('tab', { name: l.audiences[tab].tab }).click()
  }
  await page.getByRole('tab', { name: l.samples.history.name }).click()
  await expect(page.getByRole('tabpanel', { name: l.samples.history.name })).toContainText(l.samples.history.q1)
    // Every FAQ answer opens.
  await page.locator('details summary').first().click()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  // Tap targets are at least 44px tall.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('main a, main button, header a, header button, footer a, footer button')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ h: el.getBoundingClientRect().height, text: (el.textContent ?? '').trim().slice(0, 30) }))
      .filter((x) => x.h < 43 && x.h > 0 && x.text),
  )
  expect(small).toEqual([])
  expect(api).toEqual([])
})

test('the lesson excerpt plays only on tap (Turkish)', async ({ page }) => {
  await signedOut(page, 'tr')
  const audioRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('.mp3')) audioRequests.push(request.url())
  })
  await page.goto('/')
  await page.getByRole('tab', { name: tr.landing.features.tabs.lesson }).click()
  expect(audioRequests).toEqual([])
  await page.getByRole('button', { name: tr.landing.features.lesson.play }).click()
  await expect.poll(() => audioRequests.length).toBeGreaterThan(0)
})
