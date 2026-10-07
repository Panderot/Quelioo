// Real-API check of /api/song-lyrics (keys from .env.local, never printed). Lyrics only: no music is generated.
// Cases: fact coverage labels (factLines), exact source terms, a part with no facts, an English song, and the
// check mode on a lyric that shortens a term. The real cost is measured from token usage and the run stops at the budget.
//
//   npx tsx tests/accuracy/song-lyrics-check.ts [--budget=0.15] [--show=1]
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { handleSongLyricsRequest } from '../../api/_lib/song-lyrics'
import { textMatchesLanguage } from '../../src/lib/cardLanguage'
import { usageCostUsd } from '../../src/lib/lesson'
import { findTermViolations } from '../../src/lib/songLyricsQuality'

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=') as [string, string]))
const BUDGET = Number(args.budget ?? 0.15)
process.env.LLM_PROVIDER_ORDER = 'openai'
process.env.MUSIC_ENABLED = 'true'
process.env.MUSIC_PROVIDER = 'demo'
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const index = line.indexOf('=')
    if (index <= 0 || line.trim().startsWith('#')) continue
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    const key = line.slice(0, index).trim()
    if (value && process.env[key] === undefined) process.env[key] = value
  }
}
if (!process.env.OPENAI_API_KEY) {
  console.log('SKIPPED: no OPENAI_API_KEY')
  process.exit(0)
}

let spent = 0
let calls = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  if (spent >= BUDGET) throw new Error('budget reached')
  const response = await realFetch(url as string, init)
  if (String(url).includes('api.openai.com/v1/responses')) {
    try {
      const request = JSON.parse(String(init?.body ?? '{}')) as { model?: string }
      const json = (await response.clone().json()) as { usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } }
      const usage = json.usage ?? {}
      spent += usageCostUsd({ model: String(request.model ?? ''), inputTokens: usage.input_tokens ?? 0, cachedTokens: usage.input_tokens_details?.cached_tokens ?? 0, cacheWriteTokens: 0, outputTokens: usage.output_tokens ?? 0 })
      calls++
    } catch {
      // the handler reports its own failure
    }
  }
  return response
}) as typeof fetch
const quiet = console.log
console.log = (...parts: unknown[]) => {
  if (typeof parts[0] === 'string' && /^(llm|song-lyrics|cards|quiz|generate):/.test(parts[0])) return
  quiet(...parts)
}

const TR_FACTS = [
  'Fotosentez, bitkilerin ışık enerjisini kullanarak besin üretmesidir.',
  'Fotosentez kloroplastlarda gerçekleşir.',
  'Fotosentez için gerekli ham maddeler su ve karbondioksittir.',
  'Karbondioksit yaprakların alt yüzeyindeki stoma adlı gözeneklerden girer.',
  'Işığa bağımlı tepkimeler tilakoit zarlarında gerçekleşir ve su parçalanarak oksijen açığa çıkar.',
  'Fotosentezin ürünleri glikoz ve oksijendir.',
]
const TR_SOURCE = `${TR_FACTS.join(' ')} Calvin döngüsü kloroplastın stroma adlı sıvısında gerçekleşir.`
const TR_TERMS = ['kloroplast', 'karbondioksit', 'stoma', 'tilakoit', 'glikoz']
const EN_FACTS = [
  'The water cycle is the continuous movement of water between the ocean, the air and the land.',
  'Evaporation turns liquid water into water vapor when the sun heats it.',
  'Condensation turns water vapor into tiny droplets that form clouds.',
  'Precipitation is water falling from clouds as rain, snow or hail.',
  'Collection is when fallen water gathers in rivers, lakes and the ocean.',
]
const EN_SOURCE = EN_FACTS.join(' ')
const TAGS = new Set(['intro', 'verse', 'chorus', 'bridge', 'outro'])

const rows: { name: string; pass: boolean; detail: string }[] = []
const isTagLine = (line: string) => /^\s*\[[^\]]+\]\s*$/.test(line)

interface Lyrics {
  title: string
  lyrics: string
  factCheckPassed: boolean
  flaggedLines: number[]
  factLines?: number[]
  includedFactsCount: number
  totalFactsCount: number
  targetSeconds: number
  maxLyricsChars: number
}

async function write(name: string, payload: Record<string, unknown>): Promise<Lyrics | null> {
  const before = spent
  if (spent >= BUDGET) {
    rows.push({ name, pass: false, detail: 'skipped: budget reached' })
    return null
  }
  const { status, body } = await handleSongLyricsRequest({ style: 'pop', tone: 'normal', ...payload })
  if (status !== 200 || !('lyrics' in body)) {
    rows.push({ name, pass: false, detail: `HTTP ${status} ${'error' in body ? body.error : ''} $${(spent - before).toFixed(4)}` })
    return null
  }
  if (args.show) quiet(`\n# ${name}\n${body.lyrics}\nfactLines=${JSON.stringify(body.factLines)} flagged=${JSON.stringify(body.flaggedLines)} passed=${body.factCheckPassed}`)
  return body as Lyrics
}

/** Section labels are the English canonical ones, on their own line; every part has at least one sung line. */
function structureProblems(lyrics: string): string[] {
  const problems: string[] = []
  const lines = lyrics.split('\n')
  let sung = 0
  let open: string | null = null
  const closeSection = () => {
    if (open !== null && sung === 0) problems.push(`empty section ${open}`)
    sung = 0
  }
  for (const line of lines) {
    if (isTagLine(line)) {
      closeSection()
      open = line.trim()
      const word = line.replace(/[[\]]/g, '').trim().toLowerCase().split(/\s+/)[0]
      if (!TAGS.has(word)) problems.push(`unknown label ${line.trim()}`)
    } else if (line.trim()) sung++
  }
  closeSection()
  return problems
}

