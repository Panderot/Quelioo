import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

import { cleanupTestUsers } from '../supabase/helpers'
import type { QuizQuestion } from '../../src/lib/quiz'
import { answer, command, createGame, createTestUser, hostState, insertQuiz, joinGame, playerState, signInBrowser, sleep } from './helpers'
import type { TestUser } from './helpers'

test.afterAll(async () => {
  await cleanupTestUsers()
})

const at = (page: Page, purpose: string) => page.locator(`[data-purpose="${purpose}"]`)
const option = (page: Page, n: number) => at(page, 'play-option').and(page.locator(`[data-option="${n}"]`))

/** Five single-answer questions; option 1 is always right. */
function rightIsOne(prefix: string): QuizQuestion[] {
  return Array.from({ length: 5 }, (_, i) => ({ id: `${prefix}${i}`, question: `${prefix} question ${i + 1}?`, explanation: 'Because.', type: 'mcq', options: ['Wrong', 'Right', 'Other'], answerIndex: 1 }) as QuizQuestion)
}

async function phone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })
  return { context, page: await context.newPage() }
}

async function joinByLink(page: Page, code: string, nickname?: string) {
  await page.goto(`/katil/${code}`)
  await expect(at(page, 'join-nickname')).toBeVisible()
  if (nickname !== undefined) await at(page, 'join-nickname').fill(nickname)
  await at(page, 'join-submit').click()
  await expect(at(page, 'play-screen')).toBeVisible()
}

async function newGame(teacher: TestUser, quizId: string) {
  const created = await createGame(teacher, quizId)
  expect(created.status).toBe(200)
  return { id: created.body.id, code: created.body.code }
}

/** Starts the game, the student answers question 1 on the phone, the teacher finishes it. */
async function playToTheEnd(teacher: TestUser, page: Page, id: string) {
  await command(teacher, id, 'start')
  await expect(option(page, 1)).toBeVisible()
  await option(page, 1).click()
  await expect(at(page, 'play-result')).toBeVisible()
  await command(teacher, id, 'finish')
  await expect(at(page, 'play-final')).toBeVisible()
}

test('a new code always wins over the seat of a finished game, a play-again game and a game that is still running', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizA = await insertQuiz(teacher, rightIsOne('A'), 'Quiz A')
  const quizB = await insertQuiz(teacher, rightIsOne('B'), 'Quiz B')
  const { context, page } = await phone(browser)

  const gameA = await newGame(teacher, quizA)
  await joinByLink(page, gameA.code, 'Ayse')
  await expect(page).toHaveURL(new RegExp(`/katil/${gameA.code}$`))
  await playToTheEnd(teacher, page, gameA.id)

  // "Play again with the same quiz": a new lobby, a new code, the same phone opens the new link.
  const again = await newGame(teacher, quizA)
  await page.goto(`/katil/${again.code}`)
  await expect(at(page, 'join-nickname')).toBeVisible()
  await expect(at(page, 'join-nickname')).toHaveValue('Ayse')
  await at(page, 'join-submit').click()
  await expect(at(page, 'play-waiting')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/katil/${again.code}$`))
  expect((await hostState(teacher, again.id)).counts.players).toBe(1)
  // A reload returns to the same game.
  await page.reload()
  await expect(at(page, 'play-waiting')).toBeVisible()

  // The second game is still in its lobby (running) and the student scans the code of a game with another quiz.
  const other = await newGame(teacher, quizB)
  await page.goto(`/katil/${other.code}`)
  await expect(at(page, 'join-nickname')).toBeVisible()
  await at(page, 'join-submit').click()
  await expect(at(page, 'play-waiting')).toBeVisible()
  expect((await hostState(teacher, other.id)).counts.players).toBe(1)

  // A link opened inside the page that is already open (no reload) behaves the same.
  const third = await newGame(teacher, quizB)
  await page.evaluate((code) => {
    window.history.pushState({}, '', `/katil/${code}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, third.code)
  await expect(at(page, 'join-nickname')).toBeVisible()
  await at(page, 'join-submit').click()
  await expect(at(page, 'play-waiting')).toBeVisible()
  expect((await hostState(teacher, third.id)).counts.players).toBe(1)
  await context.close()
})

