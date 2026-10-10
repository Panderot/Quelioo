import { mkdirSync } from 'node:fs'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { cleanupTestUsers } from '../supabase/helpers'
import { BASE, command, createGame, createTestUser, insertQuiz, joinGame, signInBrowser } from './helpers'

test.afterAll(async () => {
  await cleanupTestUsers()
})

const at = (page: Page, purpose: string) => page.locator(`[data-purpose="${purpose}"]`)

test('the lobby address and QR use the current origin outside production', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await signInBrowser(context, teacher)
  const page = await context.newPage()
  await page.goto(`/live/new?quiz=${quizId}`)
  await at(page, 'live-open-lobby').click()
  const code = ((await at(page, 'live-game-code').textContent()) ?? '').replace(/\s/g, '')
  await expect(at(page, 'live-join-address')).toHaveText(`${new URL(BASE).host}/katil`)
  await expect(at(page, 'live-qr')).toHaveAttribute('data-value', `${BASE}/katil/${code}`)
  await context.close()
})

test('a cancelled game is listed as Cancelled; an empty cancelled lobby is not listed', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher, undefined, 'Cancel check quiz')
  const empty = await createGame(teacher, quizId)
  await command(teacher, empty.body.id, 'close')
  const withPlayer = await createGame(teacher, quizId)
  await joinGame(withPlayer.body.code, 'Ayse')
  await command(teacher, withPlayer.body.id, 'close')

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await signInBrowser(context, teacher)
  const page = await context.newPage()
  await page.goto('/live')
  const rows = at(page, 'live-history').locator('li')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Cancelled')
  await expect(rows.first()).not.toContainText('Ended')
  await context.close()
})

test('the app sidebar shows on the hub, settings and results pages at 1580 x 900', async ({ browser }) => {
  mkdirSync('test-results', { recursive: true })
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const created = await createGame(teacher, quizId)
  await joinGame(created.body.code, 'Ayse')
  await command(teacher, created.body.id, 'finish')

  const context = await browser.newContext({ viewport: { width: 1580, height: 900 } })
  await signInBrowser(context, teacher)
  const page = await context.newPage()
  const pages: [string, string][] = [
    ['hub', '/live'],
    ['settings', `/live/new?quiz=${quizId}`],
    ['results', `/live/${created.body.id}/results`],
  ]
  for (const [name, path] of pages) {
    await page.goto(path)
    await expect(at(page, 'sidebar-navigation')).toBeVisible()
    await page.screenshot({ path: `test-results/live-sidebar-${name}-1580.png` })
  }
  await context.close()
})
