import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { fillText, SHORT_TEXT } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'
import { TINY_WAV_BASE64 } from '../fixtures/tinyWav'

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

function buildQuizWithQuestionCount(count: number) {
  return {
    title: 'Length Test Quiz',
    provider: 'openai' as const,
    fallbackUsed: false,
    requestedCount: count,
    incomplete: false,
    questions: Array.from({ length: count }, (_, i) => ({
      id: `q-${i}`,
      type: 'mcq' as const,
      question: `Question ${i + 1}?`,
      explanation: '',
      options: ['A', 'B', 'C', 'D'],
      answerIndex: 0,
      estimatedSeconds: 10,
    })),
  }
}

async function mockSongStatus(
  page: Page,
  enabled: boolean,
  options: { provider?: 'demo' | 'gemini'; maxSeconds?: number; requiresAccessCode?: boolean } = {},
) {
  const { provider = 'demo', maxSeconds = 120, requiresAccessCode = false } = options
  await page.route('**/api/song', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled, provider, maxSeconds, requiresAccessCode }) })
  })
}

/** Mocks /api/song-lyrics, routing on the request body's `mode` field: "write" (default/omitted)
 * vs "check" get separate configurable responses. */
async function mockSongLyrics(
  page: Page,
  writeResponse: unknown,
  options: { status?: number; checkResponse?: unknown; checkStatus?: number } = {},
) {
  await page.route('**/api/song-lyrics', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string }
    if (body.mode === 'check') {
      await route.fulfill({
        status: options.checkStatus ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(options.checkResponse ?? { factCheckPassed: true, flaggedLines: [] }),
      })
      return
    }
    await route.fulfill({ status: options.status ?? 200, contentType: 'application/json', body: JSON.stringify(writeResponse) })
  })
}

async function mockSongCreate(page: Page, response: unknown, options: { status?: number; delayMs?: number } = {}) {
  await page.route('**/api/song', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    await route.fulfill({ status: options.status ?? 200, contentType: 'application/json', body: JSON.stringify(response) })
  })
}

async function reachResultView(page: Page, mockGenerate: (response: unknown) => Promise<unknown>, quiz: unknown = SAMPLE_QUIZ) {
  await mockGenerate(quiz)
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(page.getByRole('heading', { name: (quiz as { title: string }).title })).toBeVisible()
}

test('entry button is hidden when the feature is disabled', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, false)
  await reachResultView(page, mockGenerate)
  await expect(page.getByRole('button', { name: 'Turn into a song' })).toHaveCount(0)
})

test('entry button appears when enabled and opens the panel with style and tone chips', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await reachResultView(page, mockGenerate) // SAMPLE_QUIZ has 6 questions -> 6 facts -> ~60s band

  const button = page.getByRole('button', { name: 'Turn into a song' })
  await expect(button).toBeVisible()
  await button.click()

  const dialog = page.getByRole('dialog', { name: 'Turn into a song' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('About 60 seconds')).toBeVisible()

  const pop = dialog.getByRole('radio', { name: 'Pop' })
  const rock = dialog.getByRole('radio', { name: 'Rock' })
  await expect(pop).toHaveAttribute('aria-checked', 'true')
  await rock.click()
  await expect(rock).toHaveAttribute('aria-checked', 'true')
  await expect(pop).toHaveAttribute('aria-checked', 'false')

  const normal = dialog.getByRole('radio', { name: 'Normal' })
  const funny = dialog.getByRole('radio', { name: 'Funny' })
  await expect(normal).toHaveAttribute('aria-checked', 'true')
  await funny.click()
  await expect(funny).toHaveAttribute('aria-checked', 'true')
  await expect(normal).toHaveAttribute('aria-checked', 'false')
})

for (const [count, seconds] of [
  [5, 30],
  [10, 60],
  [15, 90],
  [20, 120],
] as const) {
  test(`length note shows "About ${seconds} seconds" for a ${count}-question quiz`, async ({ page, mockGenerate }) => {
    const quiz = buildQuizWithQuestionCount(count)
    await mockSongStatus(page, true, { maxSeconds: 120 })
    await reachResultView(page, mockGenerate, quiz)
    await page.getByRole('button', { name: 'Turn into a song' }).click()
    await expect(page.getByRole('dialog', { name: 'Turn into a song' }).getByText(`About ${seconds} seconds`)).toBeVisible()
  })
}

test('the length note is clamped to the provider\'s max length even for a long quiz', async ({ page, mockGenerate }) => {
  const quiz = buildQuizWithQuestionCount(20) // natural target would be 120s
  await mockSongStatus(page, true, { maxSeconds: 30 }) // e.g. the Gemini clip model
  await reachResultView(page, mockGenerate, quiz)
  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await expect(page.getByRole('dialog', { name: 'Turn into a song' }).getByText('About 30 seconds')).toBeVisible()
})

