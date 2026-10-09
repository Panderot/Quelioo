import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { unzipSync, strFromU8 } from 'fflate'

import { cleanupTestUsers } from '../supabase/helpers'
import { createTestUser, insertQuiz, signInBrowser } from './helpers'
import type { TestUser } from './helpers'

test.afterAll(async () => {
  await cleanupTestUsers()
})

const board = (page: Page, purpose: string) => page.locator(`[data-purpose="${purpose}"]`)

async function newStudent(browser: Browser, code: string, nickname: string, width = 360): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.goto(`/katil/${code}`)
  await board(page, 'join-nickname').fill(nickname)
  await board(page, 'join-submit').click()
  await expect(board(page, 'play-waiting')).toBeVisible()
  return { context, page }
}

async function openLobby(teacher: TestUser, context: BrowserContext, quizId: string, settings?: (page: Page) => Promise<void>): Promise<{ page: Page; code: string; gameId: string }> {
  await signInBrowser(context, teacher)
  const page = await context.newPage()
  await page.goto(`/live/new?quiz=${quizId}`)
  if (settings) await settings(page)
  await board(page, 'live-open-lobby').click()
  await expect(board(page, 'live-game-code')).toBeVisible()
  const code = ((await board(page, 'live-game-code').textContent()) ?? '').replace(/\s/g, '')
  expect(code).toMatch(/^\d{6}$/)
  return { page, code, gameId: page.url().split('/live/')[1] }
}

const option = (page: Page, n: number) => board(page, 'play-option').and(page.locator(`[data-option="${n}"]`))

test('hub, quiz picker, playable summary with the skipped list, and "nothing playable" advice', async ({ browser }) => {
  const teacher = await createTestUser('host')
  await insertQuiz(teacher, undefined, 'Mixed quiz')
  const blanksId = await insertQuiz(teacher, [{ id: 'f1', question: 'Fill the gap', explanation: '', type: 'fill-blanks', answer: 'x' }], 'Blanks only')
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await signInBrowser(context, teacher)
  const page = await context.newPage()
  await page.goto('/live')
  await expect(page.getByRole('heading', { name: 'Live Game' })).toBeVisible()
  await expect(board(page, 'live-history')).toContainText('Finished games will appear here')
  await board(page, 'live-start-game').click()
  await expect(board(page, 'live-pick-quiz')).toHaveCount(2)
  await page.getByRole('searchbox').fill('mixed')
  await expect(board(page, 'live-pick-quiz')).toHaveCount(1)
  await board(page, 'live-pick-quiz').click()

  await expect(page).toHaveURL(/\/live\/new\?quiz=/)
  await expect(board(page, 'live-playable-summary')).toContainText('5 questions of this quiz fit a live game, 1 will be skipped')
  await board(page, 'live-toggle-skipped').click()
  await expect(board(page, 'live-skipped-list')).toContainText('Name the largest planet.')
  await expect(board(page, 'live-settings')).toBeVisible()
  await expect(page.locator('input[name="live-seconds"][value="20"]')).toBeChecked()
  await expect(board(page, 'live-setting-leaderboard')).toBeChecked()
  await expect(board(page, 'live-setting-shuffle')).not.toBeChecked()
  await expect(board(page, 'live-setting-sound')).toBeChecked()
  await expect(board(page, 'live-setting-max')).toHaveValue('60')

  await page.goto(`/live/new?quiz=${blanksId}`)
  await expect(board(page, 'live-none-playable')).toBeVisible()
  await expect(board(page, 'live-open-lobby')).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Generate a multiple-choice quiz' })).toBeVisible()
  await context.close()
})

