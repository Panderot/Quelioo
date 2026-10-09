import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { fillText, SHORT_TEXT } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'
import { buildSilentWavBase64, TINY_WAV_BASE64 } from '../fixtures/tinyWav'

const SAMPLE_LYRICS = {
  title: 'Photosynthesis Jam',
  lyrics: '[Verse]\nPlants take in carbon dioxide each day\n[Chorus]\nCarbon dioxide in, oxygen out, hooray',
  musicPrompt: 'Upbeat pop, 110 bpm, bright synths, clear vocal, English lyrics.',
  targetSeconds: 30,
  maxLyricsChars: 700,
  includedFactsCount: 6,
  totalFactsCount: 6,
  factCheckPassed: true,
  flaggedLines: [] as number[],
}

const SAMPLE_SONG = {
  audio: TINY_WAV_BASE64,
  mimeType: 'audio/wav',
  lyrics: SAMPLE_LYRICS.lyrics,
  provider: 'demo' as const,
  demo: true,
  durationSeconds: 10,
}

interface SeedSongInput {
  id: string
  quizId: string
  quizTitle?: string
  title?: string
  lyrics?: string
  style?: string
  tone?: string
  provider?: string
  demo?: boolean
  mimeType?: string
  durationSeconds?: number
  factCheckPassed?: boolean
  coverage?: { question: string; line: string | null }[]
  createdAt: string
}

/** Seeds the real IndexedDB store directly (quelio-songs/songs), awaited via page.evaluate so the
 * write is guaranteed to finish before the test navigates to a page that reads it — avoids the race
 * an addInitScript-based IndexedDB seed would have against the app's own mount-time read. */
async function seedSongs(page: Page, songs: SeedSongInput[], audioBase64 = TINY_WAV_BASE64) {
  // Fill in the handful of fields every real StoredSong always has (never actually "legacy") so
  // tests only have to specify what's relevant to them.
  const withRequiredDefaults = songs.map((song) => ({
    title: song.quizTitle ?? 'Song',
    style: 'pop',
    tone: 'normal',
    provider: 'demo',
    demo: true,
    mimeType: 'audio/wav',
    durationSeconds: 10,
    factCheckPassed: true,
    lyrics: '[Verse]\nLa la la\n[Chorus]\nLa la la',
    ...song,
  }))
  await page.evaluate(({ songs: data, audioBase64 }) => {
    function base64ToBlob(base64: string, mimeType: string): Blob {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new Blob([bytes], { type: mimeType })
    }
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('quelio-songs', 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('songs')) {
          const store = db.createObjectStore('songs', { keyPath: 'id' })
          store.createIndex('quizId', 'quizId', { unique: false })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('songs', 'readwrite')
        for (const song of data) {
          tx.objectStore('songs').put({ ...song, audio: base64ToBlob(audioBase64, song.mimeType ?? 'audio/wav') })
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
    })
  }, { songs: withRequiredDefaults, audioBase64 })
}

async function mockSongStatus(page: Page, enabled: boolean, options: { requiresAccessCode?: boolean; maxSeconds?: number } = {}) {
  const { requiresAccessCode = false, maxSeconds = 120 } = options
  await page.route('**/api/song', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled, provider: 'demo', maxSeconds, requiresAccessCode }),
    })
  })
}

async function mockSongLyrics(page: Page, writeResponse: unknown) {
  await page.route('**/api/song-lyrics', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string }
    if (body.mode === 'check') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ factCheckPassed: true, flaggedLines: [] }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(writeResponse) })
  })
}

async function mockSongCreate(page: Page, response: unknown, options: { delayMs?: number } = {}) {
  await page.route('**/api/song', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
  })
}

const SEEDED_ENTRY = {
  id: 'songs-page-quiz',
  title: SAMPLE_QUIZ.title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: '6',
  optionsCount: null,
  outputLanguage: 'auto',
  sourceText: 'Seeded source text about photosynthesis.',
  quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
}

