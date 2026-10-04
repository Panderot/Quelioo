import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import { tinyMp3, tinyMp3Base64 } from '../fixtures/tinyMp3'
import { segmentKey, voiceFor } from '../../src/lib/lessonAudio'
import { mp3DurationSeconds } from '../../src/lib/mp3'

// Audio Lesson part 2: voice step, recording (mocked /api/lesson "speak" with synthetic MP3s),
// player, transcript and download. Lessons and recorded segments are seeded into IndexedDB.

const LINE_SECONDS = 2

interface Line {
  id: string
  speaker: string
  text: string
  pause?: boolean
}

function makeSections(): { id: string; role: string; title: string; keyPointIds: string[]; lines: Line[] }[] {
  let n = 0
  const line = (speaker: string, text: string, pause = false): Line => ({ id: `p1-L${++n}`, speaker, text, ...(pause ? { pause: true } : {}) })
  return [
    { id: 'p1-S1', role: 'opening', title: 'Why is a leaf green?', keyPointIds: [], lines: [line('hostA', 'Why is a leaf green and not red?'), line('hostB', 'Good question.')] },
    {
      id: 'p1-S2',
      role: 'teach',
      title: 'Chlorophyll',
      keyPointIds: ['K1'],
      lines: [line('hostA', 'Chlorophyll absorbs red and blue light.'), line('hostB', 'So green bounces back?'), line('hostA', 'Exactly, green is reflected.'), line('hostA', 'Which colours does it absorb?'), line('hostB', 'Think about it...', true), line('hostA', 'Red and blue.')],
    },
    { id: 'p1-S3', role: 'teach', title: 'Two stages', keyPointIds: ['K2'], lines: [line('hostA', 'Light reactions happen in the thylakoids.'), line('hostB', 'And the Calvin cycle in the stroma.'), line('hostA', 'DNA is not involved here.')] },
    { id: 'p1-S4', role: 'selfcheck', title: 'Self-check', keyPointIds: ['K1', 'K2'], lines: [line('hostA', 'Where does the Calvin cycle happen?'), line('hostB', 'Pause and think...', true), line('hostA', 'In the stroma.')] },
    { id: 'p1-S5', role: 'tip', title: 'Tip', keyPointIds: [], lines: [line('hostA', 'Review this tomorrow with flashcards.')] },
  ]
}

const SECTIONS = makeSections()
const LINES = SECTIONS.flatMap((section) => section.lines)
const VOICES = { hostA: 'marin', hostB: 'cedar' }

function lessonRecord(options: { approved?: boolean; title?: string } = {}) {
  return {
    id: 'lesson-1',
    schemaVersion: 1,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    title: options.title ?? 'Light and sugar',
    sourceKind: 'text',
    sourceLabel: '',
    sourceText: 'Photosynthesis text.',
    sourceHash: 'h',
    options: { style: 'two_hosts', level: 'general', tone: 'normal', language: 'en' },
    keyPoints: [
      { id: 'K1', text: 'Chlorophyll absorbs red and blue light.', source: 's', topic: 't' },
      { id: 'K2', text: 'Two stages.', source: 's', topic: 't' },
    ],
    episodes: [
      {
        part: 1,
        keyPointIds: ['K1', 'K2'],
        script: { part: 1, title: 'Light lesson', sections: SECTIONS, check: { ran: true, passed: true, missingKeyPointIds: [], rewrittenLineIds: [] }, wordCount: 120, estimatedSeconds: 60 },
        costUsd: 0.04,
        cachedShare: 0.2,
        ...(options.approved ? { approved: true, voices: VOICES } : {}),
      },
    ],
    planCostUsd: 0.001,
  }
}