test('lobby: code, QR, address, live join list, remove with confirmation, lock', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const { page, code } = await openLobby(teacher, context, quizId)
  await expect(board(page, 'live-qr')).toBeVisible()
  await expect(board(page, 'live-join-address')).toContainText('/katil')
  await expect(board(page, 'live-start')).toBeDisabled()
  await expect(board(page, 'live-player-count')).toContainText('0 students joined')

  const ayse = await newStudent(browser, code, 'Ayse')
  const kid = await newStudent(browser, code, 'Kid')
  await expect(board(page, 'live-player-count')).toContainText('2 students joined')
  await expect(board(page, 'live-start')).toBeEnabled()

  // Remove Kid: a short confirmation first; Cancel keeps them.
  await page.getByRole('button', { name: /Remove — Kid/ }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(board(page, 'live-player-list')).toContainText('Kid')
  await page.getByRole('button', { name: /Remove — Kid/ }).click()
  await page.locator('[data-purpose="live-confirm"]').getByRole('button', { name: 'Remove' }).click()
  await expect(board(page, 'live-player-list')).not.toContainText('Kid')
  await expect(board(kid.page, 'join-page')).toBeVisible()
  await expect(board(kid.page, 'join-error')).toContainText('removed you')

  // Lock: a new student is told the lobby is locked.
  await page.getByRole('button', { name: 'Lock lobby' }).click()
  await expect(page.getByText('Lobby locked')).toBeVisible()
  const late = await kid.context.newPage()
  await late.goto(`/katil/${code}`)
  await expect(board(late, 'join-error')).toContainText('locked the lobby')
  await page.getByRole('button', { name: 'Unlock lobby' }).click()
  await expect(page.getByText('Lobby locked')).toBeHidden()

  await page.screenshot({ path: 'test-results/live-lobby.png' })
  await ayse.context.close()
  await kid.context.close()
  await context.close()
})

