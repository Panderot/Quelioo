import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

import { cleanupTestUsers } from '../supabase/helpers'
import type { QuizQuestion } from '../../src/lib/quiz'
import { admin, command, createGame, createTestUser, hostState, insertQuiz, joinGame, teacherPage } from './helpers'
import type { TestUser } from './helpers'

test.afterAll(async () => {
  await cleanupTestUsers()
})

const at = (page: Page, purpose: string) => page.locator(`[data-purpose="${purpose}"]`)
const dialog = (page: Page) => page.locator('[data-purpose="live-confirm"]')

function rightIsOne(): QuizQuestion[] {
  return Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, question: `Stop question ${i + 1}?`, explanation: 'Because.', type: 'mcq', options: ['Wrong', 'Right', 'Other'], answerIndex: 1 }) as QuizQuestion)
}

async function phone(browser: Browser, code: string, nickname: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.goto(`/katil/${code}`)
  await at(page, 'join-nickname').fill(nickname)
  await at(page, 'join-submit').click()
  await expect(at(page, 'play-waiting')).toBeVisible()
  return { context, page }
}

async function setup(browser: Browser, students: number) {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher, rightIsOne(), 'Stop quiz')
  const created = await createGame(teacher, quizId)
  expect(created.status).toBe(200)
  const { id, code } = created.body
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await teacherPage(context, teacher)
  const phones: { context: BrowserContext; page: Page }[] = []
  if (students > 0) phones.push(await phone(browser, code, 'Ayse'))
  if (students > 1) expect((await joinGame(code, 'Mehmet')).status).toBe(200)
  return { teacher, id, code, context, page, phones }
}

