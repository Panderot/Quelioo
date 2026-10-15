import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { en } from './locales'
import { SAMPLE_QUIZ } from '../fixtures/quiz'
import { admin, cleanupTestUsers, createTestUser, listObjects, signInBrowser } from './helpers'
import type { TestUser } from './helpers'
import { LEGACY_COUNTS, readLegacyCounts, seedLegacyData } from './legacySeed'

// The account data layer against the TEST project: the same data on a second device, writes that
// survive going offline, the one-time import of old local data (twice, no duplicates), the data
// download and account deletion.

test.afterAll(async () => {
  await cleanupTestUsers()
})

const dueCards = (page: Page) => page.locator('[data-purpose="deck-row"]')

async function newContext(browser: import('@playwright/test').Browser, user: TestUser) {
  const context = await browser.newContext()
  await signInBrowser(context, user)
  return context
}

async function ownedCounts(userId: string) {
  const count = async (table: 'decks' | 'cards' | 'card_progress' | 'quizzes' | 'solves') => {
    const { count: total } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId)
    return total ?? 0
  }
  return {
    decks: await count('decks'),
    cards: await count('cards'),
    progress: await count('card_progress'),
    quizzes: await count('quizzes'),
    solves: await count('solves'),
  }
}

test.describe('flashcards in the account', () => {
  test('a deck made on one device, with its study progress, shows on a second device', async ({ browser }) => {
    const user = await createTestUser('cards')
    const first = await newContext(browser, user)
    const page = await first.newPage()
    await page.goto('/flashcards?lng=en')
    await page.getByRole('button', { name: 'New deck' }).first().click()
    await expect(page).toHaveURL(/\/flashcards\/[0-9a-f-]{36}$/)
    await page.locator('[data-purpose="deck-name"]').fill('Biology')
    await page.getByRole('button', { name: 'Add card' }).click()
    await page.getByLabel('Front of card 1').fill('Cell')
    await page.getByLabel('Back of card 1').fill('Basic unit of life')
    await page.getByRole('button', { name: 'Add card' }).click()
    await page.getByLabel('Front of card 2').fill('Mitochondria')
    await page.getByLabel('Back of card 2').fill('Powerhouse of the cell')
    await page.getByLabel('Back of card 2').blur()

    await expect.poll(async () => (await ownedCounts(user.id)).cards, { timeout: 20_000 }).toBe(2)
    expect((await admin.from('decks').select('name').eq('user_id', user.id)).data).toEqual([{ name: 'Biology' }])

    // Study one card as "Know": box 2 is saved.
    await page.goto('/flashcards?lng=en')
    await page.getByRole('link', { name: /^Study Biology/ }).click()
    await page.locator('[data-purpose="flashcard"]').click()
    await page.getByRole('button', { name: 'Know', exact: true }).click()
    await expect
      .poll(async () => (await admin.from('card_progress').select('box, reviews').eq('user_id', user.id).gt('reviews', 0)).data, { timeout: 20_000 })
      .toEqual([{ box: 2, reviews: 1 }])

    // The second device (a fresh browser with the same account) sees the same data.
    const second = await newContext(browser, user)
    const other = await second.newPage()
    await other.goto('/flashcards?lng=en')
    await expect(dueCards(other)).toHaveCount(1)
    await expect(dueCards(other).first()).toContainText('Biology')
    await expect(dueCards(other).first()).toContainText('2 cards')
    await other.getByRole('link', { name: /Biology/ }).first().click()
    await expect(other.getByLabel('Front of card 1')).toHaveValue('Cell')
    await expect(other.getByLabel('Back of card 2')).toHaveValue('Powerhouse of the cell')
    await first.close()
    await second.close()
  })

  test('a change made offline is kept and sent when the connection is back', async ({ browser }) => {
    const user = await createTestUser('offline')
    const { error } = await user.client.from('decks').insert({ id: crypto.randomUUID(), name: 'Offline deck' })
    expect(error).toBeNull()
    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto('/flashcards?lng=en')
    await expect(dueCards(page)).toHaveCount(1)
    await page.getByRole('link', { name: /Offline deck/ }).first().click()

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Add card' }).click()
    await page.getByLabel('Front of card 1').fill('Written offline')
    await page.getByLabel('Back of card 1').fill('Still saved')
    await page.getByLabel('Back of card 1').blur()
    await expect(page.getByLabel('Front of card 1')).toHaveValue('Written offline')
    expect((await admin.from('cards').select('id').eq('user_id', user.id)).data).toEqual([])
    await expect(page.getByText(en.sync.saving)).toBeVisible()

    // Even a reload while offline keeps the queued write (it lives in the browser until confirmed).
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(async () => (await admin.from('cards').select('front').eq('user_id', user.id)).data, { timeout: 30_000 }).toEqual([{ front: 'Written offline' }])
    await expect(page.getByText(en.sync.saving)).toHaveCount(0)
    await context.close()
  })

  test('adding the sample decks inserts them and never touches an existing deck', async ({ browser }) => {
    const user = await createTestUser('samples')
    const mine = crypto.randomUUID()
    expect((await user.client.from('decks').insert({ id: mine, name: 'My own deck', description: 'keep me' })).error).toBeNull()
    expect((await user.client.from('cards').insert({ deck_id: mine, front: 'mine', back: 'yes' })).error).toBeNull()
    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto('/flashcards?lng=en')
    await expect(dueCards(page)).toHaveCount(1)
    await page.getByRole('button', { name: 'Add sample decks' }).click()
    await expect(dueCards(page)).toHaveCount(8)
    await expect.poll(async () => (await ownedCounts(user.id)).decks, { timeout: 30_000 }).toBe(8)
    const own = await admin.from('decks').select('name, description').eq('id', mine).single()
    expect(own.data).toEqual({ name: 'My own deck', description: 'keep me' })
    expect((await admin.from('cards').select('front').eq('deck_id', mine)).data).toEqual([{ front: 'mine' }])
    await context.close()
  })

  test('a question-notebook card keeps its solution link, and only its owner can read it', async () => {
    const user = await createTestUser('notebook')
    const other = await createTestUser('notebook-other')
    const deckId = crypto.randomUUID()
    const cardId = crypto.randomUUID()
    const solutionId = crypto.randomUUID()
    // The same row the app's remote mapping writes (cardToRow): the notebook card carries `solution_id`.
    expect((await user.client.from('decks').insert({ id: deckId, name: 'My question notebook', source: 'solution', source_ref: 'notebook' })).error).toBeNull()
    expect((await user.client.from('cards').insert({ id: cardId, deck_id: deckId, front: 'Solve 3x + 7 = 2x + 15', back: 'Answer: x = 8', solution_id: solutionId })).error).toBeNull()

    // Read back the way fetchFlashcards does (select *), so the app maps solution_id -> solutionId unchanged.
    const read = await user.client.from('cards').select('*').eq('id', cardId).single()
    expect(read.error).toBeNull()
    expect(read.data?.solution_id).toBe(solutionId)
    // An ordinary card leaves the column null, which the app reads as "no solution".
    const plain = await user.client.from('cards').insert({ deck_id: deckId, front: 'f', back: 'b' }).select('solution_id').single()
    expect(plain.data?.solution_id).toBeNull()

    expect((await other.client.from('cards').select('solution_id').eq('id', cardId)).data).toEqual([])
  })
})