test('a whole game with keys, pause, skip, end early, multi-answer, true/false, podium, results, exports and play again', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true })
  const { page, code, gameId } = await openLobby(teacher, context, quizId, async (setup) => {
    await setup.locator('input[name="live-seconds"][value="10"]').check({ force: true })
    await board(setup, 'live-setting-sound').uncheck()
  })
  const ayse = await newStudent(browser, code, 'Ayse')
  const mehmet = await newStudent(browser, code, 'Mehmet')
  await expect(board(page, 'live-player-count')).toContainText('2 students joined')

  // Space starts the game.
  await page.keyboard.press('Space')
  await expect(board(page, 'live-progress')).toContainText('Question 1 of 5')
  await expect(board(ayse.page, 'play-question')).toBeVisible()
  // Pause with P: the phones stop, the board says so; P again resumes.
  await page.keyboard.press('p')
  await expect(board(page, 'live-paused')).toBeVisible()
  await expect(option(ayse.page, 1)).toBeDisabled()
  await page.keyboard.press('p')
  await expect(board(page, 'live-paused')).toBeHidden()
  await expect(option(ayse.page, 1)).toBeEnabled()

  // Ayse answers; the live counter moves; Space ends the question early.
  await option(ayse.page, 1).click()
  await expect(board(ayse.page, 'play-sent')).toBeVisible()
  await expect(board(page, 'live-answered')).toContainText('1 / 2 answered')
  await page.keyboard.press('Space')
  await expect(board(page, 'live-chart')).toBeVisible()
  await expect(board(ayse.page, 'play-result')).toHaveAttribute('data-correct', 'true')
  await expect(board(mehmet.page, 'play-result-text')).toContainText('No answer')
  await expect(board(ayse.page, 'play-result-text')).toContainText('Correct! +')

  // Q2: true/false with True/False buttons on the phone. Skip does not reveal and does not count.
  await page.keyboard.press('ArrowRight')
  await expect(board(page, 'live-progress')).toContainText('Question 2 of 5')
  await expect(option(ayse.page, 0)).toContainText('True')
  await board(page, 'live-skip').click()
  await expect(board(page, 'live-progress')).toContainText('Question 3 of 5')

  // Q3 (multi-answer): pick two, then confirm.
  await expect(board(page, 'live-question')).toContainText('Choose every right answer')
  // The phones catch up with the board on their own: click only once each shows question 3.
  await expect(board(ayse.page, 'play-question-text')).toContainText('Which are prime numbers?')
  await expect(board(mehmet.page, 'play-question-text')).toContainText('Which are prime numbers?')
  await option(ayse.page, 0).click()
  await expect(option(ayse.page, 0)).toHaveAttribute('aria-pressed', 'true')
  await option(ayse.page, 2).click()
  await board(ayse.page, 'play-confirm').click()
  await option(mehmet.page, 0).click()
  await board(mehmet.page, 'play-confirm').click()
  await expect(board(page, 'live-chart')).toBeVisible()
  await expect(board(ayse.page, 'play-result')).toHaveAttribute('data-correct', 'true')
  await expect(board(mehmet.page, 'play-result')).toHaveAttribute('data-correct', 'false')

  // End the game from the board (with the short confirmation): podium and full ranking.
  await board(page, 'live-finish').click()
  await page.locator('[data-purpose="live-confirm"]').getByRole('button', { name: 'End game' }).click()
  await expect(board(page, 'live-podium')).toBeVisible()
  await expect(board(page, 'live-podium-1')).toContainText('Ayse')
  await expect(board(page, 'live-podium-2')).toContainText('Mehmet')
  await expect(board(page, 'live-ranking')).toContainText('Mehmet')
  await expect(board(ayse.page, 'play-final-rank')).toContainText('1 of 2')
  await page.screenshot({ path: 'test-results/live-podium.png' })

  // Results page.
  await page.getByRole('link', { name: 'Results page' }).click()
  await expect(page).toHaveURL(new RegExp(`/live/${gameId}/results`))
  await expect(board(page, 'live-rank-row')).toHaveCount(2)
  await expect(board(page, 'live-question-stats')).toContainText('Which are prime numbers?')
  await expect(page.locator('[data-hardest="true"]')).toHaveCount(1)
  await expect(board(page, 'live-results-facts')).toContainText('Live test quiz')
  await expect(board(page, 'live-results-ranking')).toContainText('deleted 30 days after the game')

  const [csv] = await Promise.all([page.waitForEvent('download'), board(page, 'live-export-csv').click()])
  const csvText = readFileSync((await csv.path())!, 'utf8')
  expect(csv.suggestedFilename()).toMatch(/^quelio-live-.*\.csv$/)
  expect(csvText.charCodeAt(0)).toBe(0xfeff)
  expect(csvText).toContain('Rank,Nickname,Score')
  expect(csvText).toMatch(/1,Ayse,\d+/)
  expect(csvText).toMatch(/2,Mehmet,0/)
  expect(csvText).toContain('Which are prime numbers?')

  const [xlsx] = await Promise.all([page.waitForEvent('download'), board(page, 'live-export-xlsx').click()])
  expect(xlsx.suggestedFilename()).toMatch(/^quelio-live-.*\.xlsx$/)
  const files = unzipSync(new Uint8Array(readFileSync((await xlsx.path())!)))
  expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']))
  const sheet1 = strFromU8(files['xl/worksheets/sheet1.xml'])
  expect(sheet1).toContain('Ayse')
  expect(sheet1).toContain('Mehmet')
  expect(strFromU8(files['xl/worksheets/sheet2.xml'])).toContain('Which are prime numbers?')
  expect(strFromU8(files['xl/workbook.xml'])).toContain('Ranking')

  // The hub lists it, and "play again with this quiz" opens a fresh lobby with another code.
  await page.goto('/live')
  await expect(board(page, 'live-history')).toContainText('Live test quiz')
  await expect(board(page, 'live-history')).toContainText('2 players')
  await board(page, 'live-history-results').first().click()
  await board(page, 'live-results-play-again').click()
  await expect(board(page, 'live-game-code')).toBeVisible()
  expect(page.url()).not.toContain(gameId)
  const newCode = ((await board(page, 'live-game-code').textContent()) ?? '').replace(/\s/g, '')
  expect(newCode).not.toBe(code)

  await ayse.context.close()
  await mehmet.context.close()
  await context.close()
})

