import { test, expect } from './strict'
import type { Page } from '@playwright/test'

import { en, hyw, tr } from './locales'
import { cleanupTestUsers, createTestUser, signInBrowser } from './helpers'
import type { TestUser } from './helpers'
import { ACCOUNT_URL, expectSignedIn, scrollToEnd, seedAccount, setProfile } from './account-helpers'

// Account page, part 3: what every page has to satisfy (desktop 1280 and phone 390, the three languages,
// keyboard, reload and back, empty / loading / network error, double clicks, isolation between accounts,
// no prices). The profile / email / password / sign-in methods are in account-profile.spec.ts, sessions,
// download, old local data and deletion in account-data.spec.ts.

let shared: TestUser

test.beforeAll(async () => {
  shared = await createTestUser('acct-common', { displayName: 'Common Cleo' })
})

test.afterAll(async () => {
  await cleanupTestUsers()
})

const section = (page: Page, purpose: string) => page.locator(`[data-purpose="${purpose}"]`)

const SECTIONS = ['account-profile', 'account-email', 'account-password', 'account-methods', 'account-sessions', 'account-data', 'account-delete']

// ---------------------------------------------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------------------------------------------

function flatKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => flatKeys(child, prefix ? `${prefix}.${key}` : key))
}

// Plural forms differ per language (one / other / few ...): compare the key without the suffix.
const plain = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '')