/** Seeds the lesson (and optionally recorded segments for the given line ids) into IndexedDB. */
async function seed(page: Page, lesson: unknown, recordedIds: string[] = []) {
  const segments = recordedIds.map((id) => {
    const line = LINES.find((entry) => entry.id === id)!
    return { key: segmentKey(line, voiceFor(line.speaker, VOICES), 'en'), audio: tinyMp3Base64(LINE_SECONDS) }
  })
  // Not /lessons: its orphan-audio cleanup would race with seeding segments for a lesson it hasn't seen yet.
  await page.goto('/archive')
  await page.evaluate(
    async ({ lesson, segments }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('quelio-lessons', 2)
        request.onupgradeneeded = () => {
          for (const [name, keyPath] of [['lessons', 'id'], ['plans', 'key'], ['segments', 'key']] as const) {
            if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath })
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise<void>((resolve) => {
        const tx = db.transaction(['lessons', 'segments'], 'readwrite')
        tx.objectStore('lessons').put(lesson)
        for (const segment of segments) {
          const bytes = Uint8Array.from(atob(segment.audio), (char) => char.charCodeAt(0))
          tx.objectStore('segments').put({ key: segment.key, bytes: bytes.buffer, durationSeconds: 2, createdAt: new Date().toISOString() })
        }
        tx.oncomplete = () => resolve()
      })
      db.close()
    },
    { lesson, segments },
  )
}

interface SpeakMock {
  requests: () => { lines: { id: string; text: string }[]; voices: Record<string, string> }[]
  release: () => void
}

/** Mocks /api/lesson. `speak` answers with one synthetic MP3 per line unless `behavior` says otherwise. */
async function mockLessonApi(
  page: Page,
  behavior: { failOnce?: string[]; holdAfter?: number; error?: string; check?: boolean } = {},
): Promise<SpeakMock> {
  const requests: { lines: { id: string; text: string }[]; voices: Record<string, string> }[] = []
  const failed = new Set<string>()
  let releaseHeld: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    releaseHeld = resolve
  })
  await page.route('**/api/lesson', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requiresAccessCode: false, monthlyBudgetUsd: null }) })
      return
    }
    const body = request.postDataJSON() as { action: string; lines: { id: string; text: string }[]; voices: Record<string, string>; sections?: unknown }
    if (body.action === 'check') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sections: body.sections, check: { ran: true, passed: true, missingKeyPointIds: [], rewrittenLineIds: [] }, usage: { costUsd: 0.001, cachedShare: 0, calls: 1 } }) })
      return
    }
    requests.push({ lines: body.lines, voices: body.voices })
    if (behavior.error) {
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: behavior.error }) })
      return
    }
    if (behavior.holdAfter !== undefined && requests.length > behavior.holdAfter) {
      await held
      await route.abort().catch(() => {})
      return
    }
    const segments = []
    const failedNow: string[] = []
    for (const line of body.lines) {
      if (behavior.failOnce?.includes(line.id) && !failed.has(line.id)) {
        failed.add(line.id)
        failedNow.push(line.id)
        continue
      }
      segments.push({ id: line.id, audio: tinyMp3Base64(LINE_SECONDS), durationSeconds: LINE_SECONDS })
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ segments, failed: failedNow, unknownAbbreviations: [], usage: { costUsd: 0.001 * segments.length, seconds: segments.length * LINE_SECONDS, chars: 100 } }),
    })
  })
  return { requests: () => requests, release: () => releaseHeld() }
}

/** Exact lengths: MP3 frames are 24 ms, so a "2 s" clip is 83 frames and a 2.5 s pause 104 frames. */
const LINE_EXACT = mp3DurationSeconds(tinyMp3(LINE_SECONDS))
const PAUSE_EXACT = (125 * 576) / 24000
const TOTAL_SECONDS = LINES.length * LINE_EXACT + 2 * PAUSE_EXACT // two pause lines

