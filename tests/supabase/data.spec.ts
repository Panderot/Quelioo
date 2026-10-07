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
  const count = async (table: 'decks' | 'cards' | 'card_progress' | 'quizzes' | 'songs' | 'solves' | 'lessons' | 'lesson_plans' | 'lesson_segments') => {
    const { count: total } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId)
    return total ?? 0
  }
  return {
    decks: await count('decks'),
    cards: await count('cards'),
    progress: await count('card_progress'),
    quizzes: await count('quizzes'),
    songs: await count('songs'),
    solves: await count('solves'),
    lessons: await count('lessons'),
    plans: await count('lesson_plans'),
    segments: await count('lesson_segments'),
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
})

test.describe('storage layers in the browser (songs, solutions, lessons)', () => {
  test('songs: upload, list, play through a signed URL, delete removes the file', async ({ browser }) => {
    const user = await createTestUser('songs')
    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto('/account?lng=en')
    await page.evaluate(async () => {
      const { saveSong } = (await import(/* @vite-ignore */ '/src/lib/songStorage.ts' as string)) as typeof import('../../src/lib/songStorage')
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
      await saveSong({ quizId: 'quiz-1', quizTitle: 'Quiz one', title: 'Song one', lyrics: 'la la', style: 'pop', tone: 'normal', provider: 'demo', demo: true, mimeType: 'audio/mpeg', durationSeconds: 3, factCheckPassed: true, audio: new Blob([bytes], { type: 'audio/mpeg' }) })
    })
    // A fresh page load (a second device): the list has no audio bytes yet.
    await page.reload()
    const result = await page.evaluate(async () => {
      const { getAllSongs, getSongsForQuiz, getQuizIdsWithSongs, getSongPlaybackUrl, getSongDownloadUrl, deleteSong, updateSongDuration } = (await import(/* @vite-ignore */ '/src/lib/songStorage.ts' as string)) as typeof import('../../src/lib/songStorage')
      const listed = await getAllSongs()
      const forQuiz = await getSongsForQuiz('quiz-1')
      const ids = [...(await getQuizIdsWithSongs())]
      const url = await getSongPlaybackUrl(listed[0])
      const fetched = url ? new Uint8Array(await (await fetch(url)).arrayBuffer()) : null
      const download = await getSongDownloadUrl(listed[0], 'my-song.mp3')
      await updateSongDuration(listed[0].id, 4.5)
      const after = await getAllSongs()
      await deleteSong(listed[0].id)
      return { listed: listed.length, audioLoaded: listed[0].audio !== null, path: listed[0].audioPath, forQuiz: forQuiz.length, ids, bytes: fetched ? Array.from(fetched) : null, download, signed: url?.includes('/object/sign/') ?? false, duration: after[0].durationSeconds, remaining: (await getAllSongs()).length }
    })
    expect(result.listed).toBe(1)
    expect(result.audioLoaded).toBe(false) // the list does not download audio
    expect(result.path).toMatch(new RegExp(`^${user.id}/songs/`))
    expect(result.forQuiz).toBe(1)
    expect(result.ids).toEqual(['quiz-1'])
    expect(result.bytes).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.signed).toBe(true) // played through a short-lived signed URL
    expect(result.download).toContain('download=')
    expect(result.duration).toBe(4.5)
    expect(result.remaining).toBe(0)
    expect(await listObjects('audio', user.id)).toEqual([])
    await context.close()
  })

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

  test('lessons: save, read back at once, cached plan, recorded lines and pruning', async ({ browser }) => {
    const user = await createTestUser('lessons')
    const context = await newContext(browser, user)
    const page = await context.newPage()
    await page.goto('/account?lng=en')
    const result = await page.evaluate(async () => {
      const store = (await import(/* @vite-ignore */ '/src/lib/lessonStorage.ts' as string)) as typeof import('../../src/lib/lessonStorage')
      const { flushWrites } = (await import(/* @vite-ignore */ '/src/lib/data/writeQueue.ts' as string)) as typeof import('../../src/lib/data/writeQueue')
      const id = store.createLessonId()
      const lesson = {
        id,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: 'Cells',
        sourceKind: 'text' as const,
        sourceLabel: '',
        sourceText: 'Cells are the basic unit of life.',
        sourceHash: 'hash1',
        options: { style: 'two_hosts' as const, level: 'general' as const, tone: 'normal' as const, language: 'en' },
        keyPoints: [{ id: 'K1', text: 'Cells are basic', source: 'Cells are the basic unit of life.', topic: 'Cells', facts: 1 }],
        episodes: [{ part: 1, keyPointIds: ['K1'], script: null, costUsd: null, cachedShare: null }],
        planCostUsd: 0.02,
      }
      await store.putLesson(lesson)
      const immediately = await store.getLesson(id) // still queued: the overlay answers
      await flushWrites()
      await store.putLesson({ ...lesson, title: 'Cells v2' })
      await flushWrites()
      const all = await store.getAllLessons()
      await store.putCachedPlan({ key: 'plan-key', title: 'Plan', keyPoints: [{ id: 'K1', text: 'Cells are basic', source: 'Cells are the basic unit of life.', topic: 'Cells', facts: 1 }], episodes: [{ part: 1, keyPointIds: ['K1'] }] })
      await flushWrites()
      const plan = await store.getCachedPlan('plan-key')
      const bytes = new Uint8Array([9, 8, 7, 6])
      await store.putSegment({ key: 'seg1', audio: new Blob([bytes], { type: 'audio/mpeg' }), durationSeconds: 1.5, createdAt: new Date().toISOString() })
      await store.putSegment({ key: 'seg2', audio: new Blob([bytes], { type: 'audio/mpeg' }), durationSeconds: 2, createdAt: new Date().toISOString() })
      await flushWrites()
      store.resetLessonCache() // a new device: nothing in memory
      const segments = await store.getSegments(['seg1', 'seg2', 'missing'])
      const seg1 = segments.get('seg1')
      const seg1Bytes = seg1 ? Array.from(new Uint8Array(await seg1.audio.arrayBuffer())) : null
      await store.pruneSegments(new Set(['seg1']))
      await flushWrites()
      store.resetLessonCache()
      const afterPrune = await store.getSegments(['seg1', 'seg2'])
      await store.deleteLesson(id)
      await flushWrites()
      store.resetLessonCache()
      return { immediately: immediately?.title, all: all.map((entry: { title: string }) => entry.title), planTitle: plan?.title, segmentKeys: [...segments.keys()].sort(), seg1Bytes, seg1Duration: seg1?.durationSeconds, afterPrune: [...afterPrune.keys()], deleted: (await store.getAllLessons()).length }
    })
    expect(result.immediately).toBe('Cells')
    expect(result.all).toEqual(['Cells v2'])
    expect(result.planTitle).toBe('Plan')
    expect(result.segmentKeys).toEqual(['seg1', 'seg2'])
    expect(result.seg1Bytes).toEqual([9, 8, 7, 6])
    expect(result.seg1Duration).toBe(1.5)
    expect(result.afterPrune).toEqual(['seg1'])
    expect(result.deleted).toBe(0)
    expect(await listObjects('audio', user.id)).toEqual([`${user.id}/segments/seg1.mp3`])
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
    await expect(dialog).toContainText('1 song')
    await expect(dialog).toContainText('1 solution')
    await expect(dialog).toContainText('1 audio lesson')
    await dialog.getByRole('button', { name: en.importDialog.import }).click()
    await expect(dialog.getByText(en.importDialog.doneTitle)).toBeVisible({ timeout: 60_000 })
    await expect(dialog.getByText(en.importDialog.unverified)).toHaveCount(0)

    const first = await ownedCounts(user.id)
    expect(first).toEqual({ decks: 2, cards: 5, progress: 5, quizzes: 2, songs: 1, solves: 1, lessons: 1, plans: 1, segments: 1 })
    // Progress is kept exactly.
    const progress = await admin.from('card_progress').select('box, reviews, lapses').eq('user_id', user.id).order('box')
    expect(progress.data?.map((row) => row.box)).toEqual([1, 2, 3, 4, 5])
    expect(progress.data?.find((row) => row.box === 5)).toEqual({ box: 5, reviews: 10, lapses: 1 })
    // Files arrived.
    expect((await listObjects('audio', user.id)).length).toBe(2)
    expect((await listObjects('uploads', user.id)).length).toBe(1)
    const solve = await admin.from('solves').select('extras, thumbnail_path').eq('user_id', user.id).single()
    expect(solve.data?.extras).toEqual({ note: 'kept' })
    // The song still points at its quiz (the quiz got a new id).
    const song = await admin.from('songs').select('quiz_id').eq('user_id', user.id).single()
    const quizIds = (await admin.from('quizzes').select('id, title').eq('user_id', user.id)).data ?? []
    expect(quizIds.find((quiz) => quiz.id === song.data?.quiz_id)?.title).toBe('Legacy photosynthesis')

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
    await expect.poll(() => readLegacyCounts(page)).toEqual({ quizzes: 0, decks: 0, cards: 0, songs: 0, solutions: 0, lessons: 0 })
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
    await user.client.storage.from('audio').upload(`${user.id}/songs/x.mp3`, new Blob(['abc'], { type: 'audio/mpeg' }), { contentType: 'audio/mpeg' })
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
    await user.client.from('lesson_segments').insert({ key: 'doomed', audio_path: `${user.id}/segments/doomed.mp3` })
    await user.client.storage.from('audio').upload(`${user.id}/segments/doomed.mp3`, new Blob(['abc'], { type: 'audio/mpeg' }), { contentType: 'audio/mpeg' })
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
    expect(await ownedCounts(user.id)).toEqual({ decks: 0, cards: 0, progress: 0, quizzes: 0, songs: 0, solves: 0, lessons: 0, plans: 0, segments: 0 })
    expect((await admin.from('usage_events').select('id').eq('user_id', user.id)).data).toEqual([])
    expect((await admin.from('profiles').select('id').eq('id', user.id)).data).toEqual([])
    expect((await admin.from('subscriptions').select('user_id').eq('user_id', user.id)).data).toEqual([])
    expect(await listObjects('audio', user.id)).toEqual([])
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