test.describe('translations of the account page', () => {
  for (const namespace of ['account', 'userMenu', 'importDialog', 'topbar', 'support'] as const) {
    test(`"${namespace}" has the same keys in EN, TR and HYW, none empty`, () => {
      const keys = (strings: typeof en) => [...new Set(flatKeys(strings[namespace], namespace).map(plain))].sort()
      expect(keys(tr)).toEqual(keys(en))
      expect(keys(hyw)).toEqual(keys(en))
      const empty = (strings: typeof en) => flatKeys(strings[namespace], namespace).filter((key) => String(key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], { [namespace]: strings[namespace] })).trim() === '')
      expect([empty(en), empty(tr), empty(hyw)]).toEqual([[], [], []])
    })
  }

  const RAW_KEY = new RegExp(`\\b(${Object.keys(en).join('|')})\\.[a-z][A-Za-z]+(\\.[A-Za-z]+)*`, 'i')

  async function unlabelled(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const bad: string[] = []
      document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role="button"], [role="option"]').forEach((element) => {
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return
        const labelledBy = element.getAttribute('aria-labelledby')
        const name = element.getAttribute('aria-label') || (labelledBy ? document.getElementById(labelledBy)?.textContent : '') || (element as HTMLInputElement).labels?.[0]?.textContent || element.textContent || element.getAttribute('title')
        if (!name || !name.trim()) bad.push(element.outerHTML.slice(0, 140))
      })
      return bad
    })
  }

  for (const [code, strings] of [['en', en], ['tr', tr], ['hyw', hyw]] as const) {
    test(`${code}: every label, button and message is translated (no key names, no empty labels), also in the delete dialog`, async ({ page, context }) => {
      await setProfile(shared.id, { display_name: 'Common Cleo', ui_language: code })
      await signInBrowser(context, shared)
      await page.goto(`/account?lng=${code}`)
      await expect(page.getByRole('heading', { name: strings.account.title, level: 1 })).toBeVisible()
      for (const title of [strings.account.profile.title, strings.account.email.title, strings.account.password.title, strings.account.methods.title, strings.account.sessions.title, strings.account.data.title, strings.account.delete.title]) {
        await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible()
      }
      await expect(page.getByRole('button', { name: strings.account.delete.button })).toBeVisible()
      await expect(page.getByRole('button', { name: strings.account.data.download })).toBeVisible()
      await expect(page.getByRole('button', { name: strings.account.sessions.signOut, exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: strings.account.sessions.signOutAll })).toBeVisible()
      await expect(page.locator('input[name="displayName"]').first()).toHaveValue('Common Cleo')
      expect(await page.locator('body').innerText()).not.toMatch(RAW_KEY)
      expect(await unlabelled(page)).toEqual([])

      await page.getByRole('button', { name: strings.account.delete.button }).click()
      const dialog = page.locator('[data-purpose="delete-account-dialog"]')
      await expect(dialog.getByRole('heading', { name: strings.account.delete.dialogTitle })).toBeVisible()
      await expect(dialog.getByLabel(strings.account.delete.confirmLabel)).toBeVisible()
      await expect(dialog.getByRole('button', { name: strings.account.delete.confirm })).toBeVisible()
      expect(await dialog.innerText()).not.toMatch(RAW_KEY)
      expect(await unlabelled(page)).toEqual([])
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------
// Desktop layout, keyboard, reload and back
// ---------------------------------------------------------------------------------------------------------------

test.describe('desktop 1280', () => {
  test.beforeEach(async ({ context }) => {
    await setProfile(shared.id, { display_name: 'Common Cleo', ui_language: 'en' })
    await signInBrowser(context, shared)
  })

  test('every section is there, in order, inside the page, with the support address at the end', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    await expect(page.getByRole('heading', { name: en.account.title, level: 1 })).toBeVisible()
    await expect(page.getByText(en.account.subtitle)).toBeVisible()
    const boxes = []
    for (const purpose of SECTIONS) {
      await expect(section(page, purpose)).toBeVisible()
      boxes.push(await section(page, purpose).boundingBox())
    }
    const tops = boxes.map((box) => box!.y)
    expect(tops).toEqual([...tops].sort((a, b) => a - b))
    for (const box of boxes) expect(box!.x + box!.width).toBeLessThanOrEqual(1280)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    await expect(page.locator('[data-purpose="support-note"]').getByRole('link', { name: 'info@motiqai.com' })).toHaveAttribute('href', 'mailto:info@motiqai.com')
    await expect(page).toHaveTitle(new RegExp(en.account.title))
    // A fresh account has no old local data, so that section is not shown.
    await expect(section(page, 'account-import')).toHaveCount(0)
  })

  test('the keyboard reaches every control in the page; fields are labelled; the delete dialog traps focus and gives it back', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    await expect(section(page, 'account-delete')).toBeVisible()
    await expect(page.getByLabel(en.account.profile.displayName, { exact: true })).toBeVisible()
    await expect(page.getByLabel(en.account.email.new, { exact: true })).toBeVisible()
    await expect(page.getByLabel(en.account.password.new, { exact: true })).toBeVisible()
    await expect(page.getByLabel(en.account.password.confirm, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: en.account.profile.language })).toBeVisible()

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const reached = new Set<string>()
    for (let step = 0; step < 70; step += 1) {
      await page.keyboard.press('Tab')
      reached.add(await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null
        return element ? `${element.getAttribute('name') ?? ''}|${element.id}|${(element.textContent ?? '').trim().slice(0, 40)}` : ''
      }))
    }
    const has = (part: string) => [...reached].some((entry) => entry.includes(part))
    for (const part of ['displayName', 'account-language', 'newEmail', 'newPassword', 'confirmPassword', `|${en.account.sessions.signOut}`, en.account.sessions.signOutAll, en.account.data.download, en.account.delete.button]) {
      expect(has(part), `Tab never reached "${part}"`).toBe(true)
    }

    // Enter on the focused "Delete my account" opens the dialog with the email field focused; Tab stays inside; Escape returns.
    const open = section(page, 'account-delete').getByRole('button', { name: en.account.delete.button })
    await open.focus()
    await page.keyboard.press('Enter')
    const dialog = page.locator('[data-purpose="delete-account-dialog"]')
    await expect(dialog.getByLabel(en.account.delete.confirmLabel)).toBeFocused()
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-purpose="delete-account-dialog"]')))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(open).toBeFocused()
  })

  test('F5 and the browser back / forward keep the right state', async ({ page }) => {
    await page.goto('/?lng=en')
    await expectSignedIn(page)
    await page.locator('[data-purpose="user-menu"] > button').click()
    await page.getByRole('menuitem', { name: en.userMenu.account }).click()
    await expect(page).toHaveURL(/\/account$/)
    const profile = section(page, 'account-profile')
    await expect(profile.locator('input[name="displayName"]')).toHaveValue('Common Cleo')

    // Typed but unsaved text is gone after F5; the saved name is back; the page is still the account.
    await profile.locator('input[name="displayName"]').fill('Not saved')
    await section(page, 'account-email').locator('input[name="newEmail"]').fill('typed@example.com')
    await page.reload()
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole('heading', { name: en.account.title, level: 1 })).toBeVisible()
    await expect(profile.locator('input[name="displayName"]')).toHaveValue('Common Cleo')
    await expect(section(page, 'account-email').locator('input[name="newEmail"]')).toHaveValue('')
    await expect(page.locator('[data-purpose="user-avatar"]')).toHaveText('CC')

    await page.goBack()
    await expect(page).toHaveURL(/\/$|\/\?/)
    await expectSignedIn(page)
    await page.goForward()
    await expect(page.getByRole('heading', { name: en.account.title, level: 1 })).toBeVisible()
    await expect(profile.locator('input[name="displayName"]')).toHaveValue('Common Cleo')
  })

  test('while the profile is still loading the page is usable, then the name appears; without it the page still renders', async ({ page, browser }) => {
    await page.route(/\/rest\/v1\/profiles/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      return route.continue()
    })
    await page.goto(ACCOUNT_URL)
    const profile = section(page, 'account-profile')
    await expect(page.getByRole('heading', { name: en.account.title, level: 1 })).toBeVisible()
    await expect(profile.getByRole('button', { name: en.account.save, exact: true })).toBeDisabled()
    await expect(profile.locator('input[name="displayName"]')).toHaveValue('Common Cleo')
    await expect(page.locator('[data-purpose="user-avatar"]')).toHaveText('CC')

    // The profile request fails altogether: the account page still opens (email, sessions, download, delete work without it).
    const offline = await browser.newContext()
    await signInBrowser(offline, shared)
    const second = await offline.newPage()
    await second.route(/\/rest\/v1\/profiles/, (route) => (route.request().method() === 'GET' ? route.abort('failed') : route.fallback()))
    await second.goto(ACCOUNT_URL)
    await expect(second.getByRole('heading', { name: en.account.title, level: 1 })).toBeVisible()
    await expect(section(second, 'account-delete')).toBeVisible()
    await expect(section(second, 'account-sessions').getByRole('button')).toHaveCount(2)
    await offline.close()
  })

  test('saving the name with the connection cut shows an error and keeps the text; a double click sends one request', async ({ page }) => {
    let patches = 0
    let offline = true
    await page.route(/\/rest\/v1\/profiles/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      patches += 1
      await new Promise((resolve) => setTimeout(resolve, 400))
      return offline ? route.abort('failed') : route.continue()
    })
    await page.goto(ACCOUNT_URL)
    const profile = section(page, 'account-profile')
    const input = profile.locator('input[name="displayName"]')
    await expect(input).toHaveValue('Common Cleo')
    await input.fill('Typed while offline')
    await profile.getByRole('button', { name: en.account.save, exact: true }).dblclick()
    await expect(profile.getByRole('alert').filter({ hasText: en.auth.genericError })).toBeVisible()
    expect(patches).toBe(1)
    await expect(input).toHaveValue('Typed while offline')
    await expect(page.locator('[data-purpose="user-avatar"]')).toHaveText('CC')

    // Back online: the same text saves, and one click is one request.
    offline = false
    patches = 0
    await profile.getByRole('button', { name: en.account.save, exact: true }).dblclick()
    await expect(profile.getByText(en.account.saved, { exact: true })).toBeVisible()
    expect(patches).toBe(1)
  })

  test('no price or cost text anywhere on the page or in the delete dialog (EN and TR)', async ({ page }) => {
    const PRICE = /[$€₺£]|\b(usd|eur|tl)\b|\b(price|prices|pricing|cost|costs|paid|upgrade|billing|invoice|free plan|premium)\b|fiyat|maliyet|ücret|abonelik|ödeme|fatura/i
    for (const code of ['en', 'tr'] as const) {
      await setProfile(shared.id, { ui_language: code })
      await page.goto(`/account?lng=${code}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(section(page, 'account-delete')).toBeVisible()
      await page.getByRole('button', { name: (code === 'en' ? en : tr).account.delete.button }).click()
      await expect(page.locator('[data-purpose="delete-account-dialog"]')).toBeVisible()
      expect(await page.locator('body').innerText()).not.toMatch(PRICE)
      await page.keyboard.press('Escape')
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Another account's data
// ---------------------------------------------------------------------------------------------------------------

test.describe('two accounts', () => {
  test("one account never sees the other's data on any page", async ({ page, context }) => {
    const mine = await createTestUser('iso-a', { displayName: 'Alice Alpha' })
    const theirs = await createTestUser('iso-b', { displayName: 'Bob Bravo' })
    const a = await seedAccount(mine, 'Asecret')
    const b = await seedAccount(theirs, 'Bsecret')
    await signInBrowser(context, mine)

    const noLeak = async () => {
      const text = await page.locator('body').innerText()
      expect(text).not.toContain('Bsecret')
      expect(text).not.toContain('Bob Bravo')
      expect(text).not.toContain(theirs.email)
    }

    await page.goto('/archive?lng=en')
    await expect(page.getByRole('link', { name: `Study — ${a.quizTitle}` })).toBeVisible()
    await noLeak()
    await page.goto('/flashcards?lng=en')
    await expect(page.getByText(a.deckName).first()).toBeVisible()
    await noLeak()
    await page.goto(ACCOUNT_URL)
    await expect(page.locator('input[name="displayName"]').first()).toHaveValue('Alice Alpha')
    await expect(section(page, 'account-email')).toContainText(mine.email)
    await noLeak()
    await page.goto(`/archive/${b.quizId}?lng=en`)
    await expectSignedIn(page)
    await noLeak()
    await page.goto(`/flashcards?lng=en`)
    await noLeak()

    // The database says the same to this account's own client.
    expect((await mine.client.from('decks').select('name')).data?.map((row) => row.name)).toEqual([a.deckName])
    expect((await mine.client.from('quizzes').select('title')).data?.map((row) => row.title)).toEqual([a.quizTitle])
    expect((await mine.client.from('solves').select('id')).data?.map((row) => row.id)).toEqual([a.solveId])
    expect((await mine.client.from('profiles').select('display_name')).data?.map((row) => row.display_name)).toEqual(['Alice Alpha'])
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Phone 390
// ---------------------------------------------------------------------------------------------------------------

test.describe('phone 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test.beforeEach(async ({ context }) => {
    await setProfile(shared.id, { display_name: 'Common Cleo', ui_language: 'en' })
    await signInBrowser(context, shared)
  })

  test('@mobile the bottom tab bar never covers the "Delete my account" button or the end of the page', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    await expect(page.getByRole('heading', { name: en.account.title, level: 1 })).toBeVisible()
    const tabBar = page.locator('[data-purpose="tab-bar"]')
    await expect(tabBar).toBeVisible()
    await scrollToEnd(page)
    const button = section(page, 'account-delete').getByRole('button', { name: en.account.delete.button })
    const support = page.locator('[data-purpose="support-note"]')
    await expect(async () => {
      const tab = (await tabBar.boundingBox())!
      for (const target of [button, support]) {
        const box = (await target.boundingBox())!
        expect(box.y + box.height, 'the element ends below the top of the tab bar').toBeLessThanOrEqual(tab.y + 0.5)
      }
      // The point in the middle of the button belongs to the button, not to the bar on top of it.
      const box = (await button.boundingBox())!
      expect(await button.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true)
    }).toPass({ timeout: 10_000 })
    await button.tap()
    await expect(page.locator('[data-purpose="delete-account-dialog"]')).toBeVisible()
  })

  test('@mobile every section fits the screen and the delete dialog fits with all its buttons reachable', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    await expect(page.getByRole('heading', { name: en.account.title, level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    for (const purpose of SECTIONS) {
      const box = (await section(page, purpose).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(390)
    }
    await section(page, 'account-delete').getByRole('button', { name: en.account.delete.button }).scrollIntoViewIfNeeded()
    await section(page, 'account-delete').getByRole('button', { name: en.account.delete.button }).tap()
    const dialog = page.locator('[data-purpose="delete-account-dialog"]')
    await expect(dialog).toBeVisible()
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
    await dialog.getByRole('button', { name: en.flashcards.common.cancel }).tap()
    await expect(dialog).toHaveCount(0)
  })

  test('@mobile in TR and HYW the long labels stay inside the screen', async ({ page }) => {
    for (const [code, strings] of [['tr', tr], ['hyw', hyw]] as const) {
      await setProfile(shared.id, { ui_language: code })
      await page.goto(`/account?lng=${code}`)
      await expect(page.getByRole('heading', { name: strings.account.title, level: 1 })).toBeVisible()
      await expect(section(page, 'account-delete')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    }
  })
})