test.describe('Audio Lesson — voices and recording', () => {
  test('approve, voice step with static previews (no API call), batches with progress, then the player @cross', async ({ page }) => {
    const mock = await mockLessonApi(page)
    await seed(page, lessonRecord())
    await page.goto('/lessons/lesson-1')
    await expect(page.locator('[data-purpose="lesson-voices"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Approve the script and choose voices' }).click()

    const voices = page.locator('[data-purpose="lesson-voices"]')
    await expect(voices.getByRole('button', { name: 'Host A' })).toContainText('Marin')
    await expect(voices.getByRole('button', { name: 'Host B' })).toContainText('Cedar')
    await expect(page.locator('[data-purpose="audio-estimate"]')).toContainText(`${LINES.length} lines will be recorded.`)

    await voices.getByRole('button', { name: 'Listen to Cedar' }).click()
    const previewSrc = await voices.locator('audio').evaluate((audio: HTMLAudioElement) => audio.src)
    expect(previewSrc).toMatch(/\/voices\/gpt-4o-mini-tts\/cedar-en\.mp3$/)
    expect((await page.request.get(previewSrc)).status()).toBe(200)
    await voices.getByRole('button', { name: 'Host B' }).click()
    await page.getByRole('option', { name: 'Shimmer' }).click()
    await expect(voices.getByRole('button', { name: 'Host B' })).toContainText('Shimmer')
    expect(mock.requests()).toHaveLength(0)

    await voices.getByRole('button', { name: 'Record audio' }).click()
    await expect(page.locator('[data-purpose="lesson-player"]')).toBeVisible()
    const requests = mock.requests()
    expect(requests.length).toBe(Math.ceil(LINES.length / 6))
    expect(requests.every((request) => request.lines.length <= 6)).toBe(true)
    expect(requests.flatMap((request) => request.lines.map((line) => line.id)).sort()).toEqual(LINES.map((line) => line.id).sort())
    expect(requests[0].voices).toEqual({ hostA: 'marin', hostB: 'shimmer' })
    await expect(page.locator('[data-purpose="player-time"]')).toHaveText(`0:00 / 0:${String(Math.round(TOTAL_SECONDS)).padStart(2, '0')}`)
    // Once the audio exists every duration shown is the file's real length (the same as the player's), never an estimate.
    const real = `0:${String(Math.round(TOTAL_SECONDS)).padStart(2, '0')}`
    await expect(page.locator('[data-purpose="lesson-duration"]')).toContainText(`${real} ·`)
    await expect(page.locator('[data-purpose="lesson-duration"]')).not.toContainText('About')
    await page.getByRole('link', { name: 'Back to lessons' }).click()
    await expect(page.locator('[data-purpose="lesson-row"]')).toContainText('Audio ready')
    await expect(page.locator('[data-purpose="lesson-row"]')).toContainText(real)
    await expect(page.locator('[data-purpose="lesson-row"]')).not.toContainText('about')
  })

  test('progress, cancel, resume after reload without recording a line twice', async ({ page }) => {
    const mock = await mockLessonApi(page, { holdAfter: 1 })
    await seed(page, lessonRecord({ approved: true }))
    await page.goto('/lessons/lesson-1')
    await page.getByRole('button', { name: 'Record audio' }).click()
    await expect(page.locator('[data-purpose="recording-progress"]')).toHaveText(`Recording 6 / ${LINES.length} lines`)
    await page.getByRole('button', { name: 'Cancel' }).click()
    mock.release()
    await expect(page.getByText(`6 of ${LINES.length} lines are recorded and saved.`)).toBeVisible()

    await page.unroute('**/api/lesson')
    const resumed = await mockLessonApi(page)
    await page.reload()
    await expect(page.getByText(`6 of ${LINES.length} lines are recorded and saved.`)).toBeVisible()
    await page.getByRole('button', { name: `Update audio (${LINES.length - 6} lines)` }).click()
    await expect(page.locator('[data-purpose="lesson-player"]')).toBeVisible()
    const first = mock.requests()[0].lines.map((line) => line.id)
    const later = resumed.requests().flatMap((request) => request.lines.map((line) => line.id))
    expect(later.some((id) => first.includes(id))).toBe(false)
    expect(later.length).toBe(LINES.length - 6)
  })

  test('a failed line: localized error, Try again records only that line', async ({ page }) => {
    const mock = await mockLessonApi(page, { failOnce: ['p1-L3'] })
    await seed(page, lessonRecord({ approved: true }))
    await page.goto('/lessons/lesson-1')
    await page.getByRole('button', { name: 'Record audio' }).click()
    await expect(page.getByRole('alert')).toContainText("1 line couldn't be recorded.")
    await page.getByRole('alert').getByRole('button', { name: 'Try again' }).click()
    await expect(page.locator('[data-purpose="lesson-player"]')).toBeVisible()
    expect(mock.requests().at(-1)!.lines.map((line) => line.id)).toEqual(['p1-L3'])
  })

  test('daily cap reached: clear message, no retry button', async ({ page }) => {
    await mockLessonApi(page, { error: 'daily_cap' })
    await seed(page, lessonRecord({ approved: true }))
    await page.goto('/lessons/lesson-1')
    await page.getByRole('button', { name: 'Record audio' }).click()
    await expect(page.getByRole('alert')).toContainText("You've reached today's limit for recorded lessons")
    await expect(page.getByRole('alert').getByRole('button')).toHaveCount(0)
  })
})

