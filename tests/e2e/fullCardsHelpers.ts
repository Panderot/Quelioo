import { readFileSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'

import { expect } from './strict'

/** Helpers shared by tests/e2e/full-cards*.spec.ts (the "Kartlar" full-coverage specs). */

export type Lng = 'en' | 'tr' | 'hyw'
export const LANGUAGES: Lng[] = ['en', 'tr', 'hyw']

/** Tuesday 2026-03-10 14:00 local. */
export const NOW = new Date(2026, 2, 10, 14, 0, 0)

export const card = (page: Page) => page.locator('[data-purpose="flashcard"]')
export const cardRows = (page: Page) => page.locator('[data-purpose="card-row"]')
export const deckRows = (page: Page) => page.locator('[data-purpose="deck-row"]')
export const progress = (page: Page) => page.locator('[data-purpose="study-progress"]')

/** Sets the fake clock (Date only; timers keep running), then opens `path`. */
export async function openAt(page: Page, path: string, when: Date = NOW) {
  await page.clock.setFixedTime(when)
  await page.goto(path)
}

interface Json {
  [key: string]: Json | string
}

/** A UI string straight from the locale file, with {{vars}} filled in. Keeps expectations free of hard-coded translations. */
export function loc(lng: Lng, key: string, vars: Record<string, string | number> = {}): string {
  let node: Json | string = JSON.parse(readFileSync(`src/i18n/locales/${lng}.json`, 'utf8')) as Json
  for (const part of key.split('.')) {
    if (typeof node === 'string') break
    node = node[part]
  }
  if (typeof node !== 'string') throw new Error(`missing locale key ${lng}:${key}`)
  return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name]))
}

export function flattenLocale(lng: Lng): Record<string, string> {
  const result: Record<string, string> = {}
  const walk = (node: Json | string, prefix: string) => {
    if (typeof node === 'string') {
      result[prefix] = node
      return
    }
    for (const [key, value] of Object.entries(node)) walk(value, prefix ? `${prefix}.${key}` : key)
  }
  walk(JSON.parse(readFileSync(`src/i18n/locales/${lng}.json`, 'utf8')) as Json, '')
  return result
}

export interface StoredCard {
  id: string
  deckId: string
  /** Set only on question-notebook cards (the solved problem they came from). */
  solutionId: string | null
  front: string
  back: string
  box: number
  due: number
  lapses: number
  reviews: number
  introducedAt: number | null
  createdAt: number
}

export interface StoredDeck {
  id: string
  name: string
  newPerDay: number
}

/** The browser-local IndexedDB store, as the app wrote it. */
export async function stored(page: Page): Promise<{ decks: StoredDeck[]; cards: StoredCard[] }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('quelio-flashcards', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all = (store: string) =>
      new Promise<unknown[]>((resolve) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result)
      })
    const result = { decks: (await all('decks')) as never, cards: (await all('cards')) as never }
    db.close()
    return result
  }) as Promise<{ decks: StoredDeck[]; cards: StoredCard[] }>
}

/** A stored card's front/back pairs in creation order. */
export async function storedPairs(page: Page, deckId: string): Promise<{ front: string; back: string }[]> {
  return (await stored(page)).cards
    .filter((entry) => entry.deckId === deckId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ front, back }) => ({ front, back }))
}

/** Flips the current study card and answers it with the keyboard (Space, then 2 = know / 1 = don't know). */
export async function gradeByKeyboard(page: Page, known: boolean) {
  await page.keyboard.press('Space')
  await expect(card(page)).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press(known ? '2' : '1')
}

/** Flips the current study card and answers it with the mouse. */
export async function gradeByMouse(page: Page, known: boolean) {
  await card(page).click()
  await page.getByRole('button', { name: known ? 'Know' : "Don't know", exact: true }).click()
}

export async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
}

