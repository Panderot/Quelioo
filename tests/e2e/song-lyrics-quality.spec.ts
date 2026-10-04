import { expect, test } from '@playwright/test'

import { handleSongLyricsRequest } from '../../api/_lib/song-lyrics'
import { buildSongCoverage } from '../../src/lib/songFacts'
import { generateJson } from '../../api/_lib/llm'
import { findFillerLines, findTermViolations, fitLyricsToLimits, isLyricsTooShort, maxCharsPerFactLine } from '../../src/lib/songLyricsQuality'
import {
  lyricsLimitsForTargetSeconds,
  MAX_FACTS_PER_SONG,
  splitFactsIntoSongs,
  targetSecondsForFactCount,
} from '../../src/lib/song'
import { orderSongsForList } from '../../src/lib/songStorage'
import type { StoredSong } from '../../src/lib/songStorage'
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

test.describe('source terms and claims', () => {
  const SOURCE = 'Bitkiler karbondioksit ve su kullanır. Stomalar yaprakta bulunur. Klorofil ışığı soğurur. Su miktarı fotosentez hızını etkiler.'

  test('a term cut short or replaced ("karbon gazı", "karbon") is flagged, the full term is not', () => {
    const lyrics = ['[Verse 1]', 'Karbon gazı azalırsa fotosentez hızı düşer', 'Stoma minik pencere, karbon misafiri alır', 'Karbondioksit stomadan girer', 'Stomalar yaprakta durur'].join('\n')
    expect(findTermViolations(lyrics, SOURCE)).toEqual([1, 2])
  })

  test('an absolute claim the source never makes is flagged, and allowed when the source makes it', () => {
    expect(findTermViolations('Işık yoksa süreç tamamen durur', SOURCE)).toEqual([0])
    expect(findTermViolations('Işık yoksa süreç tamamen durur', `${SOURCE} Işık yoksa süreç tamamen durur.`)).toEqual([])
    expect(findTermViolations('Water is never wasted here', SOURCE)).toEqual([0])
  })

  test('endings of a source word and section tags are not flagged', () => {
    expect(findTermViolations('[Chorus]\nStoma yaprakta, klorofil ışığı soğurur\nSu miktarı hızı etkiler', SOURCE)).toEqual([])
  })

  test('the server rewrites a wrong term even when the review found nothing, and flags it if it stays', async () => {
    const WRONG = GOOD.replace('karbondioksit', 'karbon gazı')
    const calls = stubOpenAi((call) => {
      if (call.kind === 'write') return writeReply(WRONG)
      if (call.kind === 'rewrite') return { lyrics: GOOD }
      return review()
    })
    const source = { ...REQUEST, sourceExcerpt: 'Fotosentez kloroplastta olur. Su ve karbondioksit kullanılır.' }
    const { body } = await handleSongLyricsRequest(source)
    expect(calls.map((call) => call.kind)).toEqual(['write', 'review', 'rewrite', 'review'])
    expect(calls[2].text).toContain('<wrong_line_numbers>3</wrong_line_numbers>')
    expect(body).toMatchObject({ lyrics: GOOD, factCheckPassed: true, flaggedLines: [] })

    stubOpenAi((call) => (call.kind === 'write' ? writeReply(WRONG) : call.kind === 'rewrite' ? { lyrics: WRONG } : review()))
    const stuck = (await handleSongLyricsRequest(source)).body as { factCheckPassed: boolean; flaggedLines: number[] }
    expect(stuck.factCheckPassed).toBe(false)
    expect(stuck.flaggedLines.length).toBeGreaterThan(0)
  })

  test('a part with no facts to cover never reaches the model and answers no_facts', async () => {
    const calls = stubOpenAi(() => writeReply(GOOD))
    const { status, body } = await handleSongLyricsRequest({ ...REQUEST, keyFacts: [] })
    expect(status).toBe(400)
    expect(body).toEqual({ error: 'no_facts' })
    expect(calls).toHaveLength(0)
  })
})

