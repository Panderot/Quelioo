import { expect, test } from '@playwright/test'

import { handleSongLyricsRequest } from '../../api/_lib/song-lyrics'
import { buildSongCoverage } from '../../src/lib/songFacts'
import { findFillerLines, isLyricsTooShort } from '../../src/lib/songLyricsQuality'
import {
  lyricsLimitsForTargetSeconds,
  MAX_FACTS_PER_SONG,
  songPriceUsd,
  splitFactsIntoSongs,
  targetSecondsForFactCount,
} from '../../src/lib/song'
import { canonicalSectionTags, isSectionTagLine, localizeSectionTags } from '../../src/lib/songTags'

// Song lyrics quality (no browser): section-tag localization and mapping back, filler-line detection,
// per-length limits and the series split, plus the server's write -> review -> one rewrite path with
// OpenAI stubbed at the fetch level (answers by call kind), including timeout safety.

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = globalThis.fetch
const ORIGINAL_NOW = Date.now

test.afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in ORIGINAL_ENV)) delete process.env[key]
  Object.assign(process.env, ORIGINAL_ENV)
  globalThis.fetch = ORIGINAL_FETCH
  Date.now = ORIGINAL_NOW
})

test.describe('section tags', () => {
  const english = '[Intro]\nA\n[Verse 1]\nB\n[Chorus]\nC\n[Bridge]\nD\n[Outro]\nE'

  test('English tags are shown in Turkish and map back exactly', () => {
    const shown = localizeSectionTags(english, 'tr')
    expect(shown).toBe('[Giriş]\nA\n[Kıta 1]\nB\n[Nakarat]\nC\n[Köprü]\nD\n[Bitiş]\nE')
    expect(canonicalSectionTags(shown)).toBe(english)
  })

  test('English stays English and Western Armenian tags round-trip', () => {
    expect(localizeSectionTags(english, 'en')).toBe(english)
    const hyw = localizeSectionTags(english, 'hyw')
    expect(hyw).toContain('[Կրկներգ]')
    expect(canonicalSectionTags(hyw)).toBe(english)
  })

  test('only whole tag lines change, lyric text with brackets or the same words is untouched', () => {
    const text = '[Chorus]\nNakarat sözü [Chorus] içinde geçer\n[Kıta]\nKöprü'
    expect(canonicalSectionTags(text)).toBe('[Chorus]\nNakarat sözü [Chorus] içinde geçer\n[Verse]\nKöprü')
    expect(isSectionTagLine('[Nakarat]')).toBe(true)
    expect(isSectionTagLine('Nakarat')).toBe(false)
  })

  test('tags edited by the student in the localized form still map back', () => {
    const edited = '[nakarat]\nYeni satır\n[Kıta 2]\nBaşka satır'
    expect(canonicalSectionTags(edited)).toBe('[Chorus]\nYeni satır\n[Verse 2]\nBaşka satır')
  })
})

test.describe('filler lines and length', () => {
  test('flags rhythm-only lines but not lines that carry a fact', () => {
    const lyrics = ['[Chorus]', 'Kloroplast sahnede, görev tamam', 'Klorofil ışığı soğurur', 'Hadi bakalım', 'Işık olmadan görev tamam olmaz çünkü glikoz üretilemez'].join('\n')
    expect(findFillerLines(lyrics)).toEqual([1, 3])
  })

  test('each length has a measured line and character budget, a 30 s clip is small', () => {
    expect(lyricsLimitsForTargetSeconds(30)).toEqual({ maxLines: 8, maxChars: 260 })
    expect(lyricsLimitsForTargetSeconds(120).maxChars).toBeGreaterThan(lyricsLimitsForTargetSeconds(60).maxChars)
  })

  test('the length follows the number of facts', () => {
    expect([1, 4, 5, 9, 10, 13, 14, 18].map(targetSecondsForFactCount)).toEqual([30, 30, 60, 60, 90, 90, 120, 120])
  })

  test('a song well under the budget counts as too short', () => {
    expect(isLyricsTooShort('x'.repeat(100), 260)).toBe(true)
    expect(isLyricsTooShort('x'.repeat(220), 260)).toBe(false)
  })

  test('facts that do not fit one song are split evenly into a series, nothing is dropped', () => {
    expect(splitFactsIntoSongs(10)).toEqual([10])
    expect(splitFactsIntoSongs(MAX_FACTS_PER_SONG)).toEqual([MAX_FACTS_PER_SONG])
    expect(splitFactsIntoSongs(20)).toEqual([10, 10])
    expect(splitFactsIntoSongs(40)).toEqual([14, 13, 13])
    expect(splitFactsIntoSongs(40).reduce((a, b) => a + b, 0)).toBe(40)
    expect(songPriceUsd(30)).toBe(0.04)
    expect(songPriceUsd(90)).toBe(0.08)
  })

  test('coverage lists each question with the line that teaches it', () => {
    const items = buildSongCoverage(['Q1? — A1', 'Q2? — A2'], [2, -1], '[Chorus]\nx\nBirinci cevap burada')
    expect(items).toEqual([
      { question: 'Q1?', line: 'Birinci cevap burada' },
      { question: 'Q2?', line: null },
    ])
    expect(buildSongCoverage(['Q1? — A1'], null, 'x')).toBeUndefined()
  })
})