test('reconnect: a student who reloads mid-question and a teacher who reloads the board are back at the same moment', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const { page, code } = await openLobby(teacher, context, quizId)
  const ayse = await newStudent(browser, code, 'Ayse')
  const mehmet = await newStudent(browser, code, 'Mehmet')
  await board(page, 'live-start').click()
  await expect(board(ayse.page, 'play-question')).toBeVisible()

  await option(mehmet.page, 1).click()
  await expect(board(mehmet.page, 'play-sent')).toBeVisible()
  await expect(board(page, 'live-answered')).toContainText('1 / 2')
  // Mehmet's phone reloads: same nickname, still "answer sent", the same question.
  await mehmet.page.reload()
  await expect(board(mehmet.page, 'play-nickname')).toHaveText('Mehmet')
  await expect(board(mehmet.page, 'play-sent')).toBeVisible()
  await expect(board(mehmet.page, 'play-question-text')).toContainText('2 + 2')
  // Same for Ayse before answering; then she answers and the game moves on.
  await ayse.page.reload()
  await expect(board(ayse.page, 'play-nickname')).toHaveText('Ayse')
  await option(ayse.page, 1).click()
  await expect(board(page, 'live-chart')).toBeVisible()

  // Teacher reload during the reveal: the board returns to the reveal; the hub offers the game in progress.
  await page.reload()
  await expect(board(page, 'live-chart')).toBeVisible()
  await expect(board(page, 'live-progress')).toContainText('Question 1 of 5')
  await page.goto('/live')
  await expect(board(page, 'live-running')).toContainText('Game in progress')
  await board(page, 'live-resume-game').click()
  await expect(board(page, 'live-chart')).toBeVisible()
  // The score survived on the phone too.
  await expect(board(ayse.page, 'play-result')).toHaveAttribute('data-correct', 'true')

  await ayse.context.close()
  await mehmet.context.close()
  await context.close()
})

test('timer: when time runs out the phones lock and the board reveals by itself', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const { page, code } = await openLobby(teacher, context, quizId, async (setup) => {
    await setup.locator('input[name="live-seconds"][value="10"]').check({ force: true })
  })
  const ayse = await newStudent(browser, code, 'Ayse')
  const mehmet = await newStudent(browser, code, 'Mehmet')
  await board(page, 'live-start').click()
  await option(ayse.page, 1).click()
  await expect(board(page, 'live-seconds')).toHaveText(/^(9|8|7|10)$/)
  // Mehmet never answers: after the 10 seconds the answer shows without anyone pressing anything.
  await expect(board(page, 'live-chart')).toBeVisible({ timeout: 20_000 })
  await expect(board(mehmet.page, 'play-result-text')).toContainText('No answer')
  await ayse.context.close()
  await mehmet.context.close()
  await context.close()
})

test('sidebar item and Archive actions', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await signInBrowser(context, teacher)
  const page = await context.newPage()
  await page.goto('/archive')
  const nav = page.locator('[data-purpose="sidebar-navigation"] a')
  await expect(nav.first()).toBeVisible()
  const labels = await nav.allTextContents()
  const live = labels.findIndex((label) => label.includes('Live Game'))
  expect(live).toBeGreaterThan(-1)
  expect(labels[live - 1]).toContain('Flashcards')
  expect(labels[live + 1]).toContain('Audio Lesson')
  await expect(page.locator('[data-purpose="sidebar-navigation"] a[href="/live"]')).toBeVisible()

  await expect(board(page, 'archive-live')).toHaveCount(1)
  await board(page, 'archive-live').click()
  await expect(page).toHaveURL(new RegExp(`/live/new\\?quiz=${quizId}`))
  await page.goto(`/archive/${quizId}`)
  await board(page, 'archive-live').click()
  await expect(page).toHaveURL(new RegExp(`/live/new\\?quiz=${quizId}`))
  await context.close()
})