test('sidebar "Songs" item is hidden and /songs redirects to Create when the feature is disabled', async ({ page }) => {
  await mockSongStatus(page, false)
  await page.goto('/?lng=en')
  await expect(page.getByRole('link', { name: 'Songs' })).toHaveCount(0)
  // Without Songs, Flashcards, Live Game and Audio Lesson follow Archive.
  await expect(page.locator('[data-purpose="sidebar-navigation"]').getByRole('link')).toHaveText(['Create', 'Solve', 'Archive', 'Flashcards', 'Live Game', 'Audio Lesson'])

  await page.goto('/songs?lng=en')
  await expect(page).toHaveURL('/')
})

test('sidebar "Songs" item appears when enabled and navigates to /songs', async ({ page }) => {
  await mockSongStatus(page, true)
  await page.goto('/?lng=en')
  // Flashcards sits directly after Songs, then Live Game and Audio Lesson.
  await expect(page.locator('[data-purpose="sidebar-navigation"]').getByRole('link')).toHaveText(['Create', 'Solve', 'Songs', 'Flashcards', 'Live Game', 'Audio Lesson', 'Archive'])
  await page.getByRole('link', { name: 'Songs' }).click()
  await expect(page).toHaveURL('/songs')
  await expect(page.getByRole('heading', { name: 'Songs' })).toBeVisible()
})