test.describe('archive in the account', () => {
  test('a saved quiz opens from the list and from a direct link after a reload', async ({ browser }) => {
    const user = await createTestUser('archive')
    const id = crypto.randomUUID()
    const { error } = await user.client.from('quizzes').insert({
      id,
      title: SAMPLE_QUIZ.title,
      source: 'text',
      question_type: 'mixed',
      difficulty: 'medium',
      question_count: '6',
      output_language: 'auto',
      source_text: 'Seeded source text.',
      quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
    })
    expect(error).toBeNull()
    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto('/archive?lng=en')
    await expect(page.getByRole('link', { name: SAMPLE_QUIZ.title }).first()).toBeVisible()
    await page.getByRole('link', { name: SAMPLE_QUIZ.title }).first().click()
    await expect(page).toHaveURL(`/archive/${id}`)
    await expect(page.getByText('Name the largest planet in our solar system.').first()).toBeVisible()
    // A reload on the quiz page waits for the account's quizzes instead of showing "not found".
    await page.reload()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
    await context.close()
  })

  test('deleting a quiz removes only that quiz (with its study results) from the account; the other user’s quiz and the decks stay', async ({ browser }) => {
    const user = await createTestUser('archive-delete')
    const other = await createTestUser('archive-delete-other')
    const row = (id: string, title: string) => ({
      id,
      title,
      source: 'text',
      question_type: 'mixed',
      difficulty: 'medium',
      question_count: '6',
      output_language: 'auto',
      source_text: 'Seeded source text.',
      quiz: { title, questions: SAMPLE_QUIZ.questions },
    })
    const doomed = crypto.randomUUID()
    const kept = crypto.randomUUID()
    const foreign = crypto.randomUUID()
    expect((await user.client.from('quizzes').insert(row(doomed, 'Doomed account quiz'))).error).toBeNull()
    expect((await user.client.from('quizzes').insert(row(kept, 'Kept account quiz'))).error).toBeNull()
    expect((await other.client.from('quizzes').insert(row(foreign, 'Foreign quiz'))).error).toBeNull()
    expect((await user.client.from('decks').insert({ name: 'Deck from a quiz' })).error).toBeNull()

    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto(`/archive/${doomed}?lng=en`)
    await page.locator('[data-purpose="archive-quiz-delete"]').click()
    await page.getByRole('dialog').getByRole('button', { name: en.archive.detail.delete, exact: true }).click()
    await expect(page).toHaveURL(/\/archive$/)
    await expect.poll(async () => (await admin.from('quizzes').select('id').eq('id', doomed)).data?.length, { timeout: 30_000 }).toBe(0)
    expect((await admin.from('quizzes').select('id').eq('id', kept)).data).toHaveLength(1)
    expect((await admin.from('quizzes').select('id').eq('id', foreign)).data).toHaveLength(1)
    expect((await admin.from('decks').select('name').eq('user_id', user.id)).data?.map((deck) => deck.name)).toContain('Deck from a quiz')
    // The account's own client cannot delete a quiz of another user either.
    expect((await user.client.from('quizzes').delete().eq('id', foreign).select()).data).toEqual([])
    expect((await admin.from('quizzes').select('id').eq('id', foreign)).data).toHaveLength(1)
    await context.close()
  })
})

