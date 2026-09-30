import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { fillText, SHORT_TEXT } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'
import { TINY_WAV_BASE64 } from '../fixtures/tinyWav'

const SAMPLE_LYRICS = {
  title: 'Photosynthesis Jam',
  lyrics: '[Verse]\nPlants take in carbon dioxide each day\n[Chorus]\nCarbon dioxide in, oxygen out, hooray',
  musicPrompt: 'Upbeat pop, 110 bpm, bright synths, clear vocal, English lyrics.',
}

const SAMPLE_SONG = {
  audio: TINY_WAV_BASE64,
  mimeType: 'audio/wav',
  lyrics: SAMPLE_LYRICS.lyrics,
  provider: 'demo' as const,
  demo: true,
  durationSeconds: 10,
}

async function mockSongStatus(page: Page, enabled: boolean, provider: 'demo' | 'gemini' = 'demo') {
  await page.route('**/api/song', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled, provider }) })
  })
}

async function mockSongLyrics(page: Page, response: unknown, options: { status?: number } = {}) {
  await page.route('**/api/song-lyrics', async (route) => {
    await route.fulfill({ status: options.status ?? 200, contentType: 'application/json', body: JSON.stringify(response) })
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

async function reachResultView(page: Page, mockGenerate: (response: unknown) => Promise<unknown>) {
  await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
}

test('entry button is hidden when the feature is disabled', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, false)
  await reachResultView(page, mockGenerate)
  await expect(page.getByRole('button', { name: 'Turn into a song' })).toHaveCount(0)
})

test('entry button appears when enabled and opens the panel with style chips', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await reachResultView(page, mockGenerate)

  const button = page.getByRole('button', { name: 'Turn into a song' })
  await expect(button).toBeVisible()
  await button.click()

  const dialog = page.getByRole('dialog', { name: 'Turn into a song' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('30-second song')).toBeVisible()

  const pop = dialog.getByRole('radio', { name: 'Pop' })
  const rock = dialog.getByRole('radio', { name: 'Rock' })
  await expect(pop).toHaveAttribute('aria-checked', 'true')
  await rock.click()
  await expect(rock).toHaveAttribute('aria-checked', 'true')
  await expect(pop).toHaveAttribute('aria-checked', 'false')
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

test('full success flow: player controls, download, IndexedDB save, reload, and the Archive row icon', async ({ page, mockGenerate }) => {
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
  const row = page.getByRole('link', { name: new RegExp(SAMPLE_QUIZ.title) })
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
      studyMode: false,
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('the song feature is localized in English, Turkish and Western Armenian', async ({ page, mockGenerate }) => {
  await mockSongStatus(page, true)
  await mockGenerate(SAMPLE_QUIZ)

  await page.goto('/?lng=tr')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Quiz Oluştur' }).click()
  await expect(page.getByRole('button', { name: 'Şarkıya çevir' })).toBeVisible()

  await page.goto('/?lng=hyw')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Ստեղծել քուիզ' }).click()
  await expect(page.getByRole('button', { name: 'Երգի վերածել' })).toBeVisible()
})