test.describe('Audio Lesson — player', () => {
  async function openRecorded(page: Page) {
    await mockLessonApi(page)
    await seed(page, lessonRecord({ approved: true }), LINES.map((line) => line.id))
    await page.goto('/lessons/lesson-1')
    await expect(page.locator('[data-purpose="lesson-player"]')).toBeVisible()
  }

  const currentTime = (page: Page) => page.locator('[data-purpose="lesson-player"] audio').evaluate((audio: HTMLAudioElement) => audio.currentTime)

  test('one seek bar across segments, transcript sync and click-to-jump, speed, shortcuts, show answer, media session', async ({ page }) => {
    await openRecorded(page)
    const lines = page.locator('[data-purpose="transcript-line"]')
    await expect(lines).toHaveCount(LINES.length)
    await expect(page.locator('[data-purpose="lesson-transcript"]')).toContainText('Chlorophyll')

    // Click a line: jumps to its start (line 4 starts after 3 x 2 s).
    await lines.nth(3).getByRole('button').first().click()
    expect(await currentTime(page)).toBeCloseTo(3 * LINE_EXACT + 0.05, 1)
    await expect(lines.nth(3)).toHaveAttribute('data-active', 'true')
    // The line after the first pause starts 2.5 s later than the line count says.
    await lines.nth(8).getByRole('button').first().click()
    expect(await currentTime(page)).toBeCloseTo(8 * LINE_EXACT + PAUSE_EXACT + 0.05, 1)

    // The seek bar spans the whole lesson.
    const seek = page.getByRole('slider', { name: 'Lesson position' })
    expect(Number(await seek.getAttribute('max'))).toBeCloseTo(TOTAL_SECONDS, 2)
    await seek.fill('1')
    await expect(lines.first()).toHaveAttribute('data-active', 'true')

    // Keyboard: arrows skip 10 s, Space plays and pauses.
    await page.locator('h1').click()
    await page.keyboard.press('ArrowRight')
    expect(await currentTime(page)).toBeCloseTo(11, 0)
    await page.keyboard.press('ArrowLeft')
    expect(await currentTime(page)).toBeCloseTo(1, 0)
    await page.keyboard.press(' ')
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await page.keyboard.press(' ')
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()

    // Speed.
    await page.getByRole('radio', { name: '1.5×' }).click()
    expect(await page.locator('[data-purpose="lesson-player"] audio').evaluate((audio: HTMLAudioElement) => audio.playbackRate)).toBe(1.5)

    // Self-check answer hidden until "Show answer".
    const answer = lines.filter({ hasText: 'Think first, then show the answer.' })
    await expect(answer).toHaveCount(1)
    await expect(page.locator('[data-purpose="lesson-transcript"]')).not.toContainText('In the stroma.')
    await answer.getByRole('button', { name: 'Show answer' }).click()
    await expect(page.locator('[data-purpose="lesson-transcript"]')).toContainText('In the stroma.')

    // Media Session metadata for the lock screen.
    expect(await page.evaluate(() => navigator.mediaSession?.metadata?.title)).toBe('Light and sugar')
  })

  test('only one audio plays at a time across the app', async ({ page }) => {
    await openRecorded(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    // Any other audio on the page (a song player uses the same rule) pauses the lesson.
    await page.evaluate((base64) => {
      const audio = document.createElement('audio')
      audio.src = `data:audio/mpeg;base64,${base64}`
      document.body.appendChild(audio)
      void audio.play()
    }, tinyMp3Base64(3))
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  })

  test('download: one playable MP3 of the whole lesson and the transcript @cross', async ({ page }) => {
    await openRecorded(page)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download MP3' }).click()])
    expect(download.suggestedFilename()).toBe('light-and-sugar-lesson.mp3')
    const bytes = new Uint8Array(await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks)))
    expect(mp3DurationSeconds(bytes)).toBeCloseTo(TOTAL_SECONDS, 2)
    // The joined file plays in this browser and reports the full length. Playwright's Windows WebKit
    // build can't decode ANY MP3 (not even an untouched single segment), so there the file is only
    // checked structurally above.
    const decode = (base64: string) =>
      page.evaluate(async (data) => {
        const audio = document.createElement('audio')
        audio.preload = 'auto'
        audio.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))], { type: 'audio/mpeg' }))
        audio.load()
        return new Promise<number | null>((resolve) => {
          audio.onloadedmetadata = () => resolve(audio.duration)
          audio.onerror = () => resolve(null)
        })
      }, base64)
    if ((await decode(tinyMp3Base64(1))) === null) {
      test.info().annotations.push({ type: 'note', description: 'this browser build cannot decode MP3 at all; structure checked only' })
    } else {
      const duration = await decode(Buffer.from(bytes).toString('base64'))
      expect(duration).not.toBeNull()
      expect(duration!).toBeGreaterThan(TOTAL_SECONDS - 0.5)
      expect(duration!).toBeLessThan(TOTAL_SECONDS + 0.5)
    }

    const [transcript] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download transcript' }).click()])
    expect(transcript.suggestedFilename()).toBe('light-and-sugar-lesson.txt')
    const text = Buffer.concat(await (await transcript.createReadStream()).toArray()).toString('utf8')
    expect(text).toContain('## Chlorophyll')
    expect(text).toContain('Host B: So green bounces back?')
  })

  test('edit after recording: only the changed line is recorded again', async ({ page }) => {
    const mock = await mockLessonApi(page)
    await seed(page, lessonRecord({ approved: true }), LINES.map((line) => line.id))
    await page.goto('/lessons/lesson-1')
    await expect(page.locator('[data-purpose="lesson-player"]')).toBeVisible()
    await page.getByRole('button', { name: 'Edit the script' }).click()
    await page.locator('[data-purpose="script-line"]').filter({ hasText: 'Good question.' }).getByRole('button', { name: 'Edit line' }).click()
    await page.getByRole('textbox', { name: 'Line text' }).fill('A very good question.')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('[data-purpose="lesson-player"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Update audio (1 line)' }).click()
    await expect(page.locator('[data-purpose="lesson-player"]')).toBeVisible()
    expect(mock.requests().flatMap((request) => request.lines.map((line) => line.text))).toEqual(['A very good question.'])
  })
})