test('a partial-coverage note appears when the provider trimmed the facts', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await mockSongLyrics(page, { ...SAMPLE_LYRICS, includedFactsCount: 4, totalFactsCount: 6 })
  await reachResultView(page, mockGenerate)

  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()
  await expect(page.getByText('4 of 6 facts are in this song.')).toBeVisible()
})

test('a fact-check warning highlights the flagged lines; re-checking after an edit updates it', async ({ page, mockGenerate }) => {
  const lyrics = '[Verse]\nPlants absorb oxygen from the air\n[Chorus]\nOxygen in, carbon dioxide out'
  await mockSongStatus(page, true)
  await mockSongLyrics(page, { ...SAMPLE_LYRICS, lyrics, factCheckPassed: false, flaggedLines: [1] })
  await mockSongCreate(page, SAMPLE_SONG)
  await reachResultView(page, mockGenerate)

  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()

  await expect(page.getByText('Please check these lines:')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Plants absorb oxygen from the air' })).toBeVisible()

  // Edit the flagged line, then re-check (mocked to now pass) on "Make the song".
  await page.getByLabel('Lyrics').fill('[Verse]\nPlants absorb carbon dioxide from the air\n[Chorus]\nOxygen in, carbon dioxide out')
  await mockSongLyrics(page, SAMPLE_LYRICS, { checkResponse: { factCheckPassed: true, flaggedLines: [] } })
  await page.getByRole('button', { name: 'Make the song' }).click()

  await expect(page.getByText('Please check these lines:')).toHaveCount(0)
})

test('writing lyrics shows an editable textarea; going over the limit disables Make the song', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await mockSongLyrics(page, SAMPLE_LYRICS)
  await reachResultView(page, mockGenerate)

  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()

  const textarea = page.getByLabel('Lyrics')
  await expect(textarea).toHaveValue(SAMPLE_LYRICS.lyrics)
  const makeSong = page.getByRole('button', { name: 'Make the song' })
  await expect(makeSong).toBeEnabled()

  await textarea.fill('a'.repeat(701))
  await expect(page.getByText('701/700 characters')).toBeVisible()
  await expect(makeSong).toBeDisabled()

  await textarea.fill('short lyrics')
  await expect(makeSong).toBeEnabled()
})