test('@mobile drawer at 390px keeps Flashcards right after Songs', async ({ page }) => {
  await mockSongStatus(page, true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?lng=en')
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  const nav = page.locator('[data-purpose="sidebar-navigation"]')
  await expect(nav.getByRole('link')).toHaveText(['Create', 'Solve', 'Songs', 'Flashcards', 'Live Game', 'Audio Lesson', 'Archive'])
  await nav.getByRole('link', { name: 'Flashcards' }).click()
  await expect(page).toHaveURL('/flashcards')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('empty archive: the quiz picker says so and links to Create', async ({ page }) => {
  await mockSongStatus(page, true)
  await page.goto('/songs?lng=en')
  await page.getByRole('button', { name: 'New song' }).first().click()
  await expect(page.getByText("You don't have any quizzes yet.")).toBeVisible()
  await page.getByRole('link', { name: 'Go to Create' }).click()
  await expect(page).toHaveURL('/')
})

test('New song: quiz picker lists and searches Archive quizzes, then opens the song flow', async ({ page, seedArchive }) => {
  await mockSongStatus(page, true)
  await mockSongLyrics(page, SAMPLE_LYRICS)
  await seedArchive([SEEDED_ENTRY, { ...SEEDED_ENTRY, id: 'other-quiz', title: 'Unrelated Quiz' }])

  await page.goto('/songs?lng=en')
  await page.getByRole('button', { name: 'New song' }).first().click()
  await expect(page.getByRole('button', { name: new RegExp(SAMPLE_QUIZ.title) })).toContainText('6 questions')

  await page.getByPlaceholder('Search quizzes...').fill('Unrelated')
  await expect(page.getByRole('button', { name: /Sample Quiz/ })).toHaveCount(0)
  await page.getByPlaceholder('Search quizzes...').fill('')

  await page.getByRole('button', { name: new RegExp(SAMPLE_QUIZ.title) }).click()
  await expect(page.getByRole('dialog', { name: 'Turn into a song' })).toBeVisible()
  await page.getByRole('button', { name: 'Write lyrics' }).click()
  await expect(page.getByLabel('Lyrics')).toHaveValue(SAMPLE_LYRICS.lyrics)
})

test('full flow: a song made from the picker appears in the list; the generating row shows while creating', { tag: '@cross' }, async ({ browserName, page, seedArchive }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit on Windows cannot store Blobs in IndexedDB')
  await mockSongStatus(page, true)
  await mockSongLyrics(page, SAMPLE_LYRICS)
  await mockSongCreate(page, SAMPLE_SONG, { delayMs: 300 })
  await seedArchive([SEEDED_ENTRY])

  await page.goto('/songs?lng=en')
  await page.getByRole('button', { name: 'New song' }).first().click()
  await page.getByRole('button', { name: new RegExp(SAMPLE_QUIZ.title) }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()
  await page.getByRole('button', { name: 'Make the song' }).click()
  await expect(page.getByText('Creating your song...')).toBeVisible()

  await expect(page.getByText('Demo sound')).toBeVisible()
  await page.getByRole('dialog', { name: 'Turn into a song' }).getByRole('button', { name: 'Close' }).click()

  const row = page.locator('[data-purpose="songs-list"] li').filter({ hasText: SAMPLE_QUIZ.title })
  await expect(row).toBeVisible()
})

test('songs made from the quiz result view appear on the Songs page, with a "See all songs" link', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await mockSongLyrics(page, SAMPLE_LYRICS)
  await mockSongCreate(page, SAMPLE_SONG)
  await mockGenerate(SAMPLE_QUIZ)

  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()
  await page.getByRole('button', { name: 'Make the song' }).click()
  await expect(page.getByText('Demo sound')).toBeVisible()

  await page.getByRole('link', { name: 'See all songs' }).click()
  await expect(page).toHaveURL('/songs')
  await expect(page.locator('[data-purpose="songs-list"] li').filter({ hasText: SAMPLE_QUIZ.title })).toBeVisible()
})

test('play/pause: only one song plays at a time across the list', { tag: '@cross' }, async ({ browserName, page, seedArchive }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit on Windows cannot store Blobs in IndexedDB')
  await mockSongStatus(page, true)
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/?lng=en')
  await seedSongs(page, [
    { id: 'song-a', quizId: SEEDED_ENTRY.id, quizTitle: 'Song A Quiz', createdAt: '2026-01-02T00:00:00.000Z', tone: 'normal', style: 'pop' },
    { id: 'song-b', quizId: SEEDED_ENTRY.id, quizTitle: 'Song B Quiz', createdAt: '2026-01-03T00:00:00.000Z', tone: 'normal', style: 'pop' },
  ])
  await page.goto('/songs?lng=en')

  const rowA = page.locator('[data-purpose="songs-list"] li').filter({ hasText: 'Song A Quiz' })
  const rowB = page.locator('[data-purpose="songs-list"] li').filter({ hasText: 'Song B Quiz' })

  await rowA.getByRole('button', { name: 'Play' }).click()
  await expect(rowA.getByRole('button', { name: 'Pause' })).toBeVisible()

  await rowB.getByRole('button', { name: 'Play' }).click()
  await expect(rowB.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(rowA.getByRole('button', { name: 'Play' })).toBeVisible()
})

test('view lyrics expands with section tags shown as pill labels; download has the right filename', { tag: '@cross' }, async ({ browserName, page, seedArchive }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit on Windows cannot store Blobs in IndexedDB')
  await mockSongStatus(page, true)
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/?lng=en')
  await seedSongs(page, [
    {
      id: 'song-a',
      quizId: SEEDED_ENTRY.id,
      quizTitle: 'Lyrics Quiz',
      lyrics: '[Verse]\nHello there\n[Chorus]\nSing along',
      createdAt: '2026-01-02T00:00:00.000Z',
      tone: 'normal',
      style: 'pop',
      mimeType: 'audio/wav',
    },
  ])
  await page.goto('/songs?lng=en')

  const row = page.locator('[data-purpose="songs-list"] li').filter({ hasText: 'Lyrics Quiz' })
  await row.getByRole('button', { name: 'View lyrics' }).click()
  await expect(row.getByText('[Verse]')).toBeVisible()
  await expect(row.getByText('Hello there')).toBeVisible()
  await row.getByRole('button', { name: 'Hide lyrics' }).click()
  await expect(row.getByText('Hello there')).not.toBeVisible()

  await expect(row.getByRole('link', { name: 'Download' })).toHaveAttribute('download', /lyrics-quiz\.wav$/)
  await expect(row.getByRole('link', { name: 'Open quiz' })).toHaveAttribute('href', `/archive/${SEEDED_ENTRY.id}`)
})

test('delete requires confirmation and offers undo', async ({ page, seedArchive }) => {
  await mockSongStatus(page, true)
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/?lng=en')
  await seedSongs(page, [{ id: 'song-a', quizId: SEEDED_ENTRY.id, quizTitle: 'Delete Me Quiz', createdAt: '2026-01-02T00:00:00.000Z', tone: 'normal', style: 'pop' }])
  await page.goto('/songs?lng=en')

  const row = page.locator('[data-purpose="songs-list"] li').filter({ hasText: 'Delete Me Quiz' })
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(row.getByText('Delete this song?')).toBeVisible()
  await row.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('[data-purpose="songs-list"] li').filter({ hasText: 'Delete Me Quiz' })).toBeVisible()

  await row.getByRole('button', { name: 'Delete' }).click()
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('[data-purpose="songs-list"] li').filter({ hasText: 'Delete Me Quiz' })).toHaveCount(0)
  await expect(page.getByText('Song deleted.')).toBeVisible()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('[data-purpose="songs-list"] li').filter({ hasText: 'Delete Me Quiz' })).toBeVisible()
})

test('filters by tone and search by quiz title narrow the list', async ({ page, seedArchive }) => {
  await mockSongStatus(page, true)
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/?lng=en')
  await seedSongs(page, [
    { id: 'song-a', quizId: SEEDED_ENTRY.id, quizTitle: 'Photosynthesis Song', createdAt: '2026-01-02T00:00:00.000Z', tone: 'normal', style: 'pop' },
    { id: 'song-b', quizId: SEEDED_ENTRY.id, quizTitle: 'Funny Digestion Song', createdAt: '2026-01-03T00:00:00.000Z', tone: 'funny', style: 'rap' },
  ])
  await page.goto('/songs?lng=en')

  await page.getByRole('button', { name: 'Funny', exact: true }).click()
  await expect(page.getByText('Photosynthesis Song')).toHaveCount(0)
  await expect(page.getByText('Funny Digestion Song')).toBeVisible()

  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByPlaceholder('Search by quiz title...').fill('Photosynthesis')
  await expect(page.getByText('Funny Digestion Song')).toHaveCount(0)
  await expect(page.getByText('Photosynthesis Song')).toBeVisible()
})

test('empty state shows a message and a New song button', async ({ page }) => {
  await mockSongStatus(page, true)
  await page.goto('/songs?lng=en')
  await expect(page.getByText('No songs yet')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New song' })).toHaveCount(2) // header CTA + empty-state CTA
})

test('an old song record without the newer fields still renders using defaults', { tag: '@cross' }, async ({ browserName, page, seedArchive }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit on Windows cannot store Blobs in IndexedDB')
  await mockSongStatus(page, true)
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/?lng=en')
  // Simulates a record saved before quizTitle/tone/factCheckPassed existed.
  await page.evaluate((quizId) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('quelio-songs', 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('songs')) {
          const store = db.createObjectStore('songs', { keyPath: 'id' })
          store.createIndex('quizId', 'quizId', { unique: false })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('songs', 'readwrite')
        tx.objectStore('songs').put({
          id: 'legacy-song',
          quizId,
          title: 'Legacy Song Title',
          lyrics: '[Verse]\nOld song\n[Chorus]\nStill plays',
          style: 'pop',
          provider: 'demo',
          demo: true,
          mimeType: 'audio/wav',
          durationSeconds: 10,
          createdAt: '2025-01-01T00:00:00.000Z',
          audio: new Blob([new Uint8Array(1)], { type: 'audio/wav' }),
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
    })
  }, SEEDED_ENTRY.id)
  await page.goto('/songs?lng=en')

  // quizTitle defaults to the song's own title; tone defaults to Normal.
  const row = page.locator('[data-purpose="songs-list"] li').filter({ hasText: 'Legacy Song Title' })
  await expect(row).toBeVisible()
  await expect(row.getByText('Normal')).toBeVisible()
})

test('a song whose quiz was deleted from the Archive shows "Quiz deleted" instead of an open-quiz link', async ({ page }) => {
  await mockSongStatus(page, true)
  await page.goto('/?lng=en')
  await seedSongs(page, [{ id: 'orphan-song', quizId: 'does-not-exist', quizTitle: 'Orphaned Quiz', createdAt: '2026-01-02T00:00:00.000Z', tone: 'normal', style: 'pop' }])
  await page.goto('/songs?lng=en')

  const row = page.locator('[data-purpose="songs-list"] li').filter({ hasText: 'Orphaned Quiz' })
  await expect(row.getByText('Quiz deleted')).toBeVisible()
  await expect(row.getByRole('link', { name: 'Open quiz' })).toHaveCount(0)
})

test('@mobile the Songs page works at 390px with no horizontal overflow', async ({ page, seedArchive }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile-only: exercises the 390px layout')
  await mockSongStatus(page, true)
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/?lng=en')
  await seedSongs(page, [{ id: 'song-a', quizId: SEEDED_ENTRY.id, quizTitle: 'Mobile Quiz', createdAt: '2026-01-02T00:00:00.000Z', tone: 'normal', style: 'pop' }])
  await page.goto('/songs?lng=en')

  await expect(page.getByText('Mobile Quiz')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('the Songs page is localized in Turkish and Western Armenian', async ({ page, seedArchive }) => {
  await mockSongStatus(page, true)
  await seedArchive([SEEDED_ENTRY])

  await page.goto('/songs?lng=tr')
  await expect(page.getByRole('heading', { name: 'Şarkılar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Yeni şarkı' }).first()).toBeVisible()

  await page.goto('/songs?lng=hyw')
  await expect(page.getByRole('heading', { name: 'Երգեր' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Նոր երգ' }).first()).toBeVisible()
})

// --- Access code gate (mocked, simulating production) ---------------------------------------

test('access gate: lock card shown without a code; wrong code shows an error; correct code unlocks and persists', async ({ page, seedArchive }) => {
  await mockSongStatus(page, true, { requiresAccessCode: true })
  await seedArchive([SEEDED_ENTRY])

  await page.route('**/api/song', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    const sentCode = route.request().headers()['x-music-access']
    if (sentCode !== 'right-code') {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'locked' }) })
      return
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'parse' }) })
  })

  await page.goto('/songs?lng=en')
  await page.getByRole('button', { name: 'New song' }).first().click()
  await page.getByRole('button', { name: new RegExp(SAMPLE_QUIZ.title) }).click()

  const dialog = page.getByRole('dialog', { name: 'Turn into a song' })
  await expect(dialog.getByText('Enter access code')).toBeVisible()

  await dialog.getByLabel('Enter access code').fill('wrong-code')
  await dialog.getByRole('button', { name: 'Unlock' }).click()
  await expect(dialog.getByText("That code isn't correct. Please try again.")).toBeVisible()

  await dialog.getByLabel('Enter access code').fill('right-code')
  await dialog.getByRole('button', { name: 'Unlock' }).click()
  await expect(dialog.getByRole('radio', { name: 'Pop' })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'New song' }).first().click()
  await page.getByRole('button', { name: new RegExp(SAMPLE_QUIZ.title) }).click()
  await expect(page.getByRole('dialog', { name: 'Turn into a song' }).getByRole('radio', { name: 'Pop' })).toBeVisible()
})