test('the Songs list keeps a quiz together, newest quiz first, and a series reads Song 1 then Song 2', () => {
  const song = (id: string, quizId: string, createdAt: string, seriesPart?: number) => ({ id, quizId, createdAt, ...(seriesPart ? { seriesPart } : {}) }) as unknown as StoredSong
  const songs = [song('b1', 'quiz-b', '2026-10-04T10:00:00Z'), song('a2', 'quiz-a', '2026-10-04T12:00:00Z', 2), song('a1', 'quiz-a', '2026-10-04T11:00:00Z', 1), song('b0', 'quiz-b', '2026-10-03T10:00:00Z')]
  expect(orderSongsForList(songs).map((entry) => entry.id)).toEqual(['a1', 'a2', 'b1', 'b0'])
})

test.describe('budget overflow and deadlines', () => {
  test('lyrics over the budget lose whole lines from the end, never half a line or a dangling tag', () => {
    const long = ['[Verse 1]', 'Birinci satir burada', 'Ikinci satir burada', '[Chorus]', 'Nakarat satiri burada', 'Son satir burada'].join('\n')
    const fitted = fitLyricsToLimits(long, 30, 60)
    expect(fitted.overflow).toBe(true)
    expect(fitted.lyrics).toBe(['[Verse 1]', 'Birinci satir burada', 'Ikinci satir burada'].join('\n'))
    expect(fitLyricsToLimits(long, 30, 500)).toEqual({ lyrics: long, overflow: false })
    expect(fitLyricsToLimits('[Verse 1]\nbir\n[Chorus]', 30, 13).lyrics).toBe('[Verse 1]\nbir')
  })

  test('each fact line gets a character budget that leaves room for every fact', () => {
    expect(maxCharsPerFactLine(800, 10)).toBeLessThan(800 / 10)
    expect(maxCharsPerFactLine(800, 10) * 10).toBeLessThan(800)
    expect(maxCharsPerFactLine(260, 4)).toBeGreaterThan(24)
  })

  test('a song that went over the limit is rewritten shorter instead of losing its last facts', async () => {
    const OVER = ['[Verse 1]', ...Array.from({ length: 6 }, (_, index) => `Bu cok uzun bir satir sayi ${index} ve fotosentez hakkinda`), '[Chorus]', 'Son nakarat satiri'].join('\n')
    const calls = stubOpenAi((call) => {
      if (call.kind === 'write') return writeReply(OVER)
      if (call.kind === 'rewrite') return { lyrics: GOOD }
      return review()
    })
    const { body } = await handleSongLyricsRequest(REQUEST)
    expect(calls.map((call) => call.kind)).toEqual(['write', 'review', 'rewrite', 'review'])
    expect(calls[2].text).toContain('shorter: every line shorter, no fact dropped')
    expect((body as { lyrics: string }).lyrics).toBe(GOOD)
    // A 30 s budget is too tight to split per line (the writer would only deliberate); a 90 s one is workable.
    expect(calls[0].text).not.toContain('Budget every line')
    const tenFacts = Array.from({ length: 10 }, (_, index) => `Soru ${index + 1}? — Cevap ${index + 1}`)
    const roomy = stubOpenAi((call) => (call.kind === 'write' ? writeReply(GOOD) : review()))
    await handleSongLyricsRequest({ ...REQUEST, keyFacts: tenFacts })
    expect(roomy[0].text).toContain('Never go over 800 characters')
  })

  test('a call with a deadline almost reached starts no provider attempt at all', async () => {
    const calls = stubOpenAi(() => writeReply(GOOD))
    const result = await generateJson({ system: 's', user: 'u', maxTokens: 100, deadlineAt: Date.now() + 1_000 })
    expect(result).toEqual({ status: 'error', error: 'upstream' })
    expect(calls).toHaveLength(0)
  })

  test('the write timeout follows the deadline, so a slow first provider cannot eat the fallback and the 90 s limit', async () => {
    const seen: number[] = []
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.LLM_PROVIDER_ORDER = 'openai'
    delete process.env.ANTHROPIC_API_KEY
    globalThis.fetch = (async (_url: unknown, init?: { signal?: AbortSignal }) => {
      seen.push(Date.now())
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    }) as typeof fetch
    const startedAt = Date.now()
    const result = await generateJson({ system: 's', user: 'u', maxTokens: 100, timeoutMs: 60_000, deadlineAt: startedAt + 5_000 })
    expect(result.status).toBe('error')
    expect(Date.now() - startedAt).toBeLessThan(8_000)
  })
})