test('cancel a lobby from the hub: Never mind and Esc change nothing, then the card goes, history says Cancelled, phones show it, and a new game can be joined', async ({ browser }) => {
  const { teacher, id, context, page, phones } = await setup(browser, 2)
  await page.goto('/live')
  const card = at(page, 'live-running')
  await expect(card).toContainText('Game in progress')
  await expect(card.locator('[data-purpose="live-stop-game"]')).toHaveText('Cancel game')

  // Esc and "Never mind" leave the game untouched; focus starts on "Never mind".
  await card.locator('[data-purpose="live-stop-game"]').click()
  await expect(dialog(page)).toContainText('Cancel this game?')
  await expect(dialog(page)).toContainText('Students who joined will see that the game was cancelled.')
  await expect(dialog(page).getByRole('button', { name: 'Never mind' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await card.locator('[data-purpose="live-stop-game"]').click()
  await dialog(page).getByRole('button', { name: 'Never mind' }).click()
  await expect(dialog(page)).toHaveCount(0)
  expect((await hostState(teacher, id)).game.state).toBe('lobby')

  await card.locator('[data-purpose="live-stop-game"]').click()
  await dialog(page).getByRole('button', { name: 'Cancel game' }).click()
  await expect(at(page, 'live-running')).toHaveCount(0)
  await expect(at(page, 'live-history')).toContainText('Cancelled')
  expect((await hostState(teacher, id)).game.state).toBe('ended')

  const student = phones[0].page
  await expect(at(student, 'play-ended')).toHaveText('The teacher cancelled the game')
  await at(student, 'play-join-new').click()
  await expect(at(student, 'join-code')).toBeVisible()
  expect(await student.evaluate(() => localStorage.getItem('quelio.live.player.v1'))).toBeNull()

  const next = await createGame(teacher, await insertQuiz(teacher, rightIsOne(), 'Next quiz'))
  await at(student, 'join-code').fill(next.body.code)
  await at(student, 'join-code-next').click()
  await at(student, 'join-submit').click()
  await expect(at(student, 'play-waiting')).toBeVisible()
  expect((await hostState(teacher, next.body.id)).counts.players).toBe(1)
  await phones[0].context.close()
  await context.close()
})

test('cancel an empty lobby from the hub: it appears nowhere', async ({ browser }) => {
  const { teacher, id, context, page } = await setup(browser, 0)
  await page.goto('/live')
  await at(page, 'live-stop-game').click()
  await dialog(page).getByRole('button', { name: 'Cancel game' }).click()
  await expect(at(page, 'live-running')).toHaveCount(0)
  await expect(at(page, 'live-history')).toContainText('Finished games will appear here')
  expect((await hostState(teacher, id)).game.state).toBe('ended')
  await context.close()
})

test('end a running game from the hub: results are saved and the phones show their final rank', async ({ browser }) => {
  const { teacher, id, context, page, phones } = await setup(browser, 2)
  await command(teacher, id, 'start')
  const student = phones[0].page
  await at(student, 'play-option').and(student.locator('[data-option="1"]')).click()
  await expect(at(student, 'play-result')).toBeVisible()

  await page.goto('/live')
  const stop = at(page, 'live-running').locator('[data-purpose="live-stop-game"]')
  await expect(stop).toHaveText('End game')
  await stop.click()
  await expect(dialog(page)).toContainText('End the game now?')
  await expect(dialog(page)).toContainText('Points up to now are saved.')
  await page.keyboard.press('Escape')
  expect((await hostState(teacher, id)).game.state).not.toBe('finished')
  await stop.click()
  await dialog(page).getByRole('button', { name: 'End game' }).click()
  await expect(at(page, 'live-running')).toHaveCount(0)
  await expect(at(page, 'live-history')).toContainText('2 players')

  await expect(at(student, 'play-final')).toBeVisible()
  await expect(at(student, 'play-final-rank')).toContainText('1')
  await at(page, 'live-history-results').click()
  await expect(at(page, 'live-results-ranking')).toContainText('Ayse')
  await phones[0].context.close()
  await context.close()
})

test('the lobby and the board ask before they cancel or end the game', async ({ browser }) => {
  const { teacher, id, context, page, phones } = await setup(browser, 1)
  await page.goto(`/live/${id}`)
  await page.getByRole('button', { name: 'Cancel game' }).click()
  await expect(dialog(page)).toContainText('Cancel this game?')
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  expect((await hostState(teacher, id)).game.state).toBe('lobby')

  await command(teacher, id, 'start')
  await expect(at(page, 'live-finish')).toBeVisible({ timeout: 30_000 })
  await at(page, 'live-finish').click()
  await expect(dialog(page)).toContainText('End the game now?')
  await expect(dialog(page)).toContainText('Points up to now are saved.')
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await hostState(teacher, id)).game.state).toBe('question')
  await phones[0].context.close()
  await context.close()
})

test('only the owner can cancel or end a game, and a closed game cannot be changed again', async ({ browser }) => {
  const { teacher, id, context } = await setup(browser, 1)
  const other: TestUser = await createTestUser('other')
  expect((await command(other, id, 'close')).status).toBe(404)
  expect((await command(other, id, 'finish')).status).toBe(404)
  expect((await hostState(teacher, id)).game.state).toBe('lobby')

  expect((await command(teacher, id, 'close')).status).toBe(200)
  const again = await command(teacher, id, 'finish')
  expect(again.status).toBe(409)
  expect(again.body.error).toBe('game_over')
  expect((await command(teacher, id, 'close')).status).toBe(409)

  // A finished game cannot be cancelled either.
  const quizId = await insertQuiz(teacher, rightIsOne(), 'Second')
  const second = await createGame(teacher, quizId)
  await joinGame(second.body.code, 'Zed')
  await command(teacher, second.body.id, 'start')
  expect((await command(teacher, second.body.id, 'finish')).status).toBe(200)
  const late = await command(teacher, second.body.id, 'close')
  expect(late.status).toBe(409)
  expect((await hostState(teacher, second.body.id)).game.state).toBe('finished')
  await context.close()
})

test('the closing reason is recorded and the phone says "cancelled" only when the teacher cancelled', async ({ browser }) => {
  const reasonOf = async (id: string) => (await admin.from('live_games').select('end_reason').eq('id', id).single()).data!.end_reason

  // Teacher cancels the lobby: reason "cancelled", phone says so.
  const first = await setup(browser, 1)
  expect((await command(first.teacher, first.id, 'close')).status).toBe(200)
  expect(await reasonOf(first.id)).toBe('cancelled')
  await expect(at(first.phones[0].page, 'play-ended')).toHaveText('The teacher cancelled the game')
  await first.phones[0].context.close()
  await first.context.close()

  // Left idle for 30 minutes: reason "idle", the phone only says the game has ended.
  const second = await setup(browser, 1)
  await admin.from('live_games').update({ last_activity_at: new Date(Date.now() - 40 * 60_000).toISOString() }).eq('id', second.id)
  await hostState(second.teacher, second.id)
  expect(await reasonOf(second.id)).toBe('idle')
  await second.phones[0].page.reload()
  await expect(at(second.phones[0].page, 'play-ended')).toHaveText('The game has ended.')
  await second.phones[0].context.close()
  await second.context.close()

  // Played out: reason "completed"; a started game ended by the teacher is "completed" too.
  const third = await setup(browser, 1)
  await command(third.teacher, third.id, 'start')
  await command(third.teacher, third.id, 'finish')
  expect(await reasonOf(third.id)).toBe('completed')
  await third.phones[0].context.close()
  await third.context.close()

  // A game that was open has no reason yet.
  const fourth = await setup(browser, 0)
  expect(await reasonOf(fourth.id)).toBeNull()
  await fourth.context.close()
})