test('/katil after a finished game shows its end screen with "Join a new game", and the button leads to a working join', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher, rightIsOne('A'), 'Quiz A')
  const { context, page } = await phone(browser)
  const first = await newGame(teacher, quizId)
  await joinByLink(page, first.code, 'Ayse')
  await playToTheEnd(teacher, page, first.id)

  await page.goto('/katil')
  await expect(at(page, 'play-final')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/katil/${first.code}$`))
  await expect(at(page, 'play-join-new')).toHaveText('Join a new game')
  await at(page, 'play-join-new').click()
  await expect(at(page, 'join-code')).toBeVisible()
  await expect(page).toHaveURL(/\/katil$/)
  expect(await page.evaluate(() => localStorage.getItem('quelio.live.player.v1'))).toBeNull()

  const next = await newGame(teacher, quizId)
  await at(page, 'join-code').fill(next.code)
  await at(page, 'join-code-next').click()
  await expect(at(page, 'join-nickname')).toHaveValue('Ayse')
  await at(page, 'join-submit').click()
  await expect(at(page, 'play-waiting')).toBeVisible()
  expect((await hostState(teacher, next.id)).counts.players).toBe(1)

  // A stored seat older than 12 hours is dropped.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('quelio.live.player.v1') ?? '{}')
    localStorage.setItem('quelio.live.player.v1', JSON.stringify({ ...raw, at: Date.now() - 13 * 3600 * 1000 }))
  })
  await page.goto('/katil')
  await expect(at(page, 'join-code')).toBeVisible()
  await context.close()
})

test('streak bonus: +0, +100, +200, a wrong answer resets it, and the board and the phone show the split', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher, rightIsOne('S'), 'Streak quiz')
  const game = await newGame(teacher, quizId)
  const mehmet = await joinGame(game.code, 'Mehmet')
  const { context, page } = await phone(browser)
  await joinByLink(page, game.code, 'Ayse')
  const teacherContext = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  await signInBrowser(teacherContext, teacher)
  const board = await teacherContext.newPage()
  await board.goto(`/live/${game.id}`)

  await command(teacher, game.id, 'start')
  // Mehmet: right, wrong, right. Ayse: right, right, right.
  const mehmetPicks = [1, 0, 1]
  for (let q = 0; q < 3; q += 1) {
    await expect(at(page, 'play-question-text')).toContainText(`S question ${q + 1}?`)
    await answer(mehmet.body.token, q, [mehmetPicks[q]])
    await option(page, 1).click()
    await expect(at(page, 'play-result')).toHaveAttribute('data-correct', 'true')
    const text = (await at(page, 'play-result-text').textContent()) ?? ''
    const gained = Number(/\+(\d+)/.exec(text)?.[1])
    if (q === 0) {
      await expect(at(page, 'play-streak')).toHaveCount(0)
      expect(gained).toBeLessThanOrEqual(1000)
    } else {
      const bonus = q * 100
      await expect(at(page, 'play-streak')).toContainText(`${q + 1} correct in a row · streak bonus +${bonus}`)
      expect(gained).toBeGreaterThan(bonus + 499)
      await expect(at(board, 'live-top5-gain').first()).toContainText(`streak +${bonus}`)
      await expect(at(board, 'live-top5-gain').first()).toContainText(String(gained - bonus))
    }
    const mine = (await playerState(mehmet.body.token)).body.me!
    // Mehmet: q1 right (no bonus), q2 wrong (reset), q3 right again (streak is 1 again: no bonus).
    expect(mine.last?.bonus).toBe(0)
    expect(mine.streak).toBe(mehmetPicks[q] === 1 ? 1 : 0)
    if (q < 2) await command(teacher, game.id, 'next')
  }
  await teacherContext.close()
  await context.close()
})

test('reload during a question then answer is scored; a pause freezes the phone and the points ignore it', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher, rightIsOne('R'), 'Reload quiz')
  const game = await newGame(teacher, quizId)
  const { context, page } = await phone(browser)
  await joinByLink(page, game.code, 'Ayse')
  await command(teacher, game.id, 'start')
  await expect(option(page, 1)).toBeVisible()

  await page.reload()
  await expect(option(page, 1)).toBeVisible()
  const opened = (await hostState(teacher, game.id)).game
  const before = opened.deadlineAt!
  await command(teacher, game.id, 'pause')
  const pausedAt = Date.now()
  await expect(at(page, 'play-seconds')).toHaveText('Paused')
  await expect(option(page, 1)).toBeDisabled()
  await sleep(2500)
  await command(teacher, game.id, 'resume')
  await expect(option(page, 1)).toBeEnabled()
  const after = (await hostState(teacher, game.id)).game.deadlineAt!
  expect(after - before).toBeGreaterThan(2000)
  const resumed = Date.now()

  await option(page, 1).click()
  await expect(at(page, 'play-result')).toHaveAttribute('data-correct', 'true')
  const gained = Number(/\+(\d+)/.exec((await at(page, 'play-result-text').textContent()) ?? '')?.[1])
  // The answer time is what the student really had: time before the pause plus a moment after it, never the 2.5 s pause itself.
  const usedMs = pausedAt - opened.startedAt! + (Date.now() - resumed)
  expect(gained).toBeGreaterThanOrEqual(1000 - 500 * ((usedMs + 800) / 10_000))
  await context.close()
})

test('the sidebar is on the hub, the settings page and the results page, and off the board', async ({ browser }) => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher, rightIsOne('N'), 'Sidebar quiz')
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await signInBrowser(context, teacher)
  const page = await context.newPage()
  await page.goto('/live')
  await expect(at(page, 'sidebar-navigation')).toBeVisible()
  await expect(at(page, 'page-intro')).toBeVisible()
  await page.goto(`/live/new?quiz=${quizId}`)
  await expect(at(page, 'live-settings')).toBeVisible()
  await expect(at(page, 'sidebar-navigation')).toBeVisible()

  const game = await newGame(teacher, quizId)
  await page.goto(`/live/${game.id}`)
  await expect(at(page, 'live-board')).toBeVisible()
  // The board covers the whole window: whatever is at the sidebar's place belongs to the board.
  const hit = await page.evaluate(() => { const el = document.elementFromPoint(20, 300); return el ? el.tagName + ' ' + String(el.getAttribute('class')).slice(0, 80) + ' | ' + (el.closest('[data-purpose]')?.getAttribute('data-purpose') ?? '-') : 'none' })
  expect(hit).toContain('live-board')
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Live Game' })).toBeVisible()

  await joinGame(game.code, 'Solo')
  await command(teacher, game.id, 'start')
  await command(teacher, game.id, 'finish')
  await page.goto(`/live/${game.id}/results`)
  await expect(at(page, 'page-intro')).toBeVisible()
  await expect(at(page, 'sidebar-navigation')).toBeVisible()
  await context.close()
})