/** Controls inside <main> with no accessible name (aria-label, aria-labelledby, <label>, text or title). */
async function unlabelledControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nameOf = (element: Element): string => {
      const label = element.getAttribute('aria-label')
      if (label && label.trim()) return label.trim()
      const by = element.getAttribute('aria-labelledby')
      if (by) {
        const text = by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim()
        if (text) return text
      }
      const labels = (element as HTMLInputElement).labels
      if (labels && labels.length > 0) {
        const text = Array.from(labels)
          .map((entry) => entry.textContent ?? '')
          .join(' ')
          .trim()
        if (text) return text
      }
      const own = ((element as HTMLElement).innerText ?? '').trim()
      if (own) return own
      return (element.getAttribute('title') ?? '').trim()
    }
    const problems: string[] = []
    const selector = 'main input, main textarea, main select, main button, main a[href], main [role="button"], main [role="tab"], main [role="checkbox"], main [role="combobox"]'
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (element.closest('[aria-hidden="true"]') || element.getAttribute('aria-hidden') === 'true') continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0 || getComputedStyle(element).visibility === 'hidden') continue
      if (!nameOf(element)) problems.push(element.outerHTML.slice(0, 140))
    }
    return problems
  })
}

const RAW_KEY = /\b(?:flashcards|create|common|nav|data|app)\.[a-zA-Z_]+(?:\.[a-zA-Z_]+)*\b/
const COST_WORDS = /\$|maliyet|\bcosts?\b|\btokens?\b|önbellek|cached|provider|դոլար|ծախս/i

/** A screen shows no translation key, no empty label, no template leftovers and no price or cost wording. */
export async function expectCleanScreen(page: Page, where: string) {
  const text = await page.locator('body').innerText()
  expect(text, `raw translation key on ${where}`).not.toMatch(RAW_KEY)
  expect(text, `template leftover on ${where}`).not.toMatch(/\{\{|undefined|\[object|NaN/)
  expect(text, `price or cost wording on ${where}`).not.toMatch(COST_WORDS)
  expect(await unlabelledControls(page), `controls without a name on ${where}`).toEqual([])
}

/**
 * On a phone, after scrolling to the very end: no interactive element of the page sits under the bottom tab bar,
 * and the last one really receives a click at its centre.
 */
export async function expectEndNotCovered(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const result = await page.evaluate(() => {
    const tab = document.querySelector('[data-purpose="tab-bar"]')
    const tabTop = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().top : window.innerHeight
    const controls = Array.from(document.querySelectorAll('main a[href], main button, main input, main textarea, main [role="button"]')).filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[aria-hidden="true"]')
    })
    const last = controls.reduce<Element | null>((best, element) => (!best || element.getBoundingClientRect().bottom > best.getBoundingClientRect().bottom ? element : best), null)
    if (!last) return { tabTop, bottom: 0, hit: true, label: '' }
    const rect = last.getBoundingClientRect()
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return { tabTop, bottom: rect.bottom, hit: Boolean(target && (last === target || last.contains(target) || target.contains(last))), label: last.outerHTML.slice(0, 100) }
  })
  expect(result.bottom, `lowest control ${result.label} must end above the tab bar`).toBeLessThanOrEqual(result.tabTop + 0.5)
  expect(result.hit, `lowest control ${result.label} must receive the click`).toBe(true)
}

/** Accessible name of the element that has keyboard focus (aria-label, aria-labelledby, <label>, text). */
export async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return ''
    const label = element.getAttribute('aria-label')
    if (label && label.trim()) return label.trim()
    const by = element.getAttribute('aria-labelledby')
    if (by) {
      const text = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim()
      if (text) return text
    }
    return ((element as HTMLElement).innerText ?? '').trim() || (element.getAttribute('title') ?? '').trim()
  })
}

/**
 * Two clicks on the same element with only a task boundary between them: the framework has re-rendered by then, so the
 * second click reaches the button only if the app left it in place (a double submit would save twice).
 */
export async function fastDoubleClick(target: Locator) {
  await target.evaluate(async (element) => {
    ;(element as HTMLElement).click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    ;(element as HTMLElement).click()
  })
}