interface StubCall {
  kind: 'write' | 'review' | 'rewrite'
  model: string
  text: string
}

function kindOf(text: string): StubCall['kind'] {
  if (text.includes('strict reviewer of an educational song')) return 'review'
  if (text.includes('You are improving an educational song')) return 'rewrite'
  return 'write'
}

function stubOpenAi(reply: (call: StubCall, index: number) => unknown): StubCall[] {
  const calls: StubCall[] = []
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.LLM_PROVIDER_ORDER = 'openai'
  process.env.MUSIC_ENABLED = 'true'
  process.env.MUSIC_PROVIDER = 'gemini'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.VERCEL_ENV
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as Record<string, unknown>
    const text = JSON.stringify(body)
    const call: StubCall = { kind: kindOf(text), model: body.model as string, text }
    calls.push(call)
    const answer = reply(call, calls.length - 1)
    if (typeof answer === 'number') return new Response('{}', { status: answer })
    return new Response(JSON.stringify({ output_text: JSON.stringify(answer), usage: { input_tokens: 1000, output_tokens: 300 } }), { status: 200 })
  }) as typeof fetch
  return calls
}

const FACTS = ['Fotosentez nerede olur? — Kloroplastta', 'Işığı ne soğurur? — Klorofil', 'Sonunda ne oluşur? — Glikoz ve oksijen']
const REQUEST = { keyFacts: FACTS, quizTitle: 'Fotosentez', sourceExcerpt: 'Fotosentez kloroplastta olur.', style: 'pop', tone: 'normal', language: 'tr' }

// 8 lines, 3 facts, ~230 chars: a good song for the 30 s band (limit 8 lines / 260 chars).
const GOOD = [
  '[Verse 1]',
  'Fotosentez kloroplastta gerçekleşir',
  'Klorofil ışık enerjisini soğurur',
  'Işıkla birlikte su ve karbondioksit kullanılır',
  '[Chorus]',
  'Sonunda glikoz ve oksijen oluşur',
  'Bitkiler besinini kendileri yapar',
  'Fotosentez hayatın kaynağıdır',
].join('\n')
const FILLER_SONG = '[Verse 1]\nFotosentez kloroplastta olur\nKlorofil ışığı soğurur\n[Chorus]\nHadi bakalım'
const REWRITTEN = GOOD

const writeReply = (lyrics: string) => ({ title: 'Fotosentez Şarkısı', lyrics, musicPrompt: 'Upbeat pop, 110 bpm, Turkish lyrics.' })
const review = (over: Record<string, unknown> = {}) => ({ wrongLines: [], factLines: [1, 2, 5], grammarLines: [], fillerLines: [], notFunny: false, ...over })