test.describe('Audio Lesson — audio languages and layout', () => {
  for (const lang of [
    { code: 'tr' as const, approve: 'Metni onayla ve sesleri seç', record: 'Sesi kaydet', play: 'Oynat', download: 'MP3 indir' },
    { code: 'hyw' as const, approve: 'Հաստատել տեքստը եւ ընտրել ձայները', record: 'Ձայնագրել', play: 'Նուագել', download: 'Բեռնել MP3' },
  ]) {
    test(`localized voice step and player (${lang.code})`, async ({ page, seedLanguage }) => {
      await seedLanguage(lang.code)
      await mockLessonApi(page)
      await seed(page, lessonRecord())
      await page.goto('/lessons/lesson-1')
      await page.getByRole('button', { name: lang.approve }).click()
      await page.getByRole('button', { name: lang.record }).click()
      await expect(page.getByRole('button', { name: lang.play, exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: lang.download })).toBeVisible()
      await expect(page.locator('main')).not.toContainText('lessons.')
    })
  }

  test('player and transcript fit a 390px screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockLessonApi(page)
    await seed(page, lessonRecord({ approved: true }), LINES.map((line) => line.id))
    await page.goto('/lessons/lesson-1')
    await expect(page.locator('[data-purpose="lesson-player"]')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test('synthetic MP3 fixture has the expected length', () => {
  expect(mp3DurationSeconds(tinyMp3(2))).toBeCloseTo(2, 1)
})