async function main() {
  const cost = (before: number) => `$${(spent - before).toFixed(4)}`

  // 1 + 2. Turkish song: coverage labels and exact source terms.
  let before = spent
  const tr = await write('Türkçe şarkı (6 olgu)', { quizTitle: 'Fotosentez', keyFacts: TR_FACTS, sourceExcerpt: TR_SOURCE, language: 'auto' })
  if (tr) {
    const lines = tr.lyrics.split('\n')
    const factLines = tr.factLines ?? []
    const labelsOk = factLines.length === tr.includedFactsCount && factLines.every((index) => index >= 0 && index < lines.length && !isTagLine(lines[index]) && lines[index].trim() !== '')
    const missing = factLines.filter((index) => index < 0).length
    rows.push({ name: 'Kapsama etiketleri (factLines: her olgu → satır)', pass: labelsOk, detail: `${factLines.length}/${tr.includedFactsCount} olgu etiketli, kapsanmayan=${missing}, includedFacts=${tr.includedFactsCount}/${tr.totalFactsCount}, ${cost(before)}` })
    const structure = structureProblems(tr.lyrics)
    rows.push({ name: 'Bölüm etiketleri (kanonik, boş bölüm yok)', pass: structure.length === 0, detail: structure.join('; ') || 'ok' })
    const violations = findTermViolations(tr.lyrics, [TR_SOURCE, ...TR_FACTS].join('\n'))
    const lower = tr.lyrics.toLocaleLowerCase('tr')
    const shortened = lower.includes('karbon gazı') || /karbon(?!dioksit)/.test(lower) ? ['karbon'] : []
    const present = TR_TERMS.filter((term) => lower.includes(term))
    rows.push({
      name: 'Kaynak terimleri bire bir (kısaltma/yasaklı ifade yok)',
      pass: violations.length === 0 && shortened.length === 0 && present.length >= 3,
      detail: `terimlerden geçen=${present.join(',')} ihlal satırları=${JSON.stringify(violations)} kısaltma=${shortened.join(',') || 'yok'} factCheckPassed=${tr.factCheckPassed}`,
    })
    const within = tr.lyrics.length <= tr.maxLyricsChars
    rows.push({ name: 'Satır/karakter sınırı', pass: within, detail: `${tr.lyrics.length}/${tr.maxLyricsChars} karakter, ${tr.targetSeconds} sn` })
  }

  // 3. A part with nothing to cover never reaches the model.
  before = spent
  for (const [label, keyFacts] of [['boş liste', []], ['yalnız boşluk', ['  ', '']]] as const) {
    const { status, body } = await handleSongLyricsRequest({ style: 'pop', tone: 'normal', quizTitle: 'Boş bölüm', keyFacts, sourceExcerpt: TR_SOURCE, language: 'auto' })
    rows.push({ name: `Boş bölüm (${label})`, pass: status === 400 && 'error' in body && body.error === 'no_facts' && spent === before, detail: `HTTP ${status} ${'error' in body ? body.error : 'sözler üretildi'}, model çağrısı yok=${spent === before}` })
  }

  // 4. English song.
  before = spent
  const en = await write('İngilizce şarkı (5 olgu)', { quizTitle: 'The Water Cycle', keyFacts: EN_FACTS, sourceExcerpt: EN_SOURCE, language: 'en' })
  if (en) {
    const sung = en.lyrics.split('\n').filter((line) => line.trim() && !isTagLine(line))
    const notEnglish = sung.filter((line) => textMatchesLanguage(line, 'en') === false).length
    const factLines = en.factLines ?? []
    const lines = en.lyrics.split('\n')
    const labelsOk = factLines.length === en.includedFactsCount && factLines.every((index) => index >= 0 && index < lines.length && !isTagLine(lines[index]))
    const structure = structureProblems(en.lyrics)
    rows.push({
      name: 'İngilizce şarkı: dil, etiketler, kapsama',
      pass: notEnglish === 0 && structure.length === 0 && labelsOk && /[a-z]/i.test(en.title),
      detail: `İngilizce olmayan satır=${notEnglish}/${sung.length}, ${structure.join('; ') || 'etiketler ok'}, kapsama=${JSON.stringify(factLines)}, factCheckPassed=${en.factCheckPassed}, ${cost(before)}`,
    })
  }

  // 5. Check mode flags a lyric that shortens a source term.
  before = spent
  if (spent < BUDGET) {
    const bad = '[Verse 1]\nBitkiler karbon gazı alır\nYapraklar hep güneşi arar\n[Chorus]\nFotosentez her zaman durmaz'
    const { status, body } = await handleSongLyricsRequest({ mode: 'check', lyrics: bad, keyFacts: TR_FACTS.slice(0, 3), sourceExcerpt: TR_SOURCE, language: 'tr' })
    const flagged = 'flaggedLines' in body ? body.flaggedLines : []
    rows.push({ name: 'Kontrol modu: "karbon gazı" ve "her zaman" işaretlenir', pass: status === 200 && 'factCheckPassed' in body && !body.factCheckPassed && flagged.length >= 1, detail: `HTTP ${status} flagged=${JSON.stringify(flagged)}, ${cost(before)}` })
  }
}

main()
  .catch((error) => quiet('ERROR', error instanceof Error ? error.message : error))
  .finally(() => {
    quiet('\nresult | case')
    for (const row of rows) quiet(`${row.pass ? 'PASS  ' : 'FAIL  '} | ${row.name} — ${row.detail}`)
    quiet(`\nreal cost: $${spent.toFixed(4)} over ${calls} provider calls (budget $${BUDGET.toFixed(2)})`)
    process.exit(rows.some((row) => !row.pass) ? 1 : 0)
  })