test('access gate: "Lock" forgets the stored code; the song list stays visible while locked', async ({ page, seedArchive }) => {
  await mockSongStatus(page, true, { requiresAccessCode: true })
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/?lng=en')
  await page.evaluate(() => localStorage.setItem('quelio.musicAccessCode.v1', 'right-code'))
  await seedSongs(page, [{ id: 'song-a', quizId: SEEDED_ENTRY.id, quizTitle: 'Visible While Locked', createdAt: '2026-01-02T00:00:00.000Z', tone: 'normal', style: 'pop' }])

  await page.goto('/songs?lng=en')
  await expect(page.getByText('Visible While Locked')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Lock' })).toHaveCount(0) // owner controls live on /owner only
  await page.goto('/owner?lng=en')
  await page.getByRole('button', { name: 'Lock' }).click()
  await page.goto('/songs?lng=en')
  await expect(page.getByText('Visible While Locked')).toBeVisible() // the list itself is never gated
  expect(await page.evaluate(() => localStorage.getItem('quelio.musicAccessCode.v1'))).toBeNull()

  await page.getByRole('button', { name: 'New song' }).first().click()
  await page.getByRole('button', { name: new RegExp(SAMPLE_QUIZ.title) }).click()
  await expect(page.getByRole('dialog', { name: 'Turn into a song' }).getByText('Enter access code')).toBeVisible()
})

test('an old song with a wrong stored length is corrected from its audio file once the songs load', async ({ page, seedArchive }) => {
  await mockSongStatus(page, true)
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/?lng=en')
  // Stored as 90 s (the requested length) although the file is 3 s long.
  await seedSongs(
    page,
    [{ id: 'song-wrong-length', quizId: SEEDED_ENTRY.id, quizTitle: 'Wrong Length Song', createdAt: '2026-01-02T00:00:00.000Z', durationSeconds: 90 }],
    buildSilentWavBase64(3),
  )

  await page.goto('/songs?lng=en')
  await expect(page.getByText('0:03', { exact: false })).toBeVisible()
  await expect(page.getByText('1:30')).toHaveCount(0)

  await page.reload()
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('quelio-songs', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const get = request.result.transaction('songs').objectStore('songs').get('song-wrong-length')
          get.onsuccess = () => resolve(get.result.durationSeconds)
        }
      }),
  )
  expect(stored).toBe(3)
})

