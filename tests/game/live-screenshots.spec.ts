import { mkdirSync } from 'node:fs'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { cleanupTestUsers } from '../supabase/helpers'
import { createTestUser, insertQuiz, signInBrowser } from './helpers'

// Run on demand: SHOTS=1 npx playwright test --config=playwright.game.config.ts tests/game/live-screenshots.spec.ts
test.skip(!process.env.SHOTS, 'screenshots are made on demand (SHOTS=1)')

const DIR = 'test-results/live-shots'
test.afterAll(async () => {
  await cleanupTestUsers()
})

const at = (page: Page, purpose: string) => page.locator(`[data-purpose="${purpose}"]`)

test('screenshots of every live screen', async ({ browser }) => {
  mkdirSync(DIR, { recursive: true })
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher, undefined, 'Quiz night: numbers and places')
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  await signInBrowser(desktop, teacher)
  const page = await desktop.newPage()

  await page.goto('/live')
  await at(page, 'live-start-game').click()
  await expect(at(page, 'live-pick-quiz')).toHaveCount(1)
  await page.screenshot({ path: `${DIR}/01-hub-1920.png` })

  await page.goto(`/live/new?quiz=${quizId}`)
  await at(page, 'live-toggle-skipped').click()
  await page.screenshot({ path: `${DIR}/02-settings-1920.png`, fullPage: true })
  await page.locator('input[name="live-seconds"][value="30"]').check({ force: true })
  await at(page, 'live-open-lobby').click()
  await expect(at(page, 'live-game-code')).toBeVisible()
  const code = ((await at(page, 'live-game-code').textContent()) ?? '').replace(/\s/g, '')

  const names = ['Ayse', 'Mehmet', 'Zeynep', 'Can', 'Elif', 'Baris', 'Defne', 'Kerem']
  const students: { page: Page; name: string }[] = []
  for (const name of names) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const phone = await context.newPage()
    await phone.goto(`/katil/${code}`)
    if (name === 'Ayse') await phone.screenshot({ path: `${DIR}/03-phone-join-390.png` })
    await at(phone, 'join-nickname').fill(name)
    await at(phone, 'join-submit').click()
    await expect(at(phone, 'play-waiting')).toBeVisible()
    if (name === 'Ayse') await phone.screenshot({ path: `${DIR}/04-phone-waiting-390.png` })
    students.push({ page: phone, name })
  }
  await expect(at(page, 'live-player-count')).toContainText('8')
  await page.screenshot({ path: `${DIR}/05-lobby-qr-1920.png` })

  await at(page, 'live-start').click()
  await expect(at(students[0].page, 'play-question')).toBeVisible()
  await page.screenshot({ path: `${DIR}/06-board-question-1920.png` })
  await students[0].page.screenshot({ path: `${DIR}/07-phone-question-390.png` })
  // Most pick option 1 (right), a few the others.
  for (const [i, student] of students.entries()) {
    await student.page.locator(`[data-purpose="play-option"][data-option="${i < 5 ? 1 : i % 4}"]`).click()
  }
  await expect(at(page, 'live-chart')).toBeVisible()
  await expect(at(students[0].page, 'play-result')).toBeVisible()
  await page.screenshot({ path: `${DIR}/08-board-reveal-chart-leaderboard-1920.png` })
  await students[0].page.screenshot({ path: `${DIR}/09-phone-result-correct-390.png` })
  await students[6].page.screenshot({ path: `${DIR}/10-phone-result-wrong-390.png` })

  await at(page, 'live-next').click()
  for (const student of students.slice(0, 4)) await student.page.locator('[data-purpose="play-option"][data-option="0"]').click()
  await at(page, 'live-end-now').click()
  await expect(at(page, 'live-top5')).toBeVisible()
  await page.screenshot({ path: `${DIR}/11-board-leaderboard-after-question-1920.png` })

  await at(page, 'live-finish').click()
  await page.locator('[data-purpose="live-confirm"]').getByRole('button', { name: 'End game' }).click()
  await expect(at(page, 'live-podium')).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${DIR}/12-board-podium-1920.png` })
  await expect(at(students[0].page, 'play-final')).toBeVisible()
  await students[0].page.screenshot({ path: `${DIR}/13-phone-final-390.png` })

  await page.getByRole('link', { name: 'Results page' }).click()
  await expect(at(page, 'live-rank-row').first()).toBeVisible()
  await page.screenshot({ path: `${DIR}/14-results-page-1920.png`, fullPage: true })
  await desktop.close()
})