test.describe('server write -> review -> one rewrite', () => {
  test('a clean song is reviewed once with the cheap model and never rewritten', async () => {
    const calls = stubOpenAi((call) => (call.kind === 'write' ? writeReply(GOOD) : review()))
    const { status, body } = await handleSongLyricsRequest(REQUEST)
    expect(status).toBe(200)
    expect(calls.map((call) => call.kind)).toEqual(['write', 'review'])
    expect(calls[1].model).toBe('gpt-6-luna')
    expect(calls[0].model).not.toBe('gpt-6-luna')
    expect(body).toMatchObject({ lyrics: GOOD, factCheckPassed: true, flaggedLines: [], factLines: [1, 2, 5], maxLyricsChars: 260 })
  })

  test('filler, missing facts and a too-short song trigger exactly one rewrite and a re-check', async () => {
    const calls = stubOpenAi((call, index) => {
      if (call.kind === 'write') return writeReply(FILLER_SONG)
      if (call.kind === 'rewrite') return { lyrics: REWRITTEN }
      return index === 1 ? review({ factLines: [1, 2, -1], fillerLines: [4] }) : review()
    })
    const { body } = await handleSongLyricsRequest(REQUEST)
    expect(calls.map((call) => call.kind)).toEqual(['write', 'review', 'rewrite', 'review'])
    expect(calls[2].text).toContain('filler_line_numbers')
    expect(calls[2].text).toContain('longer')
    expect(body).toMatchObject({ lyrics: REWRITTEN, factCheckPassed: true, factLines: [1, 2, 5] })
  })

  test('a rewrite that makes the facts worse is discarded and the original stays', async () => {
    stubOpenAi((call, index) => {
      if (call.kind === 'write') return writeReply(FILLER_SONG)
      if (call.kind === 'rewrite') return { lyrics: REWRITTEN }
      return index === 1 ? review({ factLines: [1, 2, -1], fillerLines: [4] }) : review({ factLines: [-1, -1, -1] })
    })
    const { body } = await handleSongLyricsRequest(REQUEST)
    expect((body as { lyrics: string }).lyrics).toBe(FILLER_SONG)
    expect((body as { factCheckPassed: boolean }).factCheckPassed).toBe(false)
  })

  test('when the review call fails the song is still returned, with no rewrite', async () => {
    const calls = stubOpenAi((call) => (call.kind === 'write' ? writeReply(GOOD) : 500))
    const { status, body } = await handleSongLyricsRequest(REQUEST)
    expect(status).toBe(200)
    expect(calls.map((call) => call.kind)).toEqual(['write', 'review'])
    expect((body as { lyrics: string }).lyrics).toBe(GOOD)
  })

  test('timeout safety: with little time left after writing, the rewrite is skipped (and the review too when almost out)', async () => {
    let skew = 0
    Date.now = () => ORIGINAL_NOW() + skew
    const slow = stubOpenAi((call) => {
      if (call.kind === 'write') {
        skew = 60_000 // the write took a minute: 20 s of the 80 s budget left
        return writeReply(FILLER_SONG)
      }
      return review({ fillerLines: [4] })
    })
    await handleSongLyricsRequest(REQUEST)
    expect(slow.map((call) => call.kind)).toEqual(['write', 'review'])

    skew = 0
    const slower = stubOpenAi((call) => {
      if (call.kind === 'write') {
        skew = 75_000 // 5 s left: not even the review runs
        return writeReply(FILLER_SONG)
      }
      return review()
    })
    const { status, body } = await handleSongLyricsRequest(REQUEST)
    expect(status).toBe(200)
    expect(slower.map((call) => call.kind)).toEqual(['write'])
    expect((body as { lyrics: string }).lyrics).toBe(FILLER_SONG)
  })

  test('the writer gets the facts plan as data and localized tags in its answer are mapped back', async () => {
    const calls = stubOpenAi((call) => (call.kind === 'write' ? writeReply(GOOD.replace('[Chorus]', '[Nakarat]').replace('[Verse 1]', '[Kıta 1]')) : review()))
    const { body } = await handleSongLyricsRequest({ ...REQUEST, factPlan: ['Klorofil ışığı soğurur', 'Calvin döngüsü glikoz üretir'] })
    expect(calls[0].text).toContain('fact_plan')
    expect(calls[0].text).toContain('Calvin döngüsü')
    expect((body as { lyrics: string }).lyrics).toBe(GOOD)
  })

  test('editing check returns the per-question lines and never rewrites', async () => {
    const calls = stubOpenAi(() => review({ factLines: [1, -1, 5], wrongLines: [2] }))
    const { body } = await handleSongLyricsRequest({ mode: 'check', lyrics: GOOD.replace('[Chorus]', '[Nakarat]'), keyFacts: FACTS, sourceExcerpt: '', language: 'tr' })
    expect(calls.map((call) => call.kind)).toEqual(['review'])
    expect(body).toMatchObject({ factCheckPassed: false, flaggedLines: [2], factLines: [1, -1, 5] })
    expect(calls[0].text).toContain('[Chorus]')
    expect(calls[0].text).not.toContain('Nakarat')
  })
})