test('a song card shows "x/y questions in the song" with the covering lines, and its lyrics use the localized tags', async ({ page, seedArchive }) => {
  await mockSongStatus(page, true)
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/?lng=tr')
  await seedSongs(page, [
    {
      id: 'song-coverage',
      quizId: SEEDED_ENTRY.id,
      quizTitle: 'Kapsam Şarkısı',
      createdAt: '2026-01-02T00:00:00.000Z',
      lyrics: '[Verse 1]\nKloroplastta olur\n[Chorus]\nKlorofil ışığı soğurur',
      coverage: [
        { question: 'Nerede olur?', line: 'Kloroplastta olur' },
        { question: 'Işığı ne soğurur?', line: 'Klorofil ışığı soğurur' },
        { question: 'Ürünler nelerdir?', line: null },
      ],
    },
  ])

  await page.goto('/songs?lng=tr')
  await page.getByRole('button', { name: '2/3 soru şarkıda' }).click()
  await expect(page.getByText('Satır: Kloroplastta olur')).toBeVisible()
  await expect(page.getByText('Şarkıda yok')).toBeVisible()

  await page.getByRole('button', { name: 'Sözleri göster' }).click()
  await expect(page.getByText('[Kıta 1]')).toBeVisible()
  await expect(page.getByText('[Nakarat]')).toBeVisible()
})

test('the Songs page stays mounted but refreshes its list when you come back to it', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await mockSongLyrics(page, SAMPLE_LYRICS)
  await mockSongCreate(page, SAMPLE_SONG)
  await mockGenerate(SAMPLE_QUIZ)

  await page.goto('/songs?lng=en')
  await expect(page.getByRole('heading', { name: 'Songs' })).toBeVisible()
  await expect(page.locator('[data-purpose="songs-list"] li')).toHaveCount(0)

  const nav = page.locator('[data-purpose="sidebar-navigation"]')
  await nav.getByRole('link', { name: 'Create' }).click()
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()
  await page.getByRole('button', { name: 'Make the song' }).click()
  await expect(page.getByText('Demo sound')).toBeVisible()

  await page.getByRole('link', { name: 'See all songs' }).click()
  await expect(page.locator('[data-purpose="songs-list"] li').filter({ hasText: SAMPLE_QUIZ.title })).toBeVisible()
})