test.describe('study results in the account', () => {
  test('a finished session is saved in quizzes.results, shows on a second device, and an unfinished one can be continued', async ({ browser }) => {
    const user = await createTestUser('study')
    const id = crypto.randomUUID()
    const questions = SAMPLE_QUIZ.questions.slice(0, 3)
    const { error } = await user.client.from('quizzes').insert({
      id,
      title: SAMPLE_QUIZ.title,
      source: 'text',
      question_type: 'mixed',
      difficulty: 'medium',
      question_count: '3',
      output_language: 'en',
      quiz: { title: SAMPLE_QUIZ.title, questions },
    })
    expect(error).toBeNull()
    const first = await newContext(browser, user)
    const page = await first.newPage()
    await page.goto(`/archive/${id}?mode=study&lng=en`)
    await page.getByRole('button', { name: 'Start', exact: true }).click()

    // One question answered, then the page is closed: the resume point reaches the account.
    await page.getByRole('radio', { name: /Carbon dioxide/ }).click()
    await page.getByRole('button', { name: 'Check', exact: true }).click()
    await expect
      .poll(async () => ((await admin.from('quizzes').select('results').eq('id', id).single()).data?.results as { resume?: unknown } | null)?.resume !== undefined)
      .toBe(true)
    await page.reload()
    await page.getByRole('button', { name: 'Continue where you left off' }).click()
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('2 / 3')
    await page.getByRole('radio', { name: 'False' }).click()
    await page.getByRole('button', { name: 'Check', exact: true }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByLabel('Your answer').fill('100')
    await page.getByRole('button', { name: 'Check', exact: true }).click()
    await page.getByRole('button', { name: 'Finish', exact: true }).click()
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('3 / 3 correct')

    await expect
      .poll(async () => ((await admin.from('quizzes').select('results').eq('id', id).single()).data?.results as { sessions?: unknown[]; resume?: unknown } | null)?.sessions?.length)
      .toBe(1)
    const saved = (await admin.from('quizzes').select('results').eq('id', id).single()).data?.results as { sessions: { firstTry: number; total: number; scope: string }[]; resume?: unknown }
    expect(saved.sessions[0]).toMatchObject({ firstTry: 3, total: 3, scope: 'full' })
    expect(saved.resume).toBeUndefined()

    // A second device shows the last result on the Archive card and the chart on the quiz page.
    const second = await newContext(browser, user)
    const other = await second.newPage()
    await other.goto('/archive?lng=en')
    await expect(other.locator('[data-purpose="archive-last-study"]')).toHaveText(/Last session: 3\/3, today/)
    await other.goto(`/archive/${id}?lng=en`)
    await expect(other.locator('[data-purpose="study-history"] [data-score="3/3"]')).toBeVisible()
    await first.close()
    await second.close()
  })
})

test.describe('storage layers in the browser (solutions)', () => {
  test('solutions: thumbnail upload, signed URL, extras merge, undo and delete', async ({ browser }) => {
    const user = await createTestUser('solutions')
    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto('/account?lng=en')
    const result = await page.evaluate(async () => {
      const { saveSolution, getAllSolutions, getSolution, updateSolutionExtras, deleteSolution, restoreSolution, withThumbnailBlob } = (await import(/* @vite-ignore */ '/src/lib/solutionStorage.ts' as string)) as typeof import('../../src/lib/solutionStorage')
      const { flushWrites } = (await import(/* @vite-ignore */ '/src/lib/data/writeQueue.ts' as string)) as typeof import('../../src/lib/data/writeQueue')
      const canvas = document.createElement('canvas')
      canvas.width = 40
      canvas.height = 30
      canvas.getContext('2d')!.fillRect(0, 0, 40, 30)
      const saved = await saveSolution({ result: { topic: 'Algebra', question: 'Solve x+1=2', intro: 'i', steps: ['x=1'], answer: 'x = 1', tip: 't', mistakes: [] }, imageDataUrl: canvas.toDataURL('image/png'), language: 'auto' })
      await updateSolutionExtras(saved.id, 'similar', { done: true })
      await updateSolutionExtras(saved.id, 'checkWork', { score: 3 })
      await flushWrites()
      const listed = await getAllSolutions()
      const one = await getSolution(saved.id)
      const thumb = listed[0].thumbnailUrl ? (await fetch(listed[0].thumbnailUrl)).headers.get('content-type') : null
      const kept = await withThumbnailBlob(listed[0])
      await deleteSolution(saved.id)
      const gone = await getSolution(saved.id)
      await restoreSolution(kept)
      const back = await getSolution(saved.id)
      return { listed: listed.length, extras: one?.extras, hasThumb: Boolean(listed[0].thumbnailUrl), thumbType: thumb, keptBytes: kept.thumbnail?.size ?? 0, gone: gone === null, backId: back?.id === saved.id, backCreatedAt: back?.createdAt === saved.createdAt }
    })
    expect(result.listed).toBe(1)
    expect(result.extras).toEqual({ similar: { done: true }, checkWork: { score: 3 } })
    expect(result.hasThumb).toBe(true)
    expect(result.thumbType).toContain('image/jpeg')
    expect(result.keptBytes).toBeGreaterThan(100)
    expect(result.gone).toBe(true)
    expect(result.backId).toBe(true)
    expect(result.backCreatedAt).toBe(true)
    await context.close()
  })
})

test.describe('import of old local data', () => {
  test('imports everything on first sign-in, twice without duplicates, keeps the local copy until the student removes it', async ({ browser }) => {
    const user = await createTestUser('import')
    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto('/account?lng=en')
    await expect(page.locator('[data-purpose="import-dialog"]')).toHaveCount(0)
    await seedLegacyData(page)
    expect(await readLegacyCounts(page)).toEqual(LEGACY_COUNTS)
    await page.reload()

    // The dialog names what was found.
    const dialog = page.locator('[data-purpose="import-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('2 decks')
    await expect(dialog).toContainText('2 quizzes')
    await expect(dialog).toContainText('1 solution')
    await dialog.getByRole('button', { name: en.importDialog.import }).click()
    await expect(dialog.getByText(en.importDialog.doneTitle)).toBeVisible({ timeout: 60_000 })
    await expect(dialog.getByText(en.importDialog.unverified)).toHaveCount(0)

    const first = await ownedCounts(user.id)
    expect(first).toEqual({ decks: 2, cards: 5, progress: 5, quizzes: 2, solves: 1 })
    // Progress is kept exactly.
    const progress = await admin.from('card_progress').select('box, reviews, lapses').eq('user_id', user.id).order('box')
    expect(progress.data?.map((row) => row.box)).toEqual([1, 2, 3, 4, 5])
    expect(progress.data?.find((row) => row.box === 5)).toEqual({ box: 5, reviews: 10, lapses: 1 })
    // Files arrived.
    expect((await listObjects('uploads', user.id)).length).toBe(1)
    const solve = await admin.from('solves').select('extras, thumbnail_path').eq('user_id', user.id).single()
    expect(solve.data?.extras).toEqual({ note: 'kept' })
    // The deck made from a quiz still points at it (the quiz got a new id).
    const quizIds = (await admin.from('quizzes').select('id, title').eq('user_id', user.id)).data ?? []
    expect(quizIds.map((quiz) => quiz.title)).toContain('Legacy photosynthesis')

    // Nothing local was deleted yet.
    expect(await readLegacyCounts(page)).toEqual(LEGACY_COUNTS)
    await dialog.getByRole('button', { name: en.importDialog.keep }).click()
    await expect(dialog).toHaveCount(0)

    // The imported data shows up in the app.
    await page.goto('/archive?lng=en')
    await expect(page.getByRole('link', { name: 'Study — Legacy planets' })).toBeVisible()
    await page.goto('/flashcards?lng=en')
    await expect(dueCards(page)).toHaveCount(2)

    // Running the import a second time changes nothing.
    await page.evaluate(() => localStorage.removeItem('quelio.importState.v1'))
    await page.goto('/account?lng=en')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: en.importDialog.import }).click()
    await expect(dialog.getByText(en.importDialog.doneTitle)).toBeVisible({ timeout: 60_000 })
    expect(await ownedCounts(user.id)).toEqual(first)

    // Remove the old copy: the stores are emptied and the dialog never returns.
    await dialog.getByRole('button', { name: en.importDialog.clear }).click()
    await expect.poll(() => readLegacyCounts(page)).toEqual({ quizzes: 0, decks: 0, cards: 0, solutions: 0 })
    await page.reload()
    await expect(page.locator('[data-purpose="import-dialog"]')).toHaveCount(0)
    expect(await ownedCounts(user.id)).toEqual(first)
    await context.close()
  })

  test('"Not now" keeps the copy and the account page offers the import later; another account is not affected', async ({ browser }) => {
    const user = await createTestUser('import-later')
    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto('/account?lng=en')
    await seedLegacyData(page)
    await page.reload()
    const dialog = page.locator('[data-purpose="import-dialog"]')
    await dialog.getByRole('button', { name: en.importDialog.notNow }).click()
    await expect(dialog).toHaveCount(0)
    expect(await ownedCounts(user.id)).toMatchObject({ decks: 0, quizzes: 0 })
    expect(await readLegacyCounts(page)).toEqual(LEGACY_COUNTS)
    await page.reload()
    await expect(dialog).toHaveCount(0)
    await page.getByRole('button', { name: en.account.import.button }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: en.importDialog.import }).click()
    await expect(dialog.getByText(en.importDialog.doneTitle)).toBeVisible({ timeout: 60_000 })
    expect((await ownedCounts(user.id)).quizzes).toBe(2)
    await context.close()
  })
})