test('/katil works signed out: no landing page, no sign-in, privacy note, wrong code, three languages', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.goto('/katil')
  await expect(board(page, 'join-page')).toBeVisible()
  await expect(page).toHaveURL(/\/katil$/)
  await expect(page.getByRole('heading', { name: 'Join a game' })).toBeVisible()
  await expect(board(page, 'join-privacy')).toContainText("You don't need to write your first or last name")
  await expect(page.getByRole('link', { name: /sign in/i })).toHaveCount(0)
  await board(page, 'join-code').fill('000000')
  await board(page, 'join-code-next').click()
  await expect(board(page, 'join-error')).toContainText("doesn't match a game")

  await page.goto('/katil?lng=tr')
  await expect(page.getByRole('heading', { name: 'Yarışmaya katıl' })).toBeVisible()
  await expect(board(page, 'join-privacy')).toContainText('Ad veya soyad yazmana gerek yok; bir takma ad yeterli. Yarışma verileri 30 gün sonra silinir.')
  await page.goto('/katil?lng=hyw')
  await expect(page.getByRole('heading', { name: 'Միանալ մրցումին' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hyw')
  // No horizontal scroll at 360px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await context.close()
})

test('phone layout at 360px: no sideways scroll while answering, in the result and at the end @mobile', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const { page, code } = await openLobby(teacher, context, quizId)
  const student = await newStudent(browser, code, 'Ayse', 360)
  const fits = () => student.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(await fits()).toBe(true)
  await board(page, 'live-start').click()
  await expect(board(student.page, 'play-question')).toBeVisible()
  expect(await fits()).toBe(true)
  const box = await option(student.page, 0).boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(96)
  await option(student.page, 1).click()
  await expect(board(student.page, 'play-result')).toBeVisible()
  expect(await fits()).toBe(true)
  await board(page, 'live-finish').click()
  await page.locator('[data-purpose="live-confirm"]').getByRole('button', { name: 'End game' }).click()
  await expect(board(student.page, 'play-final')).toBeVisible()
  expect(await fits()).toBe(true)
  await student.context.close()
  await context.close()
})

test('reduced motion: no confetti on the podium', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  const { page, code } = await openLobby(teacher, context, quizId)
  const student = await newStudent(browser, code, 'Ayse')
  await board(page, 'live-start').click()
  await option(student.page, 1).click()
  await board(page, 'live-finish').click()
  await page.locator('[data-purpose="live-confirm"]').getByRole('button', { name: 'End game' }).click()
  await expect(board(page, 'live-podium')).toBeVisible()
  await expect(board(page, 'study-confetti')).toHaveCount(0)
  await student.context.close()
  await context.close()

  // Without the preference there is confetti.
  const normal = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const second = await openLobby(teacher, normal, quizId)
  const other = await newStudent(browser, second.code, 'Bora')
  await board(second.page, 'live-start').click()
  await option(other.page, 1).click()
  await board(second.page, 'live-finish').click()
  await second.page.locator('[data-purpose="live-confirm"]').getByRole('button', { name: 'End game' }).click()
  await expect(board(second.page, 'study-confetti')).toHaveCount(1)
  await other.context.close()
  await normal.close()
})

test('formulas render on the board and on the phones', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(
    teacher,
    [{ id: 'm1', question: 'Solve $x^2 = 9$ for positive $x$.', explanation: 'Because $\\sqrt{9} = 3$.', type: 'mcq', options: ['$3$', '$-3$', '$\\frac{9}{2}$'], answerIndex: 0 }],
    'Formulas',
  )
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const { page, code } = await openLobby(teacher, context, quizId)
  const student = await newStudent(browser, code, 'Ayse')
  await board(page, 'live-start').click()
  await expect(board(page, 'live-question-text').locator('.katex')).toHaveCount(2)
  await expect(board(page, 'live-options').locator('.katex')).toHaveCount(3)
  await expect(board(student.page, 'play-question-text').locator('.katex')).toHaveCount(2)
  await expect(board(student.page, 'play-option').first().locator('.katex')).toHaveCount(1)
  await option(student.page, 0).click()
  await expect(board(page, 'live-explanation').locator('.katex')).toHaveCount(1)
  await student.context.close()
  await context.close()
})