test('making a song shows a loading state with Cancel; cancelling returns to the lyrics step with no error', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await mockSongLyrics(page, SAMPLE_LYRICS)
  await mockSongCreate(page, SAMPLE_SONG, { delayMs: 60_000 })
  await reachResultView(page, mockGenerate)

  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()
  await page.getByRole('button', { name: 'Make the song' }).click()

  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByRole('button', { name: 'Make the song' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a lyrics-generation failure shows a localized error with retry', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await mockSongLyrics(page, { error: 'upstream' }, { status: 502 })
  await reachResultView(page, mockGenerate)

  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()

  await expect(page.getByText('Something went wrong creating your song. Please try again.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('a song-creation failure shows a localized error with retry', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await mockSongLyrics(page, SAMPLE_LYRICS)
  await mockSongCreate(page, { error: 'blocked' }, { status: 422 })
  await reachResultView(page, mockGenerate)

  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()
  await page.getByRole('button', { name: 'Make the song' }).click()

  await expect(page.getByText("Quelio couldn't create music from this request. Please adjust the lyrics or style and try again.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('full success flow: player controls, download, IndexedDB save, reload, and the Archive row icon', { tag: '@cross' }, async ({ browserName, page, mockGenerate }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit on Windows cannot play audio or store Blobs in IndexedDB')
  await mockSongStatus(page, true)
  await mockSongLyrics(page, SAMPLE_LYRICS)
  await mockSongCreate(page, SAMPLE_SONG)
  await reachResultView(page, mockGenerate)

  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()
  await page.getByRole('button', { name: 'Make the song' }).click()

  await expect(page.getByText('Demo sound')).toBeVisible()
  const play = page.getByRole('button', { name: 'Play' })
  await expect(play).toBeVisible()
  await play.click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()

  const seek = page.getByRole('slider', { name: 'Seek' })
  await expect(seek).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download' })).toHaveAttribute('download', /\.wav$/)
  await expect(page.getByText(SAMPLE_LYRICS.lyrics)).toBeVisible()
  await expect(page.getByText('This song was made with AI.')).toBeVisible()

  // Close the panel (it overlays the page) before following the archive link — the song was
  // already saved to IndexedDB keyed by this quiz's id.
  await page.getByRole('dialog', { name: 'Turn into a song' }).getByRole('button', { name: 'Close' }).click()
  await page.getByRole('link', { name: 'View in Archive' }).click()
  await expect(page.getByRole('heading', { name: 'Listen' })).toBeVisible()
  await expect(page.getByText(SAMPLE_LYRICS.lyrics)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Listen' })).toBeVisible()

  await page.goto('/archive?lng=en')
  const row = page.getByRole('link', { name: new RegExp(SAMPLE_QUIZ.title) }).first()
  await expect(row).toBeVisible()
  await expect(row.locator('svg[role="img"]')).toBeVisible()
})

test('the cost guard blocks a 4th song generation for the same quiz on the same day', async ({ page, seedArchive }) => {
  const quizId = 'song-guard-quiz'
  await mockSongStatus(page, true)
  await mockSongLyrics(page, SAMPLE_LYRICS)
  const created: unknown[] = []
  await page.route('**/api/song', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    created.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_SONG) })
  })

  await seedArchive([
    {
      id: quizId,
      title: SAMPLE_QUIZ.title,
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'text',
      questionType: 'mixed',
      difficulty: 'medium',
      questionCount: '6',
      optionsCount: null,
      outputLanguage: 'auto',
      sourceText: 'Seeded source text.',
      quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
    },
  ])
  await page.addInitScript(
    ([id, today]) => {
      window.localStorage.setItem('quelio.songGuard.v1', JSON.stringify({ [id]: { date: today, count: 3 } }))
    },
    [quizId, new Date().toISOString().slice(0, 10)] as const,
  )

  await page.goto(`/archive/${quizId}?lng=en`)
  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()
  await page.getByRole('button', { name: 'Make the song' }).click()

  await expect(page.getByText("You've reached today's limit of 3 songs for this quiz. Please try again tomorrow.")).toBeVisible()
  expect(created).toEqual([])
})

test('the daily total-seconds guard blocks generation once the day\'s song-seconds budget is used up', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await mockSongLyrics(page, SAMPLE_LYRICS) // targetSeconds: 30
  const created: unknown[] = []
  await page.route('**/api/song', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    created.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_SONG) })
  })

  await page.addInitScript(
    ([today]) => {
      window.localStorage.setItem('quelio.songSecondsGuard.v1', JSON.stringify({ date: today, totalSeconds: 290 }))
    },
    [new Date().toISOString().slice(0, 10)] as const,
  )

  await reachResultView(page, mockGenerate)
  await page.getByRole('button', { name: 'Turn into a song' }).click()
  await page.getByRole('button', { name: 'Write lyrics' }).click()
  await page.getByRole('button', { name: 'Make the song' }).click()

  await expect(page.getByText("You've reached today's limit of 300 seconds of songs. Please try again tomorrow.")).toBeVisible()
  expect(created).toEqual([])
})

test('keyboard-only flow: Enter opens the panel, Tab stays trapped, Escape closes and restores focus', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await reachResultView(page, mockGenerate)

  const button = page.getByRole('button', { name: 'Turn into a song' })
  await button.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: 'Turn into a song' })
  await expect(dialog).toBeVisible()

  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab')
    const withinDialog = await page.evaluate(() => {
      const dialogEl = document.querySelector('[role="dialog"]')
      return Boolean(dialogEl && document.activeElement && dialogEl.contains(document.activeElement))
    })
    expect(withinDialog).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(button).toBeFocused()
})

test('@mobile the song panel renders as a usable bottom sheet at 390px', async ({ page, mockGenerate }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile-only: exercises the 390px bottom-sheet layout')
  await mockSongStatus(page, true)
  await reachResultView(page, mockGenerate)

  await page.getByRole('button', { name: 'Turn into a song' }).click()
  const dialog = page.getByRole('dialog', { name: 'Turn into a song' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Pop' })).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Funny' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

const SONG_LOCALES = [
  { lng: 'en', generate: 'Generate Quiz', entry: 'Turn into a song', funny: 'Funny' },
  { lng: 'tr', generate: 'Quiz Oluştur', entry: 'Şarkıya çevir', funny: 'Komik' },
  { lng: 'hyw', generate: 'Ստեղծել քուիզ', entry: 'Երգի վերածել', funny: 'Զուարճալի' },
]

for (const { lng, generate, entry, funny } of SONG_LOCALES) {
  test(`the song feature is localized in ${lng}`, async ({ page, mockGenerate }) => {
    await mockSongStatus(page, true)
    await mockGenerate(SAMPLE_QUIZ)

    await page.goto(`/?lng=${lng}`)
    await fillText(page, SHORT_TEXT)
    await page.getByRole('button', { name: generate }).click()
    await page.getByRole('button', { name: entry }).click()
    await expect(page.getByRole('dialog').getByRole('radio', { name: funny })).toBeVisible()
  })
}