test.describe('account page: download and delete', () => {
  test('download my data returns everything the account owns', async ({ browser }) => {
    const user = await createTestUser('download', { displayName: 'Dana' })
    const deckId = crypto.randomUUID()
    await user.client.from('decks').insert({ id: deckId, name: 'Exported deck' })
    await user.client.from('cards').insert({ deck_id: deckId, front: 'f', back: 'b' })
    await user.client.storage.from('uploads').upload(`${user.id}/solves/x.jpg`, new Blob(['abc'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
    await admin.from('usage_events').insert({ user_id: user.id, feature: 'generate', cost_usd: 0.002 })
    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto('/account?lng=en')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: en.account.data.download }).click()])
    expect(download.suggestedFilename()).toMatch(/^quelio-data-\d{4}-\d{2}-\d{2}\.json$/)
    const body = JSON.parse(await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8')) as Record<string, unknown> & { files: { bucket: string; path: string; url: string }[] }
    expect(body.account).toMatchObject({ id: user.id, email: user.email })
    expect(body.profile).toMatchObject({ display_name: 'Dana' })
    expect(body.decks).toHaveLength(1)
    expect(body.cards).toHaveLength(1)
    expect(body.usage_events).toHaveLength(1)
    expect(body.files).toHaveLength(1)
    expect((await fetch(body.files[0].url)).status).toBe(200)
    await context.close()
  })

  test('the export of one account never contains another account\'s data', async ({ request }) => {
    const mine = await createTestUser('export-a')
    const theirs = await createTestUser('export-b')
    await theirs.client.from('decks').insert({ name: 'Secret deck' })
    const response = await request.post('/api/account', { data: { action: 'export' }, headers: { authorization: `Bearer ${mine.accessToken}` } })
    expect(response.status()).toBe(200)
    expect(JSON.stringify(await response.json())).not.toContain('Secret deck')
  })

  test('delete my account removes the user, every row and every file', async ({ browser }) => {
    const user = await createTestUser('delete')
    const deckId = crypto.randomUUID()
    await user.client.from('decks').insert({ id: deckId, name: 'Doomed deck' })
    await user.client.from('cards').insert({ deck_id: deckId, front: 'f', back: 'b' })
    await user.client.from('card_progress').insert({ card_id: (await user.client.from('cards').select('id').single()).data!.id, box: 2 })
    await user.client.from('quizzes').insert({ title: 'Doomed quiz', quiz: { questions: [{ question: 'q' }] } })
    await user.client.storage.from('uploads').upload(`${user.id}/solves/t.jpg`, new Blob(['abc'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
    await admin.from('usage_events').insert({ user_id: user.id, feature: 'generate', cost_usd: 0.002 })
    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto('/account?lng=en')
    await page.getByRole('button', { name: en.account.delete.button }).click()
    const dialog = page.locator('[data-purpose="delete-account-dialog"]')
    // Wrong confirmation: nothing happens.
    await dialog.getByLabel(en.account.delete.confirmLabel).fill('someone-else@example.com')
    await expect(dialog.getByRole('button', { name: en.account.delete.confirm })).toBeDisabled()
    await dialog.getByLabel(en.account.delete.confirmLabel).fill(user.email)
    await dialog.getByRole('button', { name: en.account.delete.confirm }).click()
    await expect(page).toHaveURL(/\/sign-in/)

    expect((await admin.auth.admin.getUserById(user.id)).data.user).toBeNull()
    expect(await ownedCounts(user.id)).toEqual({ decks: 0, cards: 0, progress: 0, quizzes: 0, solves: 0 })
    expect((await admin.from('usage_events').select('id').eq('user_id', user.id)).data).toEqual([])
    expect((await admin.from('profiles').select('id').eq('id', user.id)).data).toEqual([])
    expect((await admin.from('subscriptions').select('user_id').eq('user_id', user.id)).data).toEqual([])
    expect(await listObjects('uploads', user.id)).toEqual([])
    // The deleted account can no longer sign in.
    await page.goto('/sign-in?lng=en')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: en.auth.signIn.submit }).click()
    await expect(page.getByText(en.auth.signIn.invalid)).toBeVisible()
    await context.close()
  })

  test('account deletion on the server needs the typed email', async ({ request }) => {
    const user = await createTestUser('delete-guard')
    const wrong = await request.post('/api/account', { data: { action: 'delete', confirm: 'nobody@example.com' }, headers: { authorization: `Bearer ${user.accessToken}` } })
    expect(wrong.status()).toBe(400)
    expect((await admin.auth.admin.getUserById(user.id)).data.user).not.toBeNull()
    const nobody = await request.post('/api/account', { data: { action: 'delete', confirm: user.email } })
    expect(nobody.status()).toBe(401)
  })

  test('only an admin sees usage costs: the owner page and the usage endpoint', async ({ browser, request }) => {
    const user = await createTestUser('not-admin')
    const boss = await createTestUser('admin')
    await admin.from('profiles').update({ role: 'admin' }).eq('id', boss.id)
    await admin.from('usage_events').insert([
      { user_id: user.id, feature: 'generate', cost_usd: 0.25 },
      { user_id: boss.id, feature: 'cards', cost_usd: 0.05 },
    ])
    const denied = await request.post('/api/account', { data: { action: 'usage' }, headers: { authorization: `Bearer ${user.accessToken}` } })
    expect(denied.status()).toBe(403)
    const allowed = await request.post('/api/account', { data: { action: 'usage' }, headers: { authorization: `Bearer ${boss.accessToken}` } })
    expect(allowed.status()).toBe(200)
    const summary = (await allowed.json()) as { totalUsd: number; byFeature: { feature: string; costUsd: number }[] }
    expect(summary.totalUsd).toBeGreaterThanOrEqual(0.3)
    expect(summary.byFeature.map((entry) => entry.feature)).toEqual(expect.arrayContaining(['generate', 'cards']))

    const plain = await newContext(browser, user)
    const plainPage = await plain.newPage()
    await plainPage.goto('/owner?lng=en')
    await expect(plainPage.locator('[data-purpose="owner-spend"]')).toHaveCount(0)
    await expect(plainPage.getByText('$')).toHaveCount(0)
    const adminContext = await newContext(browser, boss)
    const adminPage = await adminContext.newPage()
    await adminPage.goto('/owner?lng=en')
    await expect(adminPage.getByText(/\$/).first()).toBeVisible()
    await plain.close()
    await adminContext.close()
  })
})
