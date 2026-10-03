import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { readStore, seed } from './flashcardHelpers'

const CARDS = [
  { front: 'Üssün üssü kuralı nedir?', back: '$(a^m)^n=a^{m\\cdot n}$' },
  { front: 'Aynı tabanlı üslü sayılar bölünürken ne yapılır?', back: 'Payın üssünden paydanın üssü çıkarılır: $\\frac{a^m}{a^n}=a^{m-n}$.' },
  { front: '$\\frac{2^5\\cdot4^3}{8^3}$ ifadesi aynı tabana çevrilince nasıl sadeleşir?', back: '$\\frac{2^5\\cdot2^6}{2^9}=2^2=4$' },
  { front: '$4^3$ nasıl hesaplanır?', back: '$4^3 = 4\\cdot4\\cdot4 = 64$; $4\\cdot3$ değildir.' },
  { front: '$8$ sayısı $2$ tabanında nasıl yazılır?', back: '$8=2^3$' },
  { front: 'Bozuk LaTeX nasıl görünür?', back: 'Kapanmayan $\\frac{1}{ ifade' },
]

const SOLUTION_RECORD = {
  id: 'sol-math',
  createdAt: '2026-03-01T10:00:00.000Z',
  language: 'tr',
  schemaVersion: 1,
  extras: {},
  result: {
    topic: 'Üslü sayılar',
    question: 'İşlemin sonucu kaçtır? $$\\frac{2^5\\cdot 4^3}{8^3}$$',
    intro: '',
    steps: ['$4$ ve $8$ sayılarını $2$ tabanında yazalım: $$4=2^2,\\qquad 8=2^3.$$'],
    answer: '$4$ (B)',
    tip: '',
    mistakes: [],
  },
}

// None of these may ever show as text.
const RAW = /\$|\\frac|\\cdot|\\qquad|\^\{/

async function openSolutionDialog(page: Page) {
  await page.route('**/api/cards', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cards: CARDS, removed: 0 }) })
  })
  await page.goto('/archive?lng=tr')
  await page.evaluate(async (record) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('quelio-solutions', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('solutions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
      request.onsuccess = () => resolve(request.result)
    })
    await new Promise<void>((resolve) => {
      const tx = db.transaction('solutions', 'readwrite')
      tx.objectStore('solutions').put(record)
      tx.oncomplete = () => resolve()
    })
    db.close()
  }, SOLUTION_RECORD)
  await page.goto(`/archive/solutions/${SOLUTION_RECORD.id}?lng=tr`)
  await page.locator('[data-purpose="solution-actions"]').getByRole('button').filter({ hasText: /Daha fazla|More/ }).first().click()
  await page.getByRole('menuitem', { name: /Kart yap/ }).click()
  return page.locator('[data-purpose="add-cards-dialog"]')
}

test.describe('math on cards', () => {
  test('Kart yap window renders math, edits on click and renders again; broken LaTeX shows plain text', async ({ page }) => {
    const dialog = await openSolutionDialog(page)
    const list = dialog.locator('[data-purpose="review-list"]')
    await expect(list.locator('[data-purpose="review-card"]')).toHaveCount(6)
    await expect(list.locator('.katex').first()).toBeVisible()
    const visible = (await list.innerText()).replace(/\s+/g, ' ')
    expect(visible).not.toMatch(RAW)

    // Click a rendered side -> field with the source; edit; leave -> rendered again.
    const first = list.locator('[data-purpose="review-back-rendered"]').first()
    await first.click()
    const field = list.locator('textarea').nth(1)
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('$(a^m)^n=a^{m\\cdot n}$')
    await field.fill('$x^2$')
    await dialog.getByRole('heading').first().click()
    await expect(list.locator('[data-purpose="review-back-rendered"]').first().locator('.katex')).toBeVisible()
    expect((await list.innerText()).replace(/\s+/g, ' ')).not.toMatch(RAW)

    await dialog.locator('[data-purpose="convert-deck-name"]').fill('Üslü sayılar')
    await dialog.locator('button.bg-amber').click()
    await expect.poll(async () => (await readStore(page)).cards.length).toBe(6)
    expect((await readStore(page)).cards.map((card) => card.back)).toContain('$x^2$')
  })

  test('deck view and study mode show rendered math; editing keeps working', async ({ page }) => {
    await page.goto('/flashcards?lng=tr')
    await seed(
      page,
      [{ id: 'd1', name: 'Üslü sayılar', cards: CARDS.map((card, index) => ({ id: `c${index}`, ...card })) }],
      '/flashcards/d1?lng=tr',
    )
    const rows = page.locator('[data-purpose="card-row"]')
    await expect(rows).toHaveCount(6)
    await expect(rows.first().locator('.katex').first()).toBeVisible()
    expect((await rows.first().innerText()).replace(/\s+/g, ' ')).not.toMatch(RAW)

    const back = rows.nth(4).locator('[data-purpose="card-back-rendered"]')
    await back.click()
    const field = rows.nth(4).locator('[data-purpose="card-back"]')
    await expect(field).toHaveValue('$8=2^3$')
    await field.fill('$9=3^2$')
    await rows.nth(0).locator('[data-purpose="card-front"]').click()
    await expect(rows.nth(4).locator('[data-purpose="card-back-rendered"] .katex')).toBeVisible()

    // Broken LaTeX shows plain text, never the code.
    const broken = (await rows.nth(5).innerText()).replace(/\s+/g, ' ')
    expect(broken).not.toMatch(RAW)
    expect(broken).toContain('Kapanmayan')

    await page.goto('/flashcards/d1/study?lng=tr')
    const front = page.locator('[data-purpose="flashcard-front"]')
    await expect(front).toBeVisible()
    expect((await front.innerText()).replace(/\s+/g, ' ')).not.toMatch(RAW)
    await page.keyboard.press('Space')
    expect((await page.locator('[data-purpose="flashcard-back"]').innerText()).replace(/\s+/g, ' ')).not.toMatch(RAW)
  })

  test('@mobile the Kart yap window fits at 390px with rendered math', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    const dialog = await openSolutionDialog(page)
    await expect(dialog.locator('[data-purpose="review-card"]')).toHaveCount(6)
    const box = await dialog.boundingBox()
    expect(box?.width ?? 0).toBeLessThanOrEqual(390)
    const overflow = await dialog.evaluate((node) => node.scrollWidth > node.clientWidth + 1)
    expect(overflow).toBe(false)
  })
})

test.describe('Solve → Create handoff', () => {
  test('the quiz text box gets readable math, not LaTeX code', async ({ page }) => {
    await page.goto('/archive?lng=tr')
    await page.evaluate(async (record) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('quelio-solutions', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('solutions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
        request.onsuccess = () => resolve(request.result)
      })
      await new Promise<void>((resolve) => {
        const tx = db.transaction('solutions', 'readwrite')
        tx.objectStore('solutions').put(record)
        tx.oncomplete = () => resolve()
      })
      db.close()
    }, SOLUTION_RECORD)
    await page.goto(`/archive/solutions/${SOLUTION_RECORD.id}?lng=tr`)
    await page.locator('[data-purpose="solution-actions"]').getByRole('button').filter({ hasText: /Daha fazla|More/ }).first().click()
    await page.getByRole('menuitem', { name: 'Bu konudan quiz oluştur' }).click()
    const box = page.locator('textarea').first()
    await expect(box).toHaveValue(/\(2⁵ · 4³\) \/ 8³/)
    const value = await box.inputValue()
    expect(value).not.toMatch(RAW)
    expect(value).toContain('4 = 2², 8 = 2³')
    expect(value).toContain('Cevap: 4 (B)')
  })
})
